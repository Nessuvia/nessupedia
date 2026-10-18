import { beforeEach, describe, expect, it } from "vitest";
import { WikiDatabase } from "@/db/database";
import { versionOf, versionTitleError } from "@/markdown/versions";
import { ChangeLog } from "@/services/ChangeLog";
import { ContinuityService } from "@/services/ContinuityService";
import { LinkIndexer } from "@/services/LinkIndexer";
import { PageService } from "@/services/PageService";
import { WikiService } from "@/services/WikiService";

let db: WikiDatabase;
let pages: PageService;
let continuities: ContinuityService;
let wikiId: string;

beforeEach(async () => {
  db = new WikiDatabase(`test-${crypto.randomUUID()}`);
  pages = new PageService(db, new LinkIndexer(db), new ChangeLog(db));
  continuities = new ContinuityService(db, pages);
  wikiId = (await new WikiService(db).create("Ashfall")).id;
});

const titles = (list: { title: string }[]) => list.map((page) => page.title);
const noir = { id: "n", name: "Noir AU", description: "" };

describe("version titles", () => {
  it("recognizes a top-level page's version by the continuity's name, ignoring case", () => {
    expect(versionOf("Mira/noir au", [noir])).toEqual({ main: "Mira", continuity: noir });
    expect(versionOf("Mira/History", [noir])).toBeUndefined();
    expect(versionOf("Mira/History/Noir AU", [noir])).toBeUndefined();
  });

  it("refuses continuity names anywhere else under a page", () => {
    expect(versionTitleError("Mira/Noir AU", [noir])).toBeUndefined();
    expect(versionTitleError("Mira/Noir AU/Notes", [noir])).toMatch("can't have subpages");
    expect(versionTitleError("Mira/History/Noir AU", [noir])).toMatch("Only top-level pages");
    expect(versionTitleError("Noir AU", [noir])).toBeUndefined();
  });
});

describe("ContinuityService", () => {
  it("creates continuities with unique, valid names and lists them by name", async () => {
    await continuities.create(wikiId, " Noir AU ", " 1940s Harrow ");
    await continuities.create(wikiId, "Modern AU");

    expect((await continuities.list(wikiId)).map(({ name, description }) => ({ name, description }))).toEqual([
      { name: "Modern AU", description: "" },
      { name: "Noir AU", description: "1940s Harrow" },
    ]);
    await expect(continuities.create(wikiId, "noir au")).rejects.toThrow('"Noir AU" already exists');
    await expect(continuities.create(wikiId, "A/B")).rejects.toThrow("can't contain");
    await expect(continuities.create(wikiId, "Relationships")).rejects.toThrow("generated tab");
  });

  it("refuses a name a subpage already uses", async () => {
    await pages.create({ wikiId, title: "Mira" });
    await pages.create({ wikiId, title: "Mira/Quotes" });

    await expect(continuities.create(wikiId, "quotes")).rejects.toThrow('"Mira/Quotes" already uses that name');
  });

  it("lets versions exist only for existing top-level pages", async () => {
    await continuities.create(wikiId, "Noir AU");
    await expect(pages.create({ wikiId, title: "Mira/Noir AU" })).rejects.toThrow('Create "Mira" before its Noir AU version');

    await pages.create({ wikiId, title: "Mira", body: "---\naliases: [Mi]\n---\n" });
    await expect(pages.create({ wikiId, title: "Mi/Noir AU" })).rejects.toThrow('Create "Mi" before');
    await pages.create({ wikiId, title: "Mira/Noir AU" });
    await expect(pages.create({ wikiId, title: "Mira/Noir AU/Notes" })).rejects.toThrow("can't have subpages");

    expect(titles(await continuities.versions(wikiId, "noir au"))).toEqual(["Mira/Noir AU"]);
  });

  it("renames versions with their continuity and rewrites links to them", async () => {
    const { id } = await continuities.create(wikiId, "Noir AU");
    await pages.create({ wikiId, title: "Mira" });
    await pages.create({ wikiId, title: "Mira/Noir AU" });
    const theo = await pages.create({ wikiId, title: "Theo", body: "See [[Mira/Noir AU]]." });

    await continuities.rename(wikiId, id, "Noir");

    expect(titles(await continuities.versions(wikiId, "Noir"))).toEqual(["Mira/Noir"]);
    expect((await pages.get(theo.id))?.body).toBe("See [[Mira/Noir]].");
    await continuities.rename(wikiId, id, "NOIR");
    expect(titles(await continuities.versions(wikiId, "noir"))).toEqual(["Mira/NOIR"]);
  });

  it("moves versions when their main page is renamed", async () => {
    await continuities.create(wikiId, "Noir AU");
    const mira = await pages.create({ wikiId, title: "Mira" });
    await pages.create({ wikiId, title: "Mira/Noir AU" });

    await pages.rename(mira.id, "Mira Vale");
    expect(titles(await continuities.versions(wikiId, "Noir AU"))).toEqual(["Mira Vale/Noir AU"]);
    await expect(pages.rename(mira.id, "Vale/Mira")).rejects.toThrow("Only top-level pages");
  });

  it("deletes a continuity only once it has no versions", async () => {
    const { id } = await continuities.create(wikiId, "Noir AU");
    await pages.create({ wikiId, title: "Mira" });
    const version = await pages.create({ wikiId, title: "Mira/Noir AU" });

    await expect(continuities.delete(wikiId, id)).rejects.toThrow("still has 1 version");
    await pages.delete(version.id);
    await continuities.delete(wikiId, id);
    expect(await continuities.list(wikiId)).toEqual([]);
  });
});
