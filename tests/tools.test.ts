import { beforeEach, describe, expect, it } from "vitest";
import { WikiDatabase } from "@/db/database";
import { parseLooseJson, parseTextToolCalls } from "@/llm/textToolCalls";
import { WikiTools } from "@/llm/tools";
import { MAIN_CANON_LABEL } from "@/markdown/autoContext";
import { ChangeLog } from "@/services/ChangeLog";
import { ContinuityService } from "@/services/ContinuityService";
import { LinkIndexer } from "@/services/LinkIndexer";
import { PageService } from "@/services/PageService";
import { RelationshipService } from "@/services/RelationshipService";
import { SearchService } from "@/services/SearchService";
import { WikiService } from "@/services/WikiService";
import { closestNames, similarity } from "@/utils/fuzzy";

describe("fuzzy names", () => {
  it("scores near spellings and contained names, ignoring case", () => {
    expect(similarity("Mira", "mira")).toBe(1);
    expect(similarity("Mra", "Mira")).toBeGreaterThan(0.7);
    expect(similarity("Mira", "Mira Vale")).toBeGreaterThanOrEqual(0.6);
    expect(similarity("Mira", "Theo")).toBeLessThan(0.5);
  });

  it("lists the closest names first and leaves out poor ones", () => {
    expect(closestNames("Mirra", ["Theo", "Mira Vale", "Mira", "Harrow"])).toEqual(["Mira"]);
    expect(closestNames("Vale", ["Theo", "Mira Vale", "Vala"])).toEqual(["Vala", "Mira Vale"]);
    expect(closestNames("Zzz", ["Mira"])).toEqual([]);
  });
});

describe("loose JSON", () => {
  it("repairs trailing commas, single quotes, bare keys, and raw line breaks", () => {
    expect(parseLooseJson('{"title": "Mira"}')).toEqual({ value: { title: "Mira" }, repaired: false });
    expect(parseLooseJson("{'title': 'Mira\\'s blade', limit: 3,}")).toEqual({ value: { title: "Mira's blade", limit: 3 }, repaired: true });
    expect(parseLooseJson('{"query": "two\nlines", "note": "say \'hi\'"}')?.value).toEqual({ query: "two\nlines", note: "say 'hi'" });
    expect(parseLooseJson('{"query": "a, b: c"}')?.value).toEqual({ query: "a, b: c" });
    expect(parseLooseJson("not json")).toBeUndefined();
  });

  it("reads positional arguments from Python-style calls", () => {
    expect(parseTextToolCalls('read_section("Mira", heading="Background")', ["read_section"])).toEqual([
      { id: "text_0", name: "read_section", arguments: '{"0":"Mira","heading":"Background"}' },
    ]);
  });
});

describe("WikiTools", () => {
  let db: WikiDatabase;
  let pages: PageService;
  let tools: WikiTools;
  let wikiId: string;

  beforeEach(async () => {
    db = new WikiDatabase(`test-${crypto.randomUUID()}`);
    const links = new LinkIndexer(db);
    pages = new PageService(db, links, new ChangeLog(db));
    tools = new WikiTools(db, links, new SearchService(db), new RelationshipService(db, links));
    wikiId = (await new WikiService(db).create("Ashfall")).id;
    await pages.create({
      wikiId,
      title: "Mira",
      body: [
        "---\naliases: [Mi]\n---",
        "A sellsword from [[Harrow]] :canon[born in winter]{tier=likely}.",
        "## Background",
        "Grew up on a farm.\n\n:::canon{tier=idea}\nSecretly a queen.\n:::",
        "## Skills",
        "Knives.",
      ].join("\n\n"),
    });
    await pages.create({ wikiId, title: "Harrow", body: "A town. [[Mira]] lived here." });
  });

  const run = (name: string, args: unknown, options = {}) =>
    tools.run(wikiId, { name, arguments: typeof args === "string" ? args : JSON.stringify(args) }, options);

  it("reads a page by alias with tiers labelled and Idea text left out", async () => {
    const result = await run("read_page", { title: "mi" });
    expect(result).toEqual({
      content: [
        "# Mira",
        "Also called: Mi",
        "A sellsword from [[Harrow]] [Likely: born in winter].",
        "## Background",
        "Grew up on a farm.",
        "## Skills",
        "Knives.",
      ].join("\n\n"),
      pages: ["Mira"],
    });
  });

  it("reads one section, and lists the sections when the heading is wrong", async () => {
    expect((await run("read_section", { title: "Mira", heading: "## background" })).content).toBe("# Mira\n\n## Background\n\nGrew up on a farm.");
    const wrong = await run("read_section", { title: "Mira", heading: "Skill" });
    expect(wrong).toEqual({ content: 'Mira has no section "Skill". Did you mean Skills? Its sections: Background, Skills.', pages: [], error: true });
  });

  it("names the closest pages and tools when one doesn't exist", async () => {
    expect((await run("read_page", { title: "Mirra" })).content).toBe('No page called "Mirra". Closest: Mira, Mi.');
    expect((await run("read_page", { title: "Qq" })).content).toBe('No page called "Qq". Use search_pages to look for it.');
    expect((await run("read_pages", { title: "Mira" })).content).toMatch(/^There's no tool called "read_pages". Did you mean read_page\?/);
    expect(await run("read_page", {})).toEqual({ content: "read_page needs a title.", pages: [], error: true });
    expect((await run("read_page", "[1]")).error).toBe(true);
  });

  it("repairs arguments and says so", async () => {
    expect(await run("list_backlinks", "{title: 'Mira',}")).toEqual({ content: "Pages linking to Mira:\n- Harrow", pages: ["Mira"], repaired: true });
  });

  it("searches, and reaches Idea text through get_canon", async () => {
    expect((await run("search_pages", { query: "farm" })).content).toBe(
      "- Mira: …Harrow [Likely: born in winter]. Background Grew up on a farm. Skills Knives.",
    );
    expect((await run("search_pages", { query: "queen" })).content).toBe('No pages match "queen".');
    expect((await run("search_pages", { query: "mi" })).content).toMatch(/^- Mira \(also called Mi\)/);
    expect((await run("get_canon", { title: "Mira" })).content).toBe("[Likely] born in winter\n\n[Idea] Secretly a queen.");
    expect((await run("get_canon", { title: "Mira", tier: "idea" })).content).toBe("[Idea] Secretly a queen.");
    expect((await run("get_canon", { title: "Harrow" })).content).toBe("Harrow has no Canon, Likely, or Idea marks.");
    expect((await run("get_canon", { title: "Mira", tier: "maybe-ish" })).error).toBe(true);
  });

  it("lists relationships with each pair's lead", async () => {
    await pages.create({ wikiId, title: "Theo", body: "A knight." });
    await pages.create({ wikiId, title: "Mira & Theo", body: "---\nbetween: [Mira, Theo]\n---\n\nRivals turned friends." });
    expect(await run("get_relationships", { title: "Theo" })).toEqual({
      content: "## Mira (from Mira & Theo)\n\nRivals turned friends.",
      pages: ["Theo", "Mira & Theo"],
    });
  });

  it("reads the run's continuity version, merged, with inherited sections labelled", async () => {
    await new ContinuityService(db, pages).create(wikiId, "Noir AU");
    await pages.create({ wikiId, title: "Mira/Noir AU", body: "---\nchanges: [era]\n---\n\nA private eye.\n\n## Skills\n\nGuns." });

    const page = await run("read_page", { title: "Mira" }, { continuity: "Noir AU" });
    expect(page.pages).toEqual(["Mira/Noir AU"]);
    expect(page.content).toBe(
      ["# Mira/Noir AU", "A private eye.", `${MAIN_CANON_LABEL}\n## Background`, "Grew up on a farm.", "## Skills", "Guns."].join("\n\n"),
    );
    expect((await run("read_section", { title: "Mira", heading: "Background" }, { continuity: "Noir AU" })).content).toBe(
      `# Mira/Noir AU\n\n${MAIN_CANON_LABEL}\n## Background\n\nGrew up on a farm.`,
    );
    expect((await run("get_canon", { title: "Mira/Noir AU", tier: "idea" })).content).toBe("[Idea] Secretly a queen.");
  });

  it("cuts long results to fit", async () => {
    const result = await run("read_page", { title: "Mira" }, { maxChars: 40 });
    expect(result.content).toBe("# Mira\n\nAlso called: Mi\n… (cut short to fit)");
  });
});
