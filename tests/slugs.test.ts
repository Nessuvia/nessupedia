import Dexie from "dexie";
import { beforeEach, describe, expect, it } from "vitest";
import { WikiDatabase } from "@/db/database";
import { WikiService } from "@/services/WikiService";
import { freeSlug, slugify } from "@/utils/slug";

let db: WikiDatabase;
let wikis: WikiService;

beforeEach(() => {
  db = new WikiDatabase(`test-${crypto.randomUUID()}`);
  wikis = new WikiService(db);
});

describe("slugify", () => {
  it("lowercases, drops accents, and joins words with hyphens", () => {
    expect(slugify("  The Ashfall Saga! ")).toBe("the-ashfall-saga");
    expect(slugify("Café Noir: Part 2")).toBe("cafe-noir-part-2");
    expect(slugify("灰の街")).toBe("灰の街");
    expect(slugify("???")).toBe("");
  });

  it("numbers a taken slug and falls back to wiki when empty", () => {
    const taken = new Set(["ashfall"]);
    expect(freeSlug("ashfall", taken)).toBe("ashfall-2");
    expect(freeSlug("ashfall", taken)).toBe("ashfall-3");
    expect(freeSlug("", taken)).toBe("wiki");
  });
});

describe("WikiService slugs", () => {
  it("gives each new wiki a free slug from its name and keeps it on rename", async () => {
    const first = await wikis.create("Ashfall");
    const second = await wikis.create("ashfall");
    expect([first.slug, second.slug]).toEqual(["ashfall", "ashfall-2"]);
    expect((await wikis.rename(first.id, "Brightwater")).slug).toBe("ashfall");
  });

  it("finds a wiki by slug or by the ID older links used", async () => {
    const wiki = await wikis.create("Ashfall");
    expect(await wikis.fromUrl("ashfall")).toEqual(wiki);
    expect(await wikis.fromUrl(wiki.id)).toEqual(wiki);
    expect(await wikis.fromUrl("missing")).toBeUndefined();
  });

  it("cleans a new slug and rejects one another wiki uses", async () => {
    const wiki = await wikis.create("Ashfall");
    const other = await wikis.create("Brightwater");
    expect((await wikis.setSlug(wiki.id, " Ash Fall ")).slug).toBe("ash-fall");
    await expect(wikis.setSlug(wiki.id, "!!")).rejects.toThrow("needs a letter or number");
    await expect(wikis.setSlug(other.id, "ash-fall")).rejects.toThrow("Ashfall already uses that URL");
    expect((await wikis.setSlug(wiki.id, "ash-fall")).slug).toBe("ash-fall");
  });
});

describe("database version 5", () => {
  it("gives existing wikis unique slugs from their names", async () => {
    const name = `test-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(4).stores({ wikis: "id, name" });
    await old.table("wikis").bulkAdd([
      { id: "a", name: "Ashfall", themeId: "fandom", voice: "fandom", createdAt: 0 },
      { id: "b", name: "ashfall", themeId: "fandom", voice: "fandom", createdAt: 0 },
      { id: "c", name: "Brightwater", themeId: "fandom", voice: "fandom", createdAt: 0 },
    ]);
    old.close();

    const upgraded = new WikiDatabase(name);
    const slugs = (await upgraded.wikis.toArray()).map((wiki) => wiki.slug).sort();
    expect(slugs).toEqual(["ashfall", "ashfall-2", "brightwater"]);
  });
});
