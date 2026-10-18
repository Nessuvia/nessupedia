import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import type { Root } from "mdast";
import type { WikiDatabase } from "@/db/database";
import type { Asset, AutoContextSettings, ChangeEntry, Page, Template, Wiki } from "@/db/types";
import { parseMarkdown } from "@/markdown/pipeline";
import { titleKey } from "@/markdown/wikilinks";
import { isBundled } from "@/templates";
import { extensionFor } from "./AssetService";
import type { LinkIndexer } from "./LinkIndexer";
import { frontmatterFields, pathForTitle, requireTitle } from "./PageService";

export const ARCHIVE_FORMAT = "oc-wiki";
export const ARCHIVE_VERSION = 1;

// wiki.json: the wiki's settings plus what the markdown files can't hold, such as titles that don't fit a file name.
export interface ArchiveManifest {
  format: typeof ARCHIVE_FORMAT;
  version: number;
  wiki: Omit<Wiki, "id">;
  pages: ArchivedPage[];
  templates: ArchivedTemplate[];
  assets: ArchivedAsset[];
}

// Keys are the IDs at export time. They only tie entries together inside the archive; import makes new IDs.
export interface ArchivedPage {
  key: string;
  title: string;
  path: string;
  templateId?: string;
  autoContext?: AutoContextSettings;
  updatedAt: number;
}

export interface ArchivedTemplate {
  key: string;
  name: string;
  path: string;
}

export interface ArchivedAsset {
  path: string;
  mime: string;
  hash: string;
  width?: number;
  height?: number;
  original?: { path: string; mime: string };
  createdAt: number;
}

// changes.json entries name their page by key, so a deleted page's history still hangs together.
export type ArchivedChange = Omit<ChangeEntry, "id" | "wikiId" | "pageId"> & { page: string };

export interface ExportOptions {
  includeHistory?: boolean;
  // Leaves out changes made before this time.
  historySince?: number;
}

export type ArchiveFiles = Record<string, Uint8Array>;

export function fileSafeName(name: string): string {
  const safe = name
    .replace(/[\\/:*?"<>|]/g, "-")
    .trim()
    .replace(/[. ]+$/, "");
  return safe || "untitled";
}

// Hands out each path once, case-insensitively, so archives extract cleanly on Windows and macOS.
class PathClaims {
  private readonly taken = new Set<string>();

  claim(path: string): string {
    const dot = path.lastIndexOf(".");
    const [stem, extension] = dot > path.lastIndexOf("/") ? [path.slice(0, dot), path.slice(dot)] : [path, ""];
    let candidate = path;
    for (let n = 2; this.taken.has(candidate.toLowerCase()); n++) candidate = `${stem} (${n})${extension}`;
    this.taken.add(candidate.toLowerCase());
    return candidate;
  }
}

const json = (value: unknown) => strToU8(`${JSON.stringify(value, null, 2)}\n`);
const bytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

interface ReadArchive {
  manifest: ArchiveManifest;
  changes: ArchivedChange[];
  files: ArchiveFiles;
}

function fileIn(files: ArchiveFiles, path: string): Uint8Array {
  const file = files[path];
  if (!file) throw new Error(`The export is missing ${path}`);
  return file;
}

function parseJson(files: ArchiveFiles, path: string): unknown {
  try {
    return JSON.parse(strFromU8(fileIn(files, path)));
  } catch (cause) {
    if (cause instanceof SyntaxError) throw new Error(`${path} in the export isn't valid JSON`);
    throw cause;
  }
}

// Checks everything before anything is written, so a damaged export imports nothing.
function readArchive(files: ArchiveFiles): ReadArchive {
  const manifest = parseJson(files, "wiki.json") as Partial<ArchiveManifest> | null;
  if (manifest?.format !== ARCHIVE_FORMAT || typeof manifest.version !== "number") throw new Error("wiki.json isn't from an OC Wiki export");
  if (manifest.version > ARCHIVE_VERSION) throw new Error("This export comes from a newer version of OC Wiki");
  if (typeof manifest.wiki?.name !== "string" || ![manifest.pages, manifest.templates, manifest.assets].every(Array.isArray)) {
    throw new Error("wiki.json is missing its wiki, pages, templates, or assets");
  }
  const changes = files["changes.json"] ? parseJson(files, "changes.json") : [];
  if (!Array.isArray(changes)) throw new Error("changes.json in the export isn't a list of changes");

  const read = { manifest: manifest as ArchiveManifest, changes: changes as ArchivedChange[], files };
  const keys = new Set<string>();
  for (const page of read.manifest.pages) {
    try {
      requireTitle(page.title);
    } catch (cause) {
      throw new Error(`Can't import the page "${page.title}": ${(cause as Error).message}`);
    }
    const key = titleKey(page.title);
    if (keys.has(key)) throw new Error(`The export has two pages titled "${page.title}"`);
    keys.add(key);
    fileIn(files, page.path);
  }
  for (const template of read.manifest.templates) fileIn(files, template.path);
  for (const asset of read.manifest.assets) {
    fileIn(files, asset.path);
    if (asset.original) fileIn(files, asset.original.path);
  }
  return read;
}

// Splits a ZIP into the wikis it holds: each folder with a wiki.json, or the ZIP itself when it holds one at the top.
function wikisIn(files: ArchiveFiles): ArchiveFiles[] {
  const prefixes = Object.keys(files)
    .filter((path) => path === "wiki.json" || path.endsWith("/wiki.json"))
    .map((path) => path.slice(0, -"wiki.json".length))
    .sort();
  return prefixes.map((prefix) =>
    Object.fromEntries(
      Object.entries(files)
        .filter(([path]) => path.startsWith(prefix))
        .map(([path, data]) => [path.slice(prefix.length), data]),
    ),
  );
}

function freeName(name: string, taken: Set<string>): string {
  let candidate = name;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${name} (${n})`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

export class ArchiveService {
  constructor(
    private readonly db: WikiDatabase,
    private readonly links: LinkIndexer,
  ) {}

  // One wiki's files, with paths relative to its folder.
  async serialize(wikiId: string, { includeHistory = true, historySince }: ExportOptions = {}): Promise<ArchiveFiles> {
    const wiki = await this.db.wikis.get(wikiId);
    if (!wiki) throw new Error(`Wiki ${wikiId} not found`);
    const [pages, templates, assets] = await Promise.all([
      this.db.pages.where("wikiId").equals(wikiId).sortBy("title"),
      this.db.templates.where("wikiId").equals(wikiId).sortBy("name"),
      this.db.assets.where("wikiId").equals(wikiId).sortBy("path"),
    ]);

    const files: ArchiveFiles = {};
    const paths = new PathClaims();
    for (const reserved of ["wiki.json", "changes.json"]) paths.claim(reserved);

    const { id: _id, ...settings } = wiki;
    const manifest: ArchiveManifest = { format: ARCHIVE_FORMAT, version: ARCHIVE_VERSION, wiki: settings, pages: [], templates: [], assets: [] };

    for (const page of pages) {
      const path = paths.claim(page.path);
      files[path] = strToU8(page.body);
      manifest.pages.push({
        key: page.id,
        title: page.title,
        path,
        ...(page.templateId && { templateId: page.templateId }),
        ...(page.autoContext && { autoContext: page.autoContext }),
        updatedAt: page.updatedAt,
      });
    }

    for (const template of templates) {
      const path = paths.claim(`templates/${fileSafeName(template.name)}.md`);
      files[path] = strToU8(template.body);
      manifest.templates.push({ key: template.id, name: template.name, path });
    }

    // Asset paths are written into page embeds, so they keep their exact path.
    for (const asset of assets) {
      const path = paths.claim(asset.path);
      files[path] = await bytes(asset.blob);
      const entry: ArchivedAsset = { path, mime: asset.mime, hash: asset.hash, createdAt: asset.createdAt };
      if (asset.width !== undefined) entry.width = asset.width;
      if (asset.height !== undefined) entry.height = asset.height;
      if (wiki.keepOriginalImages && asset.original) {
        const name = path.slice("assets/".length).replace(/\.[^.]*$/, "");
        const originalPath = paths.claim(`assets/originals/${name}.${extensionFor(asset.original.type)}`);
        files[originalPath] = await bytes(asset.original);
        entry.original = { path: originalPath, mime: asset.original.type };
      }
      manifest.assets.push(entry);
    }

    files["wiki.json"] = json(manifest);

    if (includeHistory) {
      const changes = await this.db.changes.where("wikiId").equals(wikiId).sortBy("id");
      files["changes.json"] = json(
        changes
          .filter((change) => historySince === undefined || change.at >= historySince)
          .map(({ id: _changeId, wikiId: _wikiId, pageId, ...change }): ArchivedChange => ({ page: pageId, ...change })),
      );
    }
    return files;
  }

  // Each wiki gets its own folder named after it.
  async exportZip(wikiIds: string[], options: ExportOptions = {}): Promise<Uint8Array<ArrayBuffer>> {
    const folders = new PathClaims();
    const zippable: Zippable = {};
    for (const wikiId of wikiIds) {
      const wiki = await this.db.wikis.get(wikiId);
      if (!wiki) throw new Error(`Wiki ${wikiId} not found`);
      const folder = folders.claim(fileSafeName(wiki.name));
      for (const [path, data] of Object.entries(await this.serialize(wikiId, options))) {
        // Images are already compressed, so only text is deflated.
        zippable[`${folder}/${path}`] = [data, { level: /\.(md|json)$/.test(path) ? 6 : 0 }];
      }
    }
    // fflate types its output loosely, but it always allocates a plain ArrayBuffer, which Blob needs.
    return zipSync(zippable) as Uint8Array<ArrayBuffer>;
  }

  // Every wiki in the ZIP becomes a new wiki; a name already in use gets a number.
  async importZip(data: Uint8Array): Promise<Wiki[]> {
    let files: ArchiveFiles;
    try {
      files = unzipSync(data);
    } catch {
      throw new Error("This file isn't a ZIP");
    }
    const archives = wikisIn(files).map(readArchive);
    if (!archives.length) throw new Error("This ZIP isn't an OC Wiki export: it has no wiki.json");

    const tables = [this.db.wikis, this.db.pages, this.db.links, this.db.changes, this.db.assets, this.db.templates];
    return this.db.transaction("rw", tables, async () => {
      const taken = new Set((await this.db.wikis.toArray()).map(({ name }) => name.toLowerCase()));
      const wikis: Wiki[] = [];
      for (const archive of archives) wikis.push(await this.restore(archive, freeName(archive.manifest.wiki.name, taken)));
      return wikis;
    });
  }

  private async restore({ manifest, changes, files }: ReadArchive, name: string): Promise<Wiki> {
    const wiki: Wiki = { ...manifest.wiki, id: crypto.randomUUID(), name };
    await this.db.wikis.add(wiki);
    const wikiId = wiki.id;

    const templateIds = new Map<string, string>();
    const templates = manifest.templates.map((entry): Template => {
      const body = strFromU8(fileIn(files, entry.path));
      const id = crypto.randomUUID();
      templateIds.set(entry.key, id);
      return { id, wikiId, name: entry.name, body, frontmatter: parseMarkdown(body).frontmatter };
    });
    await this.db.templates.bulkAdd(templates);

    const pageIds = new Map<string, string>();
    const parsed = manifest.pages.map((entry): [Page, Root] => {
      const title = requireTitle(entry.title);
      const body = strFromU8(fileIn(files, entry.path));
      const { tree, frontmatter } = parseMarkdown(body);
      const templateId = entry.templateId && (isBundled({ id: entry.templateId }) ? entry.templateId : templateIds.get(entry.templateId));
      const page: Page = {
        id: crypto.randomUUID(),
        wikiId,
        title,
        titleKey: titleKey(title),
        ...frontmatterFields(frontmatter),
        path: pathForTitle(title),
        ...(templateId && { templateId }),
        ...(entry.autoContext && { autoContext: entry.autoContext }),
        frontmatter,
        body,
        updatedAt: entry.updatedAt ?? Date.now(),
      };
      pageIds.set(entry.key, page.id);
      return [page, tree];
    });
    await this.db.pages.bulkAdd(parsed.map(([page]) => page));
    // Every page exists by now, so each link resolves as it's indexed.
    for (const [page, tree] of parsed) await this.links.indexPage(page, tree);

    const assets = manifest.assets.map(
      (entry): Asset => ({
        id: crypto.randomUUID(),
        wikiId,
        path: entry.path,
        mime: entry.mime,
        blob: new Blob([fileIn(files, entry.path) as Uint8Array<ArrayBuffer>], { type: entry.mime }),
        hash: entry.hash,
        ...(entry.width !== undefined && { width: entry.width }),
        ...(entry.height !== undefined && { height: entry.height }),
        ...(entry.original && {
          original: new Blob([fileIn(files, entry.original.path) as Uint8Array<ArrayBuffer>], { type: entry.original.mime }),
        }),
        createdAt: entry.createdAt,
      }),
    );
    await this.db.assets.bulkAdd(assets);

    // Deleted pages have no page entry, so their keys get fresh IDs of their own.
    const idFor = (key: string) => pageIds.get(key) ?? pageIds.set(key, crypto.randomUUID()).get(key)!;
    await this.db.changes.bulkAdd(changes.map(({ page, ...change }): ChangeEntry => ({ ...change, wikiId, pageId: idFor(page) })));
    return wiki;
  }
}
