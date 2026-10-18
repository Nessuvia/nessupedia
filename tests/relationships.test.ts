import { beforeEach, describe, expect, it } from "vitest";
import { WikiDatabase } from "@/db/database";
import { pairOf, retargetBetween, suggestedPairTitle } from "@/markdown/relationships";
import { leadMarkdown } from "@/markdown/sections";
import { ChangeLog } from "@/services/ChangeLog";
import { LinkIndexer } from "@/services/LinkIndexer";
import { PageService } from "@/services/PageService";
import { RelationshipService } from "@/services/RelationshipService";
import { WikiService } from "@/services/WikiService";

let db: WikiDatabase;
let links: LinkIndexer;
let pages: PageService;
let relationships: RelationshipService;
let wikiId: string;

beforeEach(async () => {
  db = new WikiDatabase(`test-${crypto.randomUUID()}`);
  links = new LinkIndexer(db);
  pages = new PageService(db, links, new ChangeLog(db));
  relationships = new RelationshipService(db, links);
  wikiId = (await new WikiService(db).create("Ashfall")).id;
});

const pairPage = (between: string, body = "") => `---\nbetween: ${between}\ncategories: [Relationships]\n---\n\n${body}`;

describe("relationship helpers", () => {
  it("reads the pair, skipping repeats and names that can't be titles", () => {
    expect(pairOf({ between: ["Mira", " theo ", "mira", "A|B"] })).toEqual(["Mira", "theo"]);
    expect(pairOf({ between: "Mira" })).toEqual(["Mira"]);
    expect(suggestedPairTitle(["Mira ", " Theo"])).toBe("Mira & Theo");
  });

  it("rewrites only the matching between entry", () => {
    const page = "---\n# pair\nbetween: [Mira, Theo]\nmood: tense\n---\n\nThey [[Mira|argue]].";
    expect(retargetBetween(page, "mira", "Mira Vale", { between: ["Mira", "Theo"] })).toBe(
      "---\n# pair\nbetween: [Mira Vale, Theo]\nmood: tense\n---\n\nThey [[Mira|argue]].",
    );
    expect(retargetBetween(page, "Corin", "Corin Vale", { between: ["Mira", "Theo"] })).toBe(page);
  });

  it("takes the lead's own text without frontmatter, infobox, pressure profile, or hints", () => {
    const body = "---\nbetween: [A, B]\n---\n\n:::infobox\ntitle: A & B\n:::\n\n<!-- hint -->\n\nRivals, then [[B|partners]].\n\nStill wary.\n\n## History\n\nLong.";
    expect(leadMarkdown(body)).toBe("Rivals, then [[B|partners]].\n\nStill wary.");
    expect(leadMarkdown("## Only sections")).toBe("");
  });
});

describe("between links", () => {
  it("indexes between entries as field links that resolve by title or alias and turn red when missing", async () => {
    const mira = await pages.create({ wikiId, title: "Mira", body: "---\naliases: [Mi]\n---\n" });
    const pair = await pages.create({ wikiId, title: "Mi & Corin", body: pairPage("[Mi, Corin]", "See [[Mira]].") });

    const fromPair = await db.links.where("fromPageId").equals(pair.id).toArray();
    expect(fromPair.map(({ targetTitle, field, toPageId }) => ({ targetTitle, field, toPageId }))).toEqual([
      { targetTitle: "Mira", field: undefined, toPageId: mira.id },
      { targetTitle: "Mi", field: "between", toPageId: mira.id },
      { targetTitle: "Corin", field: "between", toPageId: undefined },
    ]);
    expect((await links.redLinksTo(wikiId, "Corin")).map((link) => link.fromPageId)).toEqual([pair.id]);

    const corin = await pages.create({ wikiId, title: "Corin" });
    expect((await links.backlinks(corin.id)).map((link) => link.field)).toEqual(["between"]);
  });

  it("rewrites between entries by title when a page is renamed, and leaves alias entries alone", async () => {
    const mira = await pages.create({ wikiId, title: "Mira", body: "---\naliases: [Mi]\n---\n" });
    await pages.create({ wikiId, title: "Theo" });
    const byTitle = await pages.create({ wikiId, title: "Mira & Theo", body: pairPage("[Mira, Theo]") });
    const byAlias = await pages.create({ wikiId, title: "Mi & Theo", body: pairPage("[Mi, Theo]") });

    await pages.rename(mira.id, "Mira Vale");

    expect((await pages.get(byTitle.id))?.frontmatter.between).toEqual(["Mira Vale", "Theo"]);
    expect((await pages.get(byAlias.id))?.frontmatter.between).toEqual(["Mi", "Theo"]);
    expect(await relationships.count((await pages.get(mira.id))!)).toBe(2);
  });
});

describe("RelationshipService", () => {
  it("lists each pair by the other page, with its lead, current title, and whether it exists", async () => {
    const mira = await pages.create({ wikiId, title: "Mira", body: "---\naliases: [Mi]\n---\n" });
    await pages.create({ wikiId, title: "Theo", body: "---\naliases: [Teddy]\n---\n" });
    await pages.create({ wikiId, title: "Mira & Theo", body: pairPage("[Mi, Teddy]", "Childhood friends.\n\n## History\n\nLong.") });
    await pages.create({ wikiId, title: "Mira and Ash", body: pairPage("[Ash, Mira]", "Rivals.") });
    await pages.create({ wikiId, title: "Theo and Ash", body: pairPage("[Theo, Ash]") });

    const list = await relationships.of(mira);
    expect(list.map(({ pair, other, lead }) => ({ pair: pair.title, other, lead }))).toEqual([
      { pair: "Mira and Ash", other: { title: "Ash", exists: false }, lead: "Rivals." },
      { pair: "Mira & Theo", other: { title: "Theo", exists: true }, lead: "Childhood friends." },
    ]);
  });

  it("drops a pair once it no longer names the page", async () => {
    const mira = await pages.create({ wikiId, title: "Mira" });
    const pair = await pages.create({ wikiId, title: "Mira & Theo", body: pairPage("[Mira, Theo]") });

    await pages.save(pair.id, pairPage("[Ash, Theo]"));
    expect(await relationships.of(mira)).toEqual([]);
    expect(await relationships.count(mira)).toBe(0);
  });
});
