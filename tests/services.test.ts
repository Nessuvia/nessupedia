import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WikiDatabase } from "@/db/database";
import { ChangeLog, MERGE_WINDOW, sourceBefore } from "@/services/ChangeLog";
import { LinkIndexer } from "@/services/LinkIndexer";
import { PageService } from "@/services/PageService";
import { SearchService } from "@/services/SearchService";
import { WikiService } from "@/services/WikiService";

let db: WikiDatabase;
let links: LinkIndexer;
let changes: ChangeLog;
let pages: PageService;
let search: SearchService;
let wikis: WikiService;
let wikiId: string;

// Only Date is faked, so Dexie's own timers keep running.
const later = (ms: number) => vi.setSystemTime(Date.now() + ms);

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  db = new WikiDatabase(`test-${crypto.randomUUID()}`);
  links = new LinkIndexer(db);
  changes = new ChangeLog(db);
  pages = new PageService(db, links, changes);
  search = new SearchService(db);
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

  it("trims titles and rejects blank ones or ones that would break wikilinks", async () => {
    expect(await pages.create({ wikiId, title: "  Mira  " })).toMatchObject({ title: "Mira", path: "pages/Mira.md" });
    await expect(pages.create({ wikiId, title: " " })).rejects.toThrow("needs a title");
    for (const title of ["Mira [draft]", "Mira|Mi", "Mira#Early"]) {
      await expect(pages.create({ wikiId, title })).rejects.toThrow("can't contain");
    }

    const theo = await pages.create({ wikiId, title: "Theo" });
    await expect(pages.rename(theo.id, "Theo#2")).rejects.toThrow("can't contain");
  });

  it("rejects duplicate titles", async () => {
    await pages.create({ wikiId, title: "Mira" });
    await expect(pages.create({ wikiId, title: "Mira" })).rejects.toThrow("already exists");
  });

  it("hides minor edits from the default feed", async () => {
    const page = await pages.create({ wikiId, title: "Mira", body: "One" });
    await pages.save(page.id, "Two", { minor: true });
    later(MERGE_WINDOW + 1);
    await pages.save(page.id, "Three", { summary: "Rewrite" });

    expect((await changes.list(wikiId)).map((entry) => entry.summary)).toEqual(["Rewrite", "Created page"]);
    expect(await changes.list(wikiId, { includeMinor: true })).toHaveLength(3);
  });
});

describe("ChangeLog merging", () => {
  it("folds quick edits by one author into one entry spanning the session", async () => {
    const page = await pages.create({ wikiId, title: "Mira", body: "One\n" });
    await pages.save(page.id, "Two\n", { minor: true, summary: "Typo" });
    later(MERGE_WINDOW - 1);
    await pages.save(page.id, "Three\n", { summary: "Rewrite" });
    later(MERGE_WINDOW - 1);
    await pages.save(page.id, "Four\n", { minor: true, summary: "Typo" });

    const [edit, create] = await changes.listForPage(page.id);
    expect(create).toMatchObject({ kind: "create" });
    expect(edit).toMatchObject({ kind: "edit", minor: false, summary: "Typo; Rewrite", at: Date.now() });
    expect(sourceBefore(edit!, "Four\n")).toBe("One\n");
  });

  it("starts a new entry after the window, for another author, or after a rename", async () => {
    const page = await pages.create({ wikiId, title: "Mira", body: "One\n" });
    await pages.save(page.id, "Two\n");
    later(MERGE_WINDOW + 1);
    await pages.save(page.id, "Three\n");
    await pages.save(page.id, "Four\n", { author: "llm" });
    await pages.rename(page.id, "Mira Vale");
    await pages.save(page.id, "Five\n", { author: "llm" });

    expect((await changes.listForPage(page.id)).map(({ kind, author }) => `${kind} ${author}`)).toEqual([
      "edit llm",
      "rename human",
      "edit llm",
      "edit human",
      "edit human",
      "create human",
    ]);
  });

  it("never folds an edit into the page's creation", async () => {
    const page = await pages.create({ wikiId, title: "Mira", body: "One\n" });
    await pages.save(page.id, "Two\n");
    expect(await changes.listForPage(page.id)).toHaveLength(2);
  });

  it("drops the entry when the session ends where it began", async () => {
    const page = await pages.create({ wikiId, title: "Mira", body: "One\n" });
    await pages.save(page.id, "Two\n");
    await pages.save(page.id, "One\n");
    expect((await changes.listForPage(page.id)).map(({ kind }) => kind)).toEqual(["create"]);
  });
});

describe("PageService.rename", () => {
  it("renames the page, moves its path, and records the rename", async () => {
    const theo = await pages.create({ wikiId, title: "Theo" });

    const renamed = await pages.rename(theo.id, " Teo ");

    expect(renamed).toMatchObject({ title: "Teo", titleKey: "teo", path: "pages/Teo.md" });
    expect(await pages.getByTitle(wikiId, "Teo")).toMatchObject({ id: theo.id });
    expect(await pages.getByTitle(wikiId, "Theo")).toBeUndefined();
    expect(await changes.listForPage(theo.id)).toMatchObject([
      { kind: "rename", pageTitle: "Teo", summary: 'Renamed from "Theo"' },
      { kind: "create", pageTitle: "Theo" },
    ]);
  });

  it("rewrites inbound links by title and leaves alias links alone", async () => {
    const theo = await pages.create({ wikiId, title: "Theo", body: "---\naliases: [Teddy]\n---\n\nI am [[Theo]]." });
    const mira = await pages.create({ wikiId, title: "Mira", body: "[[theo#Early life]], [[Theo|him]], and [[Teddy]]." });

    await pages.rename(theo.id, "Teo");

    expect((await pages.get(mira.id))?.body).toBe("[[Teo#Early life]], [[Teo|him]], and [[Teddy]].");
    expect((await pages.get(theo.id))?.body).toContain("I am [[Teo]].");
    expect(await links.redLinks(wikiId)).toEqual([]);
    expect((await links.backlinks(theo.id)).map((link) => link.targetTitle).sort()).toEqual(["Teddy", "Teo", "Teo"]);

    const [update] = await changes.list(wikiId, { includeMinor: true });
    expect(update).toMatchObject({ pageId: mira.id, kind: "edit", minor: true, summary: 'Updated links to "Teo"' });
  });

  it("claims red links that already used the new title", async () => {
    const theo = await pages.create({ wikiId, title: "Theo" });
    const mira = await pages.create({ wikiId, title: "Mira", body: "[[Teo]]" });

    await pages.rename(theo.id, "Teo");

    expect(await links.backlinks(theo.id)).toMatchObject([{ fromPageId: mira.id }]);
  });

  it("allows a case-only rename and rejects titles taken by another page", async () => {
    const theo = await pages.create({ wikiId, title: "Theo" });
    await pages.create({ wikiId, title: "Mira", body: "---\naliases: [Mi]\n---" });

    expect(await pages.rename(theo.id, "THEO")).toMatchObject({ title: "THEO" });
    await expect(pages.rename(theo.id, "mira")).rejects.toThrow("already exists");
    await expect(pages.rename(theo.id, "Mi")).rejects.toThrow("already exists");
    await expect(pages.rename(theo.id, "  ")).rejects.toThrow("needs a title");
  });
});

describe("PageService.delete", () => {
  it("removes the page and turns links to it into red links", async () => {
    const theo = await pages.create({ wikiId, title: "Theo", body: "Knows [[Mira]] and [[Theo]]." });
    const mira = await pages.create({ wikiId, title: "Mira", body: "Friends with [[Theo]]." });

    await pages.delete(theo.id);

    expect(await pages.get(theo.id)).toBeUndefined();
    expect(await pages.getByTitle(wikiId, "Theo")).toBeUndefined();
    expect(await links.backlinks(mira.id)).toEqual([]);
    expect(await links.redLinks(wikiId)).toMatchObject([{ fromPageId: mira.id, targetTitle: "Theo" }]);
  });

  it("keeps the creation and deletion entries and drops the edits in between", async () => {
    const theo = await pages.create({ wikiId, title: "Theo", body: "One" });
    await pages.save(theo.id, "Two", { summary: "Expand" });
    await pages.save(theo.id, "Three", { minor: true });

    await pages.delete(theo.id);

    const history = await changes.list(wikiId, { includeMinor: true });
    expect(history).toMatchObject([
      { kind: "delete", pageId: theo.id, pageTitle: "Theo", summary: "Deleted page" },
      { kind: "create", pageId: theo.id, pageTitle: "Theo", summary: "Created page" },
    ]);
    expect(history[0].diff).toContain("-Three");
  });

  it("lets a red link recreate the page with a fresh history", async () => {
    const theo = await pages.create({ wikiId, title: "Theo", body: "Old" });
    const mira = await pages.create({ wikiId, title: "Mira", body: "Friends with [[Theo]]." });
    await pages.save(theo.id, "Edited");
    await pages.delete(theo.id);

    const reborn = await pages.create({ wikiId, title: "Theo", body: "New" });

    expect(reborn.id).not.toBe(theo.id);
    expect(await links.redLinks(wikiId)).toEqual([]);
    expect(await links.backlinks(reborn.id)).toMatchObject([{ fromPageId: mira.id }]);
    expect(await changes.listForPage(reborn.id)).toMatchObject([{ kind: "create" }]);
    expect((await changes.list(wikiId)).map(({ kind, pageTitle }) => `${kind} ${pageTitle}`)).toEqual([
      "create Theo",
      "delete Theo",
      "create Mira",
      "create Theo",
    ]);
  });

  it("deletes the page's assistant runs", async () => {
    const theo = await pages.create({ wikiId, title: "Theo" });
    await db.runs.add({ id: "run", wikiId, pageId: theo.id, kind: "draft", status: "done", transcript: [], startedAt: 0 });

    await pages.delete(theo.id);

    expect(await db.runs.count()).toBe(0);
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

  it("releases links to an alias when the alias is removed", async () => {
    const theo = await pages.create({ wikiId, title: "Theo", body: "---\naliases: [The Archivist, Teddy]\n---" });
    const mira = await pages.create({ wikiId, title: "Mira", body: "[[Theo]], [[Teddy]], and [[The Archivist]]." });
    const ash = await pages.create({ wikiId, title: "Ash" });

    await pages.save(ash.id, "---\naliases: [Teddy]\n---");
    await pages.save(theo.id, "No aliases now.");

    expect(await links.backlinks(theo.id)).toMatchObject([{ targetTitle: "Theo" }]);
    expect(await links.backlinks(ash.id)).toMatchObject([{ fromPageId: mira.id, targetTitle: "Teddy" }]);
    expect(await links.redLinks(wikiId)).toMatchObject([{ targetTitle: "The Archivist" }]);
  });

  it("finds red links aimed at a missing title", async () => {
    const mira = await pages.create({ wikiId, title: "Mira", body: "[[corin vale]] and [[Theo]]" });
    await pages.create({ wikiId, title: "Ash", body: "[[Corin Vale]]" });
    await pages.create({ wikiId, title: "Theo" });

    expect((await links.redLinksTo(wikiId, "Corin Vale")).map((link) => link.fromPageId)).toContain(mira.id);
    expect(await links.redLinksTo(wikiId, "Corin Vale")).toHaveLength(2);
    expect(await links.redLinksTo(wikiId, "Theo")).toEqual([]);
  });

  it("replaces a page's links on save", async () => {
    const theo = await pages.create({ wikiId, title: "Theo" });
    const mira = await pages.create({ wikiId, title: "Mira", body: "[[Theo]]" });
    await pages.save(mira.id, "No links now");
    expect(await links.backlinks(theo.id)).toEqual([]);
  });
});

describe("SearchService", () => {
  const titles = (hits: { title: string }[]) => hits.map((hit) => hit.title);

  it("suggests titles by exact, prefix, word prefix, then substring match", async () => {
    for (const title of ["Ash", "Ashfall", "Old Ashwood", "Cash", "Mira"]) await pages.create({ wikiId, title });
    expect(titles(await search.suggest(wikiId, "ASH"))).toEqual(["Ash", "Ashfall", "Old Ashwood", "Cash"]);
    expect(await search.suggest(wikiId, "   ")).toEqual([]);
    expect(await search.suggest(wikiId, "ash", { limit: 2 })).toHaveLength(2);
  });

  it("matches aliases, reports them, and ranks titles first at the same tier", async () => {
    await pages.create({ wikiId, title: "Theo", body: "---\naliases: [The Archivist]\n---" });
    await pages.create({ wikiId, title: "Archive" });
    await pages.create({ wikiId, title: "Archivist" });

    expect(await search.suggest(wikiId, "archivist")).toEqual([
      { pageId: expect.any(String), title: "Archivist" },
      { pageId: expect.any(String), title: "Theo", alias: "The Archivist" },
    ]);
  });

  it("only searches the given wiki", async () => {
    const other = await wikis.create("Other");
    await pages.create({ wikiId: other.id, title: "Mira" });
    expect(await search.suggest(wikiId, "mira")).toEqual([]);
  });

  it("searches body text, needing every term, with name matches first", async () => {
    await pages.create({ wikiId, title: "Mira", body: "---\nnote: lantern\n---\n\nShe carries a **lantern** through [[Ashfall|the old city]]." });
    await pages.create({ wikiId, title: "Theo", body: "A lantern, a lantern, and a city." });
    await pages.create({ wikiId, title: "Lantern Festival" });

    expect(titles(await search.search(wikiId, "lantern"))).toEqual(["Lantern Festival", "Theo", "Mira"]);
    expect(titles(await search.search(wikiId, "old lantern"))).toEqual(["Mira"]);
    expect(await search.search(wikiId, "carries")).toMatchObject([
      { title: "Mira", snippet: "She carries a lantern through the old city." },
    ]);
    expect(await search.search(wikiId, "note")).toEqual([]);
  });

  it("trims snippets around the first match", async () => {
    const filler = "word ".repeat(40);
    await pages.create({ wikiId, title: "Mira", body: `${filler}needle ${filler}` });

    const [hit] = await search.search(wikiId, "needle");
    expect(hit.snippet).toMatch(/^….*needle.*…$/);
    expect(hit.snippet!.length).toBeLessThanOrEqual(162);
  });

  it("sees edits after a page is saved", async () => {
    const mira = await pages.create({ wikiId, title: "Mira", body: "Before" });
    expect(await search.search(wikiId, "before")).toHaveLength(1);

    await pages.save(mira.id, "After");
    expect(await search.search(wikiId, "before")).toEqual([]);
    expect(await search.search(wikiId, "after")).toHaveLength(1);
  });
});
