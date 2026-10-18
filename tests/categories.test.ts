import Dexie from "dexie";
import { beforeEach, describe, expect, it } from "vitest";
import { WikiDatabase } from "@/db/database";
import { pageCategories } from "@/markdown/categories";
import { CategoryService } from "@/services/CategoryService";
import { ChangeLog } from "@/services/ChangeLog";
import { LinkIndexer } from "@/services/LinkIndexer";
import { PageService } from "@/services/PageService";
import { WikiService } from "@/services/WikiService";

let db: WikiDatabase;
let pages: PageService;
let categories: CategoryService;
let wikis: WikiService;
let wikiId: string;

beforeEach(async () => {
  db = new WikiDatabase(`test-${crypto.randomUUID()}`);
  pages = new PageService(db, new LinkIndexer(db), new ChangeLog(db));
  categories = new CategoryService(db);
  wikis = new WikiService(db);
  wikiId = (await wikis.create("Ashfall")).id;
});

const withCategories = (list: string, body = "") => `---\ncategories: ${list}\n---\n${body}`;

describe("pageCategories", () => {
  it("accepts a list or a single name, trims, and keeps the first spelling of repeats", () => {
    expect(pageCategories({ categories: [" Characters ", "Main cast", "characters"] })).toEqual(["Characters", "Main cast"]);
    expect(pageCategories({ categories: "Places" })).toEqual(["Places"]);
  });

  it("skips names that break title rules and values that aren't names", () => {
    expect(pageCategories({ categories: ["", "A|B", "Ok", 7, null] })).toEqual(["Ok"]);
    expect(pageCategories({})).toEqual([]);
  });
});

describe("CategoryService", () => {
  it("lists a category's pages by title, ignoring case and other wikis", async () => {
    await pages.create({ wikiId, title: "Theo", body: withCategories("[characters]") });
    await pages.create({ wikiId, title: "Mira", body: withCategories("[Characters, Main cast]") });
    await pages.create({ wikiId, title: "Harrow", body: withCategories("Places") });
    const other = await wikis.create("Other");
    await pages.create({ wikiId: other.id, title: "Elsewhere", body: withCategories("Characters") });

    expect((await categories.pagesIn(wikiId, "CHARACTERS")).map((page) => page.title)).toEqual(["Mira", "Theo"]);
    expect(await categories.pagesIn(wikiId, "Nobody")).toEqual([]);
  });

  it("counts pages per category under the most common spelling", async () => {
    await pages.create({ wikiId, title: "Mira", body: withCategories("[Characters, Main cast]") });
    await pages.create({ wikiId, title: "Theo", body: withCategories("[characters]") });
    await pages.create({ wikiId, title: "Ash", body: withCategories("[Characters]") });

    expect(await categories.list(wikiId)).toEqual([
      { key: "characters", name: "Characters", count: 3 },
      { key: "main cast", name: "Main cast", count: 1 },
    ]);
  });

  it("follows saves that change a page's categories", async () => {
    const mira = await pages.create({ wikiId, title: "Mira", body: withCategories("Characters") });
    await pages.save(mira.id, withCategories("Villains"));

    expect(await categories.pagesIn(wikiId, "Characters")).toEqual([]);
    expect((await categories.pagesIn(wikiId, "Villains")).map((page) => page.title)).toEqual(["Mira"]);
    expect(await categories.list(wikiId)).toEqual([{ key: "villains", name: "Villains", count: 1 }]);
  });
});

describe("database version 3", () => {
  it("indexes categories of existing pages and drops spinoffOf", async () => {
    const name = `test-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(2).stores({
      wikis: "id, name",
      pages: "id, wikiId, [wikiId+titleKey], *aliasKeys, [wikiId+path], spinoffOf, updatedAt",
      links: "++id, wikiId, fromPageId, toPageId, [wikiId+targetKey]",
      changes: "++id, wikiId, pageId, at, minor",
      assets: "id, wikiId, [wikiId+path], [wikiId+hash]",
      templates: "id, wikiId, name",
      runs: "id, wikiId, pageId, startedAt",
    });
    await old.table("pages").add({
      id: "mira",
      wikiId: "w",
      title: "Mira",
      titleKey: "mira",
      aliases: [],
      aliasKeys: [],
      path: "pages/Mira.md",
      spinoffOf: "theo",
      frontmatter: { categories: ["Characters"] },
      body: "",
      updatedAt: 0,
    });
    old.close();

    const upgraded = new WikiDatabase(name);
    const page = await upgraded.pages.get("mira");
    expect(page?.categoryKeys).toEqual(["characters"]);
    expect(page).not.toHaveProperty("spinoffOf");
    expect(await upgraded.pages.where("categoryKeys").equals("characters").count()).toBe(1);
  });
});
