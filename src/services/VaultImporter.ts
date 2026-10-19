import { createPatch } from "diff";
import { strFromU8 } from "fflate";
import type { WikiDatabase } from "@/db/database";
import type { ChangeEntry, Template, Wiki } from "@/db/types";
import { isImagePath } from "@/markdown/embeds";
import { convertFrontmatter, convertNote, noteTags, tagCategory, tagKey, vaultTitle, type NoteTargets } from "@/markdown/obsidian";
import { parseMarkdown } from "@/markdown/pipeline";
import { titleKey } from "@/markdown/wikilinks";
import { BUNDLED_TEMPLATES } from "@/templates";
import { freeName } from "./ArchiveService";
import type { AssetService } from "./AssetService";
import type { LinkIndexer } from "./LinkIndexer";
import { newPage } from "./PageService";
import { MAIN_PAGE_TITLE, type WikiService } from "./WikiService";
import { syncZipper, type Zipper } from "./zipper";

export interface VaultNote {
  // Inside the vault, without the folder the ZIP may wrap it in.
  path: string;
  folders: string[];
  title: string;
  source: string;
  tags: string[];
}

export interface VaultImage {
  path: string;
  data: Uint8Array;
}

export interface VaultTag {
  key: string;
  name: string;
  count: number;
}

// What a vault holds, read before anything is written so the tags can be chosen.
export interface VaultScan {
  name: string;
  notes: VaultNote[];
  templates: VaultNote[];
  images: VaultImage[];
  tags: VaultTag[];
  skipped: number;
}

export interface VaultImportOptions {
  name?: string;
  // Keys of the tags that become categories.
  categoryTags?: string[];
  onProgress?: (imagesDone: number, imagesTotal: number) => void;
}

const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  bmp: "image/bmp",
};

export const mimeFor = (path: string) => MIME_TYPES[path.split(".").at(-1)!.toLowerCase()] ?? "application/octet-stream";
const fileName = (path: string) => path.split("/").at(-1)!;
const withoutExtension = (path: string) => path.replace(/\.[^./]+$/, "");

// The folder every file sits in, when a vault was zipped from its own folder.
function wrappingFolder(paths: string[]): string | undefined {
  const [first] = paths;
  const folder = first?.split("/")[0];
  return folder && paths.every((path) => path.startsWith(`${folder}/`)) ? folder : undefined;
}

// Follows ./ and ../ in a path written inside a note, from that note's folder.
function resolvePath(folders: string[], path: string): string {
  const parts = /^\.\.?\//.test(path) ? [...folders] : [];
  for (const part of path.split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return parts.join("/");
}

const pathKey = (path: string) => path.normalize("NFC").toLowerCase();

// Shallow notes keep their names; a deeper note with a taken name gets its folder added, then a number.
function assignTitles(notes: Omit<VaultNote, "title" | "tags">[]): VaultNote[] {
  const taken = new Set<string>();
  const sorted = [...notes].sort((a, b) => a.folders.length - b.folders.length || a.path.localeCompare(b.path));
  return sorted.map((note) => {
    const base = vaultTitle(fileName(note.path));
    let title = base;
    if (taken.has(titleKey(title)) && note.folders.length) title = `${base} (${vaultTitle(note.folders.at(-1)!)})`;
    const stem = title;
    for (let n = 2; taken.has(titleKey(title)); n++) title = `${stem} (${n})`;
    taken.add(titleKey(title));
    return { ...note, title, tags: [] };
  });
}

function mainPageBody(vault: string, notes: VaultNote[]): string {
  const home = notes.find((note) => /^(readme|home|index|start here)$/i.test(note.title));
  return `This wiki was imported from the Obsidian vault **${vault}**.${home ? ` Start with [[${home.title}]].` : ""}\n`;
}

export class VaultImporter {
  constructor(
    private readonly db: WikiDatabase,
    private readonly links: LinkIndexer,
    private readonly assets: AssetService,
    private readonly wikis: WikiService,
    private readonly zipper: Zipper = syncZipper,
  ) {}

  async scan(data: Uint8Array, zipName = ""): Promise<VaultScan> {
    let unzipped: Record<string, Uint8Array>;
    try {
      unzipped = await this.zipper.unzip(data);
    } catch {
      throw new Error("This file isn't a ZIP");
    }
    const paths = Object.keys(unzipped).filter((path) => !path.endsWith("/") && !path.startsWith("__MACOSX/"));
    const folder = wrappingFolder(paths);
    const files = paths.map((path) => [folder ? path.slice(folder.length + 1) : path, unzipped[path]!] as const);

    const config = files.find(([path]) => path === ".obsidian/templates.json")?.[1];
    let templatesFolder = "";
    try {
      const folderSetting: unknown = config && JSON.parse(strFromU8(config)).folder;
      if (typeof folderSetting === "string") templatesFolder = folderSetting.replace(/^\/+|\/+$/g, "");
    } catch {
      // A broken settings file just means no templates folder.
    }

    // Obsidian keeps its settings, trash, and plugins in dot folders; none of that is content.
    const visible = files.filter(([path]) => !path.split("/").some((part) => part.startsWith(".")));
    const markdown = visible.filter(([path]) => /\.md$/i.test(path));
    if (!markdown.length) throw new Error("This ZIP has no notes in it (.md files)");
    const images = visible.filter(([path]) => isImagePath(path)).map(([path, data]) => ({ path, data }));

    const read = markdown.map(([path, data]) => ({
      path,
      folders: path.split("/").slice(0, -1),
      source: strFromU8(data).replace(/\r\n?/g, "\n"),
    }));
    const inTemplates = (path: string) => !!templatesFolder && path.startsWith(`${templatesFolder}/`);
    const notes = assignTitles(read.filter(({ path }) => !inTemplates(path)));
    const templates = assignTitles(read.filter(({ path }) => inTemplates(path)));

    const tags = new Map<string, VaultTag>();
    for (const note of notes) {
      note.tags = noteTags(note.source);
      for (const tag of note.tags) {
        const entry = tags.get(tagKey(tag)) ?? { key: tagKey(tag), name: tag, count: 0 };
        entry.count++;
        tags.set(entry.key, entry);
      }
    }

    return {
      name: folder ?? (zipName.replace(/\.zip$/i, "").trim() || "Obsidian vault"),
      notes,
      templates,
      images,
      tags: [...tags.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      skipped: visible.length - markdown.length - images.length,
    };
  }

  // Makes a new wiki from a scanned vault. If anything fails, the half-made wiki is removed.
  async importVault(scan: VaultScan, { name, categoryTags = [], onProgress }: VaultImportOptions = {}): Promise<Wiki> {
    const taken = new Set((await this.db.wikis.toArray()).map((wiki) => wiki.name.toLowerCase()));
    const wiki = await this.wikis.create(freeName(name?.trim() || scan.name, taken));
    try {
      await this.fill(wiki, scan, new Set(categoryTags), onProgress);
    } catch (cause) {
      await this.wikis.delete(wiki.id);
      throw cause;
    }
    return wiki;
  }

  private async fill(wiki: Wiki, scan: VaultScan, moved: Set<string>, onProgress: VaultImportOptions["onProgress"]): Promise<void> {
    // Images go first: encoding them can't happen inside the transaction that writes the pages.
    const assetPaths = new Map<string, string>();
    for (const [index, image] of scan.images.entries()) {
      try {
        const asset = await this.assets.addImage(wiki.id, new Blob([image.data as Uint8Array<ArrayBuffer>], { type: mimeFor(image.path) }), fileName(image.path));
        assetPaths.set(pathKey(image.path), asset.path);
      } catch {
        // An image that can't be stored leaves its embeds as text.
      }
      onProgress?.(index + 1, scan.images.length);
    }

    const targetsFor = (from: VaultNote) => this.targets(scan, assetPaths, from);
    const pages = scan.notes.map((note) => {
      const categories = [...note.folders.map(vaultTitle), ...note.tags.filter((tag) => moved.has(tagKey(tag))).map(tagCategory)];
      const body = convertFrontmatter(convertNote(note.source, targetsFor(note)), { categories, movedTags: moved });
      return newPage(crypto.randomUUID(), wiki.id, note.title, body);
    });
    if (!pages.some((page) => page.titleKey === titleKey(MAIN_PAGE_TITLE))) {
      pages.push(newPage(crypto.randomUUID(), wiki.id, MAIN_PAGE_TITLE, mainPageBody(scan.name, scan.notes)));
    }

    const templateNames = new Set(BUNDLED_TEMPLATES.map((template) => template.name.toLowerCase()));
    const templates = scan.templates.map((note): Template => {
      const body = convertFrontmatter(convertNote(note.source, targetsFor(note)), { categories: [], movedTags: new Set() });
      return { id: crypto.randomUUID(), wikiId: wiki.id, name: freeName(note.title, templateNames), body, frontmatter: parseMarkdown(body).frontmatter };
    });

    const at = Date.now();
    await this.db.transaction("rw", [this.db.pages, this.db.links, this.db.changes, this.db.templates], async () => {
      await this.db.pages.bulkAdd(pages);
      // Every page exists by now, so each link resolves as it's indexed.
      for (const page of pages) await this.links.indexPage(page, parseMarkdown(page.body).tree);
      await this.db.templates.bulkAdd(templates);
      await this.db.changes.bulkAdd(
        pages.map(
          (page): ChangeEntry => ({
            wikiId: wiki.id,
            pageId: page.id,
            pageTitle: page.title,
            kind: "create",
            author: "human",
            minor: false,
            summary: "Imported from Obsidian",
            diff: createPatch(page.id, "", page.body),
            at,
          }),
        ),
      );
    });
  }

  // Resolves links the way Obsidian does: a path names one note, and a bare name prefers the linking
  // note's own folder, then the shallowest match.
  private targets(scan: VaultScan, assetPaths: Map<string, string>, from: VaultNote): NoteTargets {
    const notesByPath = new Map(scan.notes.map((note) => [pathKey(withoutExtension(note.path)), note]));
    const findByPath = <T>(byPath: Map<string, T>, wanted: string) =>
      byPath.get(wanted) ?? [...byPath].find(([path]) => path.endsWith(`/${wanted}`))?.[1];
    const sameFolder = from.folders.join("/");

    return {
      link: (target) => {
        if (target.includes("/")) return findByPath(notesByPath, pathKey(resolvePath(from.folders, target)))?.title;
        const name = titleKey(vaultTitle(target));
        const matches = scan.notes.filter((note) => titleKey(vaultTitle(fileName(note.path))) === name);
        return (matches.find((note) => note.folders.join("/") === sameFolder) ?? matches[0])?.title;
      },
      image: (path) => {
        const wanted = pathKey(resolvePath(from.folders, path));
        const exact = assetPaths.get(wanted) ?? assetPaths.get(pathKey(path));
        if (exact) return exact;
        return findByPath(assetPaths, pathKey(fileName(path)));
      },
    };
  }
}
