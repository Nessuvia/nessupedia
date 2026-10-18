import { beforeEach, describe, expect, it } from "vitest";
import { WikiDatabase } from "@/db/database";
import { orderTabs, tabTitle, topTitle } from "@/markdown/subpages";
import { normalizeTitle, titleError, titleKey } from "@/markdown/wikilinks";
import { ChangeLog } from "@/services/ChangeLog";
import { LinkIndexer } from "@/services/LinkIndexer";
import { pathForTitle, PageService } from "@/services/PageService";
import { WikiService } from "@/services/WikiService";

let db: WikiDatabase;
let pages: PageService;
let wikiId: string;

beforeEach(async () => {
  db = new WikiDatabase(`test-${crypto.randomUUID()}`);
  pages = new PageService(db, new LinkIndexer(db), new ChangeLog(db));
  wikiId = (await new WikiService(db).create("Ashfall")).id;
});

const titles = (list: { title: string }[]) => list.map((page) => page.title);

describe("subpage titles", () => {
  it("trims each segment and matches across spacing around slashes", () => {
    expect(normalizeTitle(" Mira /  History ")).toBe("Mira/History");
    expect(titleKey("Mira / History")).toBe(titleKey("mira/history"));
    expect(topTitle("Mira/History/Childhood")).toBe("Mira");
    expect(tabTitle("Mira/History/Childhood")).toBe("Mira/History");
    expect(tabTitle("Mira")).toBe("Mira");
  });

  it("rejects blank segments and a Relationships subpage, but not a page named Relationships", () => {
    expect(titleError("Mira/")).toMatch("needs a name");
    expect(titleError("/History")).toMatch("needs a name");
    expect(titleError("Mira//History")).toMatch("needs a name");
    expect(titleError("Mira/relationships")).toMatch("generated tab");
    expect(titleError("Relationships")).toBeUndefined();
  });

  it("stores subpages in folders", () => {
    expect(pathForTitle("Mira/History: Early")).toBe("pages/Mira/History- Early.md");
  });

  it("orders tabs by the tabs field, then alphabetically", () => {
    const subpages = ["Mira/Quotes", "Mira/Gallery", "Mira/History", "Mira/Behind the scenes"].map((title) => ({ title }));
    expect(titles(orderTabs(subpages, { tabs: ["history", "Quotes"] }))).toEqual([
      "Mira/History",
      "Mira/Quotes",
      "Mira/Behind the scenes",
      "Mira/Gallery",
    ]);
  });
});

describe("PageService subpages", () => {
  it("finds subpages by prefix without matching longer titles", async () => {
    for (const title of ["Mira", "Mira / History", "Mira/History/Childhood", "Mira/Quotes", "Mira Vale", "Miranda/Notes"]) {
      await pages.create({ wikiId, title });
    }

    expect(titles(await pages.subpages(wikiId, "mira"))).toEqual(["Mira/History", "Mira/History/Childhood", "Mira/Quotes"]);
    expect(titles(await pages.directSubpages(wikiId, "Mira"))).toEqual(["Mira/History", "Mira/Quotes"]);
    expect(titles(await pages.directSubpages(wikiId, "Mira/History"))).toEqual(["Mira/History/Childhood"]);
  });

  it("moves subpages at every depth when their page is renamed, rewriting links to them", async () => {
    const mira = await pages.create({ wikiId, title: "Mira" });
    await pages.create({ wikiId, title: "Mira/History" });
    await pages.create({ wikiId, title: "Mira/History/Childhood" });
    const theo = await pages.create({ wikiId, title: "Theo", body: "See [[Mira/History|her past]] and [[mira/history/childhood]]." });

    await pages.rename(mira.id, "Mira Vale");

    expect(titles(await pages.subpages(wikiId, "Mira Vale"))).toEqual(["Mira Vale/History", "Mira Vale/History/Childhood"]);
    expect(await pages.subpages(wikiId, "Mira")).toEqual([]);
    expect((await pages.getByTitle(wikiId, "Mira Vale/History/Childhood"))?.path).toBe("pages/Mira Vale/History/Childhood.md");
    expect((await pages.get(theo.id))?.body).toBe("See [[Mira Vale/History|her past]] and [[Mira Vale/History/Childhood]].");
  });

  it("can move a page under its own old title", async () => {
    const mira = await pages.create({ wikiId, title: "Mira" });
    await pages.create({ wikiId, title: "Mira/History" });

    await pages.rename(mira.id, "Mira/Old");

    expect(titles(await pages.listForWiki(wikiId))).toEqual(["Mira/Old", "Mira/Old/History"]);
  });

  it("refuses the whole rename when a subpage's new title is taken", async () => {
    const mira = await pages.create({ wikiId, title: "Mira" });
    await pages.create({ wikiId, title: "Mira/History" });
    await pages.create({ wikiId, title: "Vale/History" });

    await expect(pages.rename(mira.id, "Vale")).rejects.toThrow('"Vale/History" already exists');
    expect(titles(await pages.listForWiki(wikiId))).toEqual(["Mira", "Mira/History", "Vale/History"]);
  });
});
