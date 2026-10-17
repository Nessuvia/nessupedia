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
let wikiId: string;

beforeEach(async () => {
  db = new WikiDatabase(`test-${crypto.randomUUID()}`);
  links = new LinkIndexer(db);
  changes = new ChangeLog(db);
  pages = new PageService(db, links, changes);
  wikiId = (await new WikiService(db).create("Ashfall")).id;
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

  it("replaces a page's links on save", async () => {
    const theo = await pages.create({ wikiId, title: "Theo" });
    const mira = await pages.create({ wikiId, title: "Mira", body: "[[Theo]]" });
    await pages.save(mira.id, "No links now");
    expect(await links.backlinks(theo.id)).toEqual([]);
  });
});
