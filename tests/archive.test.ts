import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { beforeEach, describe, expect, it } from "vitest";
import { WikiDatabase } from "@/db/database";
import type { Asset } from "@/db/types";
import { ArchiveService, fileSafeName, type ArchiveManifest, type ArchivedChange } from "@/services/ArchiveService";
import { ChangeLog } from "@/services/ChangeLog";
import { LinkIndexer } from "@/services/LinkIndexer";
import { PageService } from "@/services/PageService";
import { TemplateService } from "@/services/TemplateService";
import { WikiService } from "@/services/WikiService";
import { transferables } from "@/services/zipper";

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
  archive = new ArchiveService(db, new LinkIndexer(db));
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

describe("ArchiveService.importZip", () => {
  // Everything a wiki holds: a version, a pair page, a template in use, auto-context, an image with its original, and a deleted page's history.
  async function fullWiki() {
    await db.wikis.update(wikiId, { keepOriginalImages: true, continuities: [{ id: "noir", name: "Noir AU", description: "Rain" }] });
    const template = await templates.create(wikiId, "Faction", "## Members\n<!-- Who belongs? -->\n");
    const mira = await pages.create({ wikiId, title: "Mira", body: "---\naliases: [Mi]\ncategories: [Leads]\n---\nShe trusts [[Theo]], not [[Corin]].\n" });
    await pages.save(mira.id, `${mira.body}\n![[assets/mira-0123456789.webp]]\n`, { minor: true, summary: "Portrait" });
    await pages.create({ wikiId, title: "Theo", body: "Knows [[Mi]].\n", templateId: template.id });
    await pages.create({ wikiId, title: "Mira/Noir AU", body: "---\nchanges: [A detective]\n---\nRain.\n" });
    await pages.create({ wikiId, title: "Mira & Theo", body: "---\nbetween: [Mira, Theo]\n---\nOld friends.\n" });
    await db.pages.update(mira.id, {
      autoContext: { enabled: true, extraTriggers: ["the courier"], match: "any", followDepth: 1, priority: 2, inject: "summary" },
    });
    const gone = await pages.create({ wikiId, title: "Gone", body: "Bye\n" });
    await pages.delete(gone.id);
    await db.assets.add(asset({ original: new Blob([new Uint8Array([9, 9])], { type: "image/png" }) }));
  }

  // Keys are export-time IDs, so they differ between exports; everything else must match.
  function withoutKeys(files: Record<string, Uint8Array>) {
    const manifest = manifestOf(files);
    const keys = new Map<string, string>();
    const keyOf = (key: string) => keys.get(key) ?? keys.set(key, `#${keys.size}`).get(key)!;
    return {
      files: Object.fromEntries(Object.entries(files).filter(([path]) => !path.endsWith(".json"))),
      wiki: { ...manifest.wiki, name: undefined },
      templates: manifest.templates.map((template) => ({ ...template, key: keyOf(template.key) })),
      pages: manifest.pages.map((page) => ({ ...page, key: keyOf(page.key), templateId: page.templateId && keyOf(page.templateId) })),
      assets: manifest.assets,
      changes: changesOf(files).map((change) => ({ ...change, page: keyOf(change.page) })),
    };
  }

  it("round-trips a wiki with no loss", async () => {
    await fullWiki();
    const [copy] = await archive.importZip(await archive.exportZip([wikiId]));
    expect(copy).toMatchObject({ name: "Ashfall (2)", keepOriginalImages: true, continuities: [{ name: "Noir AU", description: "Rain" }] });
    expect(copy!.id).not.toBe(wikiId);
    expect(withoutKeys(await archive.serialize(copy!.id))).toEqual(withoutKeys(await archive.serialize(wikiId)));
  });

  it("rebuilds the link index and maps templates to their new IDs", async () => {
    await fullWiki();
    const [copy] = await archive.importZip(await archive.exportZip([wikiId]));
    const copyPages = await db.pages.where("wikiId").equals(copy!.id).toArray();
    const titleOf = new Map(copyPages.map((page) => [page.id, page.title]));
    const links = await db.links.where("wikiId").equals(copy!.id).toArray();
    expect(links.map((link) => [titleOf.get(link.fromPageId), link.targetTitle, link.toPageId && titleOf.get(link.toPageId), link.field]).sort()).toEqual(
      [
        ["Mira", "Theo", "Theo", undefined],
        ["Mira", "Corin", undefined, undefined],
        ["Theo", "Mi", "Mira", undefined],
        ["Mira & Theo", "Mira", "Mira", "between"],
        ["Mira & Theo", "Theo", "Theo", "between"],
      ].sort(),
    );

    const theo = copyPages.find((page) => page.title === "Theo")!;
    const [faction] = await db.templates.where("wikiId").equals(copy!.id).toArray();
    expect(theo.templateId).toBe(faction!.id);
    expect(copyPages.find((page) => page.title === "Mira")).toMatchObject({ aliases: ["Mi"], categoryKeys: ["leads"] });
  });

  it("keeps a deleted page's history together under an ID no page has", async () => {
    await fullWiki();
    const [copy] = await archive.importZip(await archive.exportZip([wikiId]));
    const changes = await db.changes.where("wikiId").equals(copy!.id).toArray();
    const goneIds = new Set(changes.filter((change) => change.pageTitle === "Gone").map((change) => change.pageId));
    expect(goneIds.size).toBe(1);
    expect(await db.pages.get([...goneIds][0]!)).toBeUndefined();
  });

  it("imports every wiki in an export of all wikis, numbering names in use", async () => {
    await pages.create({ wikiId, title: "Mira" });
    const other = await wikis.create("Second Wiki");
    const imported = await archive.importZip(await archive.exportZip([wikiId, other.id]));
    expect(imported.map(({ name }) => name)).toEqual(["Ashfall (2)", "Second Wiki (2)"]);
    const again = await archive.importZip(await archive.exportZip([wikiId]));
    expect(again.map(({ name }) => name)).toEqual(["Ashfall (3)"]);
  });

  it("accepts a ZIP with wiki.json at the top", async () => {
    await pages.create({ wikiId, title: "Mira", body: "Hi\n" });
    const files = await archive.serialize(wikiId);
    const [copy] = await archive.importZip(zipSync(files));
    expect(await pages.getByTitle(copy!.id, "Mira")).toMatchObject({ body: "Hi\n" });
  });

  it("refuses damaged exports without writing anything", async () => {
    await pages.create({ wikiId, title: "Mira" });
    const files = await archive.serialize(wikiId);
    const manifest = manifestOf(files);
    const withManifest = (changes: Partial<ArchiveManifest>) => zipSync({ ...files, "wiki.json": strToU8(JSON.stringify({ ...manifest, ...changes })) });
    const { "pages/Mira.md": _mira, ...missingPage } = files;

    await expect(archive.importZip(strToU8("not a zip"))).rejects.toThrow("isn't a ZIP");
    await expect(archive.importZip(zipSync({ "notes.md": strToU8("Hi") }))).rejects.toThrow("has no wiki.json");
    await expect(archive.importZip(withManifest({ version: 99 }))).rejects.toThrow("newer version");
    await expect(archive.importZip(withManifest({ format: "other" as "oc-wiki" }))).rejects.toThrow("isn't from an OC Wiki export");
    await expect(archive.importZip(zipSync(missingPage))).rejects.toThrow("missing pages/Mira.md");
    await expect(archive.importZip(withManifest({ pages: [{ ...manifest.pages[0]!, title: "Mi[ra" }] }))).rejects.toThrow('"Mi[ra"');
    await expect(archive.importZip(zipSync({ ...files, "changes.json": strToU8("{") }))).rejects.toThrow("changes.json");
    expect(await db.wikis.count()).toBe(1);
  });
});

describe("transferables", () => {
  it("lists each underlying buffer once, so views sharing one don't fail the transfer", () => {
    const shared = new Uint8Array(8);
    const own = new Uint8Array(2);
    expect(transferables([shared.subarray(0, 4), shared.subarray(4), own])).toEqual([shared.buffer, own.buffer]);
  });
});

describe("fileSafeName", () => {
  it("replaces characters file systems reject and trims trailing dots", () => {
    expect(fileSafeName('Who? "Me"/You...')).toBe("Who- -Me--You");
    expect(fileSafeName(" ... ")).toBe("untitled");
  });
});
