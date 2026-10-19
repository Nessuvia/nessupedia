import { beforeEach, describe, expect, it } from "vitest";
import { WikiDatabase } from "@/db/database";
import { AutoContext } from "@/llm/AutoContext";
import { contextText, labelTiers, MAIN_CANON_LABEL, readAutoContext, writeAutoContext } from "@/markdown/autoContext";
import { editFrontmatter } from "@/markdown/frontmatterEdit";
import { ChangeLog } from "@/services/ChangeLog";
import { ContinuityService } from "@/services/ContinuityService";
import { LinkIndexer } from "@/services/LinkIndexer";
import { MentionFinder } from "@/services/MentionFinder";
import { PageService } from "@/services/PageService";
import { WikiService } from "@/services/WikiService";

describe("auto-context settings", () => {
  it("reads defaults, and tolerates odd values", () => {
    expect(readAutoContext({})).toEqual({ enabled: true, triggers: [], include: "lead" });
    expect(readAutoContext({ "auto-context": { enabled: false, triggers: "the Hollow Crown", include: "Infobox" } })).toEqual({
      enabled: false,
      triggers: ["the Hollow Crown"],
      include: "infobox",
    });
    expect(readAutoContext({ "auto-context": { triggers: [" a ", "", 3], include: "everything" } })).toEqual({
      enabled: true,
      triggers: ["a"],
      include: "lead",
    });
  });

  it("writes only what differs from the defaults, and removes the key when nothing does", () => {
    const page = "---\ntitle: Mira\n---\n\nText.";
    const changed = editFrontmatter(page, (doc) =>
      writeAutoContext(doc, { enabled: true, triggers: ["the Hollow Crown", "Mira's blade"], include: "full" }),
    );
    expect(changed).toBe("---\ntitle: Mira\nauto-context:\n  triggers: [the Hollow Crown, Mira's blade]\n  include: full\n---\n\nText.");
    expect(editFrontmatter(changed, (doc) => writeAutoContext(doc, { enabled: true, triggers: [], include: "lead" }))).toBe(page);
    expect(editFrontmatter("Text.", (doc) => writeAutoContext(doc, { enabled: false, triggers: [], include: "lead" }))).toBe(
      "---\nauto-context:\n  enabled: false\n---\n\nText.",
    );
  });
});

describe("tier labels", () => {
  it("drops Idea text and labels Canon and Likely blocks and phrases", () => {
    const body = [
      "Born in winter :canon[during the long frost]{tier=maybe}, :canon[in Harrow]{tier=likely}.",
      ":::canon{tier=idea}\nSecretly a queen.\n:::",
      ":::canon\nScar on the left hand.\n:::",
      ":::canon{tier=soft}\nFears deep water, :canon[maybe from the flood]{tier=maybe}.\n:::",
    ].join("\n\n");
    expect(labelTiers(body)).toBe(
      [
        "Born in winter , [Likely: in Harrow].",
        "[Canon]\nScar on the left hand.\n[/Canon]",
        "[Likely]\nFears deep water, .\n[/Likely]",
      ].join("\n\n"),
    );
  });

  it("relabels marks inside infobox values and drops frontmatter and hints", () => {
    const body = "---\naliases: [Mi]\n---\n\n<!-- Say who she is -->\n\n:::infobox\ntitle: Mira\nBorn: 1203 :canon[in Harrow]{tier=soft}\nTitle: :canon[Queen]{tier=maybe}\n:::";
    expect(labelTiers(body)).toBe(":::infobox\ntitle: Mira\nBorn: 1203 [Likely: in Harrow]\nTitle:\n:::");
  });
});

describe("context text", () => {
  const body = "---\nx: 1\n---\n\n:::infobox\ntitle: Mira\n:::\n\n<!-- hint -->\n\nA sellsword.\n\n## Background\n\nGrew up in [[Harrow]].";

  it("takes the lead, the infobox alone, or the whole page", () => {
    expect(contextText(body, "lead")).toBe(":::infobox\ntitle: Mira\n:::\n\nA sellsword.");
    expect(contextText(body, "infobox")).toBe(":::infobox\ntitle: Mira\n:::");
    expect(contextText(body, "full")).toBe(":::infobox\ntitle: Mira\n:::\n\nA sellsword.\n\n## Background\n\nGrew up in [[Harrow]].");
  });

  it("merges a version, labelling what it inherits", () => {
    const version = "---\nchanges: [era]\n---\n\n## Background\n\nGrew up in Noir Harrow.";
    expect(contextText(version, "lead", body)).toBe(`${MAIN_CANON_LABEL}\n:::infobox\ntitle: Mira\n:::\n\nA sellsword.`);
    expect(contextText(version, "full", body)).toBe(
      `${MAIN_CANON_LABEL}\n:::infobox\ntitle: Mira\n:::\n\nA sellsword.\n\n## Background\n\nGrew up in Noir Harrow.`,
    );
  });
});

describe("mention finder", () => {
  const finder = new MentionFinder([
    { name: "Mira", pageId: "mira" },
    { name: "Mira Vale", pageId: "vale" },
    { name: "the Hollow Crown", pageId: "crown" },
    { name: "mira", pageId: "other" },
  ]);

  it("matches whole words case-insensitively, longest first, across line breaks", () => {
    const text = "MIRA met mira vale, then took the hollow\ncrown. Miranda and Mira's blade.";
    expect(finder.find(text).map(({ pageId, text }) => [pageId, text])).toEqual([
      ["mira", "MIRA"],
      ["vale", "mira vale"],
      ["crown", "the hollow\ncrown"],
      ["mira", "Mira"],
    ]);
    expect(finder.count([text, "[[Mira]]"])).toEqual(
      new Map([
        ["mira", 3],
        ["vale", 1],
        ["crown", 1],
      ]),
    );
  });

  it("finds nothing without names", () => {
    expect(new MentionFinder([]).find("Mira")).toEqual([]);
  });
});

describe("auto-context", () => {
  let db: WikiDatabase;
  let pages: PageService;
  let wikis: WikiService;
  let auto: AutoContext;
  let wikiId: string;
  const words = (text: string) => text.split(/\s+/).length;

  beforeEach(async () => {
    db = new WikiDatabase(`test-${crypto.randomUUID()}`);
    pages = new PageService(db, new LinkIndexer(db), new ChangeLog(db));
    wikis = new WikiService(db);
    auto = new AutoContext(db);
    wikiId = (await wikis.create("Ashfall")).id;
  });

  const build = (input: string, extra: Partial<Parameters<AutoContext["build"]>[0]> = {}) =>
    auto.build({ wikiId, input: [input], budget: 1000, count: words, ...extra });

  it("puts mentioned pages first by mention count, then pages they link to", async () => {
    await pages.create({ wikiId, title: "Mira", body: "---\naliases: [Mi]\n---\n\nA sellsword from [[Harrow]].\n\n## Later\n\nSecret." });
    await pages.create({ wikiId, title: "Theo", body: "Mira's rival." });
    await pages.create({ wikiId, title: "Harrow", body: "A town near [[Ashkeep]]." });
    await pages.create({ wikiId, title: "Ashkeep", body: "A fortress." });

    const result = await build("Theo meets Mi. Mira laughs.");
    expect(result.entries.map(({ title, depth, mentions }) => [title, depth, mentions])).toEqual([
      ["Mira", 0, 2],
      ["Theo", 0, 1],
      ["Harrow", 1, 0],
    ]);
    expect(result.entries[0]!.text).toBe("# Mira\n\nAlso called: Mi\n\nA sellsword from [[Harrow]].");
    expect(result.tokens).toBe(result.entries.reduce((sum, entry) => sum + entry.tokens, 0));

    await wikis.setAutoContextDepth(wikiId, 2);
    expect((await build("Mira")).entries.map(({ title }) => title)).toEqual(["Mira", "Harrow", "Ashkeep"]);
    await wikis.setAutoContextDepth(wikiId, 0);
    expect((await build("Mira")).entries.map(({ title }) => title)).toEqual(["Mira"]);
  });

  it("skips disabled and excluded pages, matches triggers, and honours include", async () => {
    await pages.create({ wikiId, title: "Mira", body: "---\nauto-context:\n  enabled: false\n---\n\nHidden. [[Harrow]]" });
    const crown = await pages.create({
      wikiId,
      title: "Crown",
      body: "---\nauto-context:\n  triggers: [the Hollow Crown]\n  include: full\n---\n\nOld.\n\n## Curse\n\nIt burns.",
    });
    await pages.create({ wikiId, title: "Harrow", body: "A town." });

    const result = await build("Mira wore the hollow crown in Harrow.");
    expect(result.entries.map(({ title }) => title)).toEqual(["Crown", "Harrow"]);
    expect(result.entries[0]!.text).toBe("# Crown\n\nOld.\n\n## Curse\n\nIt burns.");
    expect((await build("the Hollow Crown", { exclude: [crown.id] })).entries).toEqual([]);
  });

  it("fills up to the budget and lists what didn't fit", async () => {
    await pages.create({ wikiId, title: "Mira", body: "One two three four five six seven eight." });
    await pages.create({ wikiId, title: "Theo", body: "Short." });

    const result = await build("Mira Mira Theo", { budget: 6 });
    expect(result.entries.map(({ title }) => title)).toEqual(["Theo"]);
    expect(result.leftOut.map(({ title }) => title)).toEqual(["Mira"]);
  });

  it("uses a page's version in the run's continuity, merged with its main page", async () => {
    await new ContinuityService(db, pages).create(wikiId, "Noir AU");
    await pages.create({ wikiId, title: "Mira", body: "A sellsword.\n\n## Background\n\nFarm girl." });
    await pages.create({ wikiId, title: "Mira/Noir AU", body: "---\nchanges: [era]\n---\n\nA private eye." });

    expect((await build("Mira", { continuity: "noir au" })).entries.map(({ title, text }) => [title, text])).toEqual([
      ["Mira/Noir AU", "# Mira/Noir AU\n\nA private eye."],
    ]);
    expect((await build("Mira")).entries.map(({ title }) => title)).toEqual(["Mira"]);
  });
});
