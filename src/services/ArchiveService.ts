import { strToU8, zipSync, type Zippable } from "fflate";
import type { WikiDatabase } from "@/db/database";
import type { AutoContextSettings, ChangeEntry, Wiki } from "@/db/types";
import { extensionFor } from "./AssetService";

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

export class ArchiveService {
  constructor(private readonly db: WikiDatabase) {}

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
}
