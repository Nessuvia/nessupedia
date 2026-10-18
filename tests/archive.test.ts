import { strFromU8, unzipSync } from "fflate";
import { beforeEach, describe, expect, it } from "vitest";
import { WikiDatabase } from "@/db/database";
import type { Asset } from "@/db/types";
import { ArchiveService, fileSafeName, type ArchiveManifest, type ArchivedChange } from "@/services/ArchiveService";
import { ChangeLog } from "@/services/ChangeLog";
import { LinkIndexer } from "@/services/LinkIndexer";
import { PageService } from "@/services/PageService";
import { TemplateService } from "@/services/TemplateService";
import { WikiService } from "@/services/WikiService";

let db: WikiDatabase;
let pages: PageService;
let templates: TemplateService;
let wikis: WikiService;
let archive: ArchiveService;
let wikiId: string;

const text = (files: Record<string, Uint8Array>, path: string) => strFromU8(files[path]!);
const manifestOf = (files: Record<string, Uint8Array>, folder = "") => JSON.parse(text(files, `${folder}wiki.json`)) as ArchiveManifest;
const changesOf = (files: Record<string, Uint8Array>) => JSON.parse(text(files, "changes.json")) as ArchivedChange[];

function asset(fields: Partial<Asset>): Asset {
  return {
    id: crypto.randomUUID(),
    wikiId,
    path: "assets/mira-0123456789.webp",
    mime: "image/webp",
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" }),
    hash: "0123456789abcdef",
    width: 640,
    height: 480,
    createdAt: 1,
    ...fields,
  };
}

beforeEach(async () => {
  db = new WikiDatabase(`test-${crypto.randomUUID()}`);
  const changes = new ChangeLog(db);
  pages = new PageService(db, new LinkIndexer(db), changes);
  templates = new TemplateService(db);
  wikis = new WikiService(db);
  archive = new ArchiveService(db);
  wikiId = (await wikis.create("Ashfall")).id;
});

describe("ArchiveService.serialize", () => {
  it("writes each page's source at its path, with titles and settings in wiki.json", async () => {
    const mira = await pages.create({ wikiId, title: "Mira", body: "---\naliases: [Mi]\n---\nShe keeps [[Theo]] close.\n" });
    await pages.create({ wikiId, title: "Mira/History", body: "## Childhood\n" });
    await db.pages.update(mira.id, { templateId: "bundled:character" });

    const files = await archive.serialize(wikiId);
    expect(text(files, "pages/Mira.md")).toBe("---\naliases: [Mi]\n---\nShe keeps [[Theo]] close.\n");
    expect(text(files, "pages/Mira/History.md")).toBe("## Childhood\n");

    const manifest = manifestOf(files);
    expect(manifest).toMatchObject({ format: "oc-wiki", version: 1, wiki: { name: "Ashfall", voice: "fandom" } });
    expect(manifest.wiki).not.toHaveProperty("id");
    expect(manifest.pages).toEqual([
      { key: mira.id, title: "Mira", path: "pages/Mira.md", templateId: "bundled:character", updatedAt: expect.any(Number) },
      { key: expect.any(String), title: "Mira/History", path: "pages/Mira/History.md", updatedAt: expect.any(Number) },
    ]);
  });

  it("gives pages whose titles share a file name their own paths", async () => {
    await pages.create({ wikiId, title: "Re: Zero" });
    await pages.create({ wikiId, title: "Re- Zero" });
    const { pages: archived } = manifestOf(await archive.serialize(wikiId));
    expect(archived.map(({ title, path }) => [title, path])).toEqual([
      ["Re- Zero", "pages/Re- Zero.md"],
      ["Re: Zero", "pages/Re- Zero (2).md"],
    ]);
  });

  it("writes user templates under templates/", async () => {
    const template = await templates.create(wikiId, "Faction", "---\ndescription: A group\n---\n## Members\n");
    const files = await archive.serialize(wikiId);
    expect(text(files, "templates/Faction.md")).toBe("---\ndescription: A group\n---\n## Members\n");
    expect(manifestOf(files).templates).toEqual([{ key: template.id, name: "Faction", path: "templates/Faction.md" }]);
  });

  it("writes assets at their embed paths, and originals only when the wiki keeps them", async () => {
    const original = new Blob([new Uint8Array([9, 9])], { type: "image/png" });
    await db.assets.add(asset({ original }));

    let files = await archive.serialize(wikiId);
    expect([...files["assets/mira-0123456789.webp"]!]).toEqual([1, 2, 3]);
    expect(Object.keys(files).some((path) => path.startsWith("assets/originals/"))).toBe(false);
    expect(manifestOf(files).assets).toEqual([
      { path: "assets/mira-0123456789.webp", mime: "image/webp", hash: "0123456789abcdef", width: 640, height: 480, createdAt: 1 },
    ]);

    await wikis.setKeepOriginalImages(wikiId, true);
    files = await archive.serialize(wikiId);
    expect([...files["assets/originals/mira-0123456789.png"]!]).toEqual([9, 9]);
    expect(manifestOf(files).assets[0]!.original).toEqual({ path: "assets/originals/mira-0123456789.png", mime: "image/png" });
  });

  it("includes history by page key, deleted pages too, and can leave it out or cut it by age", async () => {
    const mira = await pages.create({ wikiId, title: "Mira", body: "One\n" });
    await pages.save(mira.id, "Two\n", { summary: "Second" });
    const gone = await pages.create({ wikiId, title: "Gone", body: "Bye\n" });
    await pages.delete(gone.id);

    const changes = changesOf(await archive.serialize(wikiId));
    expect(changes.map(({ page, kind }) => [page, kind])).toEqual([
      [mira.id, "create"],
      [mira.id, "edit"],
      [gone.id, "create"],
      [gone.id, "delete"],
    ]);
    expect(changes[1]).toMatchObject({ summary: "Second", author: "human", minor: false, pageTitle: "Mira" });
    expect(changes[1]).not.toHaveProperty("id");
    expect(changes[1]).not.toHaveProperty("wikiId");

    expect(await archive.serialize(wikiId, { includeHistory: false })).not.toHaveProperty(["changes.json"]);

    const latest = (await db.changes.toArray()).at(-1)!;
    expect(changesOf(await archive.serialize(wikiId, { historySince: latest.at + 1 }))).toEqual([]);
    expect(changesOf(await archive.serialize(wikiId, { historySince: 0 }))).toHaveLength(4);
  });
});

describe("ArchiveService.exportZip", () => {
  it("puts each wiki in a folder named after it", async () => {
    await pages.create({ wikiId, title: "Mira", body: "Hi\n" });
    const other = await wikis.create("Noir: Draft");
    const twin = await wikis.create("noir- draft");

    const files = unzipSync(await archive.exportZip([wikiId, other.id, twin.id]));
    expect(text(files, "Ashfall/pages/Mira.md")).toBe("Hi\n");
    expect(manifestOf(files, "Noir- Draft/").wiki.name).toBe("Noir: Draft");
    expect(manifestOf(files, "noir- draft (2)/").wiki.name).toBe("noir- draft");
  });
});

describe("fileSafeName", () => {
  it("replaces characters file systems reject and trims trailing dots", () => {
    expect(fileSafeName('Who? "Me"/You...')).toBe("Who- -Me--You");
    expect(fileSafeName(" ... ")).toBe("untitled");
  });
});
