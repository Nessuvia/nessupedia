import { beforeEach, describe, expect, it } from "vitest";
import { WikiDatabase } from "@/db/database";
import {
  forkLead,
  forkSection,
  hideSection,
  mergeVersion,
  splitSections,
  toOwnRange,
  unhideSection,
  versionOf,
  versionTitleError,
} from "@/markdown/versions";
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

const MAIN = [
  "---",
  "categories: [Characters]",
  "---",
  "",
  ":::infobox",
  "title: Mira",
  ":::",
  "",
  "An archivist.",
  "",
  "## Appearance",
  "",
  "Tall.",
  "",
  "## Personality",
  "",
  "Patient.",
  "",
  "### Habits",
  "",
  "Hums.",
  "",
  "## Abilities",
  "",
  "Reads fast.",
  "",
].join("\n");

describe("splitSections", () => {
  it("cuts the lead and h2 sections, skipping frontmatter and treating a hint-only lead as none", () => {
    const { lead, sections } = splitSections(MAIN);
    expect(MAIN.slice(lead!.start, lead!.end)).toBe(":::infobox\ntitle: Mira\n:::\n\nAn archivist.");
    expect(sections.map(({ label, empty }) => ({ label, empty }))).toEqual([
      { label: "Appearance", empty: false },
      { label: "Personality", empty: false },
      { label: "Abilities", empty: false },
    ]);
    expect(MAIN.slice(sections[1]!.start, sections[1]!.end)).toBe("## Personality\n\nPatient.\n\n### Habits\n\nHums.");
    expect(splitSections("<!-- hint -->\n\n## Notes").lead).toBeUndefined();
  });
});

describe("mergeVersion", () => {
  const origins = (markdown: string, merged: ReturnType<typeof mergeVersion>) =>
    merged.segments.map((segment) => `${segment.origin}:${segment.label ?? "lead"}`);

  it("inherits everything from the main page when the version is empty", () => {
    const merged = mergeVersion(MAIN, "---\nchanges: [Never left Harrow]\n---\n");
    expect(origins(MAIN, merged)).toEqual(["main:lead", "main:Appearance", "main:Personality", "main:Abilities"]);
    expect(merged.markdown).toContain("An archivist.\n\n## Appearance\n\nTall.\n\n## Personality");
  });

  it("replaces the lead and matched sections, keeps main order, hides emptied ones, and places new ones", () => {
    const own = "A smuggler.\n\n## Contacts\n\nThe docks.\n\n## abilities\n\nPicks locks.\n\n## Personality\n\n## Vices\n\nGin.\n";
    const merged = mergeVersion(MAIN, own);

    // Vices follows Personality in the version, so it takes Personality's place even though that's hidden.
    expect(origins(MAIN, merged)).toEqual(["own:lead", "own:Contacts", "main:Appearance", "own:Vices", "own:abilities"]);
    expect(merged.hidden).toEqual([{ key: "personality", label: "Personality" }]);
    expect(merged.markdown).toBe("A smuggler.\n\n## Contacts\n\nThe docks.\n\n## Appearance\n\nTall.\n\n## Vices\n\nGin.\n\n## abilities\n\nPicks locks.\n");
  });

  it("maps merged offsets back to the version's own text, and nothing for inherited text", () => {
    const own = "## Abilities\n\nPicks locks.\n";
    const merged = mergeVersion(MAIN, own);
    const at = merged.markdown.indexOf("Picks locks.");

    expect(toOwnRange(merged, at, at + 12)).toEqual({ start: own.indexOf("Picks"), end: own.indexOf("Picks") + 12 });
    expect(toOwnRange(merged, merged.markdown.indexOf("Tall."), merged.markdown.indexOf("Tall.") + 5)).toBeUndefined();
  });

  it("forks the lead, a section, and hides and unhides sections in the version's own text", () => {
    const own = "---\nchanges: [Smuggler]\n---\n\n## Vices\n\nGin.\n";

    expect(forkLead(MAIN, own)).toBe("---\nchanges: [Smuggler]\n---\n\n:::infobox\ntitle: Mira\n:::\n\nAn archivist.\n\n## Vices\n\nGin.\n");
    expect(forkLead(MAIN, "")).toBe(":::infobox\ntitle: Mira\n:::\n\nAn archivist.\n");
    expect(forkSection(MAIN, own, "personality")).toBe(`${own.trimEnd()}\n\n## Personality\n\nPatient.\n\n### Habits\n\nHums.\n`);

    const hidden = hideSection(own, "Abilities");
    expect(mergeVersion(MAIN, hidden).hidden.map((section) => section.label)).toEqual(["Abilities"]);
    expect(unhideSection(hidden, "abilities")).toBe(own);
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
