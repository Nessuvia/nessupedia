import { beforeEach, describe, expect, it } from "vitest";
import { WikiDatabase } from "@/db/database";
import { ChangeLog } from "@/services/ChangeLog";
import { LinkIndexer } from "@/services/LinkIndexer";
import { PageService } from "@/services/PageService";
import { WikiService } from "@/services/WikiService";

let db: WikiDatabase;
let links: LinkIndexer;
let changes: ChangeLog;
let pages: PageService;
let wikis: WikiService;
let wikiId: string;

beforeEach(async () => {
  db = new WikiDatabase(`test-${crypto.randomUUID()}`);
  links = new LinkIndexer(db);
  changes = new ChangeLog(db);
  pages = new PageService(db, links, changes);
  wikis = new WikiService(db);
  wikiId = (await wikis.create("Ashfall")).id;
});

describe("WikiService", () => {
  it("renames a wiki and rejects blank names", async () => {
    expect(await wikis.rename(wikiId, "  Ashfall Saga ")).toMatchObject({ name: "Ashfall Saga" });
    expect(await wikis.get(wikiId)).toMatchObject({ name: "Ashfall Saga" });
    await expect(wikis.rename(wikiId, "   ")).rejects.toThrow("needs a name");
    await expect(wikis.create("")).rejects.toThrow("needs a name");
  });

  it("deletes a wiki with all of its data and leaves other wikis alone", async () => {
    const other = await wikis.create("Other");
    await pages.create({ wikiId, title: "Mira", body: "[[Theo]]" });
    const kept = await pages.create({ wikiId: other.id, title: "Mira", body: "[[Theo]]" });
    await db.templates.bulkAdd([
      { id: "own", wikiId, name: "Own", body: "", frontmatter: {} },
      { id: "bundled", name: "Character", body: "", frontmatter: {} },
    ]);

    await wikis.delete(wikiId);

    expect(await wikis.list()).toEqual([other]);
    expect(await db.pages.toArray()).toEqual([kept]);
    expect(await db.links.where("wikiId").equals(wikiId).count()).toBe(0);
    expect(await db.changes.where("wikiId").equals(wikiId).count()).toBe(0);
    expect(await db.links.where("wikiId").equals(other.id).count()).toBe(1);
    expect((await db.templates.toArray()).map((template) => template.id)).toEqual(["bundled"]);
  });
});

describe("PageService", () => {
  it("creates a page with frontmatter aliases and a change entry", async () => {
    const page = await pages.create({ wikiId, title: "Mira", body: "---\naliases: [Mi]\n---\n\nHello" });
    expect(page.aliases).toEqual(["Mi"]);
    expect(page.path).toBe("pages/Mira.md");
    expect(await pages.getByTitle(wikiId, "Mi")).toMatchObject({ id: page.id });

    const [entry] = await changes.listForPage(page.id);
    expect(entry).toMatchObject({ author: "human", summary: "Created page" });
    expect(entry.diff).toContain("+Hello");
  });

  it("rejects duplicate titles", async () => {
    await pages.create({ wikiId, title: "Mira" });
    await expect(pages.create({ wikiId, title: "Mira" })).rejects.toThrow("already exists");
  });

  it("hides minor edits from the default feed", async () => {
    const page = await pages.create({ wikiId, title: "Mira", body: "One" });
    await pages.save(page.id, "Two", { minor: true });
    await pages.save(page.id, "Three", { summary: "Rewrite" });

    expect((await changes.list(wikiId)).map((entry) => entry.summary)).toEqual(["Rewrite", "Created page"]);
    expect(await changes.list(wikiId, { includeMinor: true })).toHaveLength(3);
  });
});

describe("LinkIndexer", () => {
  it("indexes red links and resolves them when the target is created", async () => {
    const mira = await pages.create({ wikiId, title: "Mira", body: "Friends with [[Theo]] and [[Theo|him]]." });
    expect(await links.redLinks(wikiId)).toMatchObject([{ fromPageId: mira.id, targetTitle: "Theo" }]);

    const theo = await pages.create({ wikiId, title: "Theo" });
    expect(await links.redLinks(wikiId)).toEqual([]);
    expect(await links.backlinks(theo.id)).toMatchObject([{ fromPageId: mira.id }]);
  });

  it("matches titles and aliases regardless of case", async () => {
    const mira = await pages.create({ wikiId, title: "Mira", body: "Writes to [[theo]], [[THEO]], and [[the  archivist]]." });
    const theo = await pages.create({ wikiId, title: "Theo", body: "---\naliases: [The Archivist]\n---\n\nSee [[mira]]." });

    expect(await links.redLinks(wikiId)).toEqual([]);
    expect(await links.backlinks(theo.id)).toMatchObject([
      { fromPageId: mira.id, targetTitle: "theo" },
      { fromPageId: mira.id, targetTitle: "the  archivist" },
    ]);
    expect(await links.backlinks(mira.id)).toMatchObject([{ fromPageId: theo.id }]);
    expect(await pages.getByTitle(wikiId, "THE ARCHIVIST")).toMatchObject({ id: theo.id });
    await expect(pages.create({ wikiId, title: "MIRA" })).rejects.toThrow("already exists");
  });

  it("replaces a page's links on save", async () => {
    const theo = await pages.create({ wikiId, title: "Theo" });
    const mira = await pages.create({ wikiId, title: "Mira", body: "[[Theo]]" });
    await pages.save(mira.id, "No links now");
    expect(await links.backlinks(theo.id)).toEqual([]);
  });
});
