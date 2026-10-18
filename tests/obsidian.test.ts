import { strToU8, zipSync } from "fflate";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WikiDatabase } from "@/db/database";
import { convertFrontmatter, convertNote, noteTags, tagCategory, vaultTitle, type NoteTargets } from "@/markdown/obsidian";
import { AssetService, type ImageEncoder } from "@/services/AssetService";
import { ChangeLog } from "@/services/ChangeLog";
import { LinkIndexer } from "@/services/LinkIndexer";
import { PageService } from "@/services/PageService";
import { VaultImporter } from "@/services/VaultImporter";
import { WikiService } from "@/services/WikiService";

const targets: NoteTargets = {
  link: (target) => ({ mira: "Mira", "archive/mira": "Mira (Archive)", theo: "Theo" })[target.toLowerCase()],
  image: (path) => (path.endsWith("portrait.png") ? "assets/portrait-0123456789.webp" : undefined),
};

describe("convertNote", () => {
  it("rewrites links to their new titles, keeping headings, labels, and the text as written", () => {
    expect(convertNote("[[Mira]] and [[Mira.md#Early life|her]] and [[Archive/Mira]].", targets)).toBe(
      "[[Mira]] and [[Mira#Early life|her]] and [[Mira (Archive)|Archive/Mira]].",
    );
  });

  it("keeps links to missing notes by name, and leaves heading-only links alone", () => {
    expect(convertNote("[[Notes/Corin Vale]] and [[#Early life]] and [[What #1]]", targets)).toBe(
      "[[Corin Vale|Notes/Corin Vale]] and [[#Early life]] and [[What#1]]",
    );
  });

  it("drops a label that only repeats the title", () => {
    expect(convertNote("[[theo|Theo]] [[Theo|Teddy]]", targets)).toBe("[[Theo]] [[Theo|Teddy]]");
  });

  it("turns image embeds and markdown images into asset embeds, and leaves other embeds as text", () => {
    expect(convertNote("![[portrait.png|300]] ![[Art/portrait.png]] ![[Theo]] ![[Movies.base#Favorites]]", targets)).toBe(
      "![[assets/portrait-0123456789.webp|300]] ![[assets/portrait-0123456789.webp]] ![[Theo]] ![[Movies.base#Favorites]]",
    );
    expect(convertNote("![Her portrait](Art/portrait%20.png) ![](portrait.png) ![](https://x.test/portrait.png)", targets)).toBe(
      "![Her portrait](Art/portrait%20.png) ![[assets/portrait-0123456789.webp]] ![](https://x.test/portrait.png)",
    );
  });

  it("hides %% comments %% and leaves code alone", () => {
    expect(convertNote("Seen %%not yet%% here.\n\n`[[Mira]]`\n\n```\n[[Theo]] %%x%%\n```\n", targets)).toBe(
      "Seen <!--not yet--> here.\n\n`[[Mira]]`\n\n```\n[[Theo]] %%x%%\n```\n",
    );
  });

  it("keeps the escaped bar that tables need", () => {
    const table = "| A | B |\n| - | - |\n| [[theo\\|him]] | ![[portrait.png\\|100]] |\n";
    expect(convertNote(table, targets)).toBe("| A | B |\n| - | - |\n| [[Theo\\|him]] | ![[assets/portrait-0123456789.webp\\|100]] |\n");
  });

  it("drops a style fragment from markdown images", () => {
    expect(convertNote("![A table](portrait.png#interface)", targets)).toBe("![[assets/portrait-0123456789.webp|A table]]");
  });
});

describe("noteTags", () => {
  it("collects frontmatter and inline tags once each, outside code and headings", () => {
    const source = "---\ntags: [character, '#draft']\n---\n# Title\n\nA #Character/main note, #draft #1 `#code` and a URL x.test/#frag.\n";
    expect(noteTags(source)).toEqual(["character", "draft", "Character/main"]);
  });

  it("reads tags written as one string", () => {
    expect(noteTags("---\ntags: one, two three\n---\n")).toEqual(["one", "two", "three"]);
  });
});

describe("convertFrontmatter", () => {
  it("unwraps linked categories, adds new ones once, and moves chosen tags out of tags", () => {
    const source = '---\ncategories:\n  - "[[Movies]]"\ntags: [sci-fi, todo]\nrating: 7\n---\nBody\n';
    expect(convertFrontmatter(source, { categories: ["References", "movies", "Sci-fi"], movedTags: new Set(["sci-fi"]) })).toBe(
      "---\ncategories: [Movies, References, Sci-fi]\ntags: [todo]\nrating: 7\n---\nBody\n",
    );
  });

  it("adds frontmatter only when there is something to add", () => {
    expect(convertFrontmatter("Body\n", { categories: [], movedTags: new Set() })).toBe("Body\n");
    expect(convertFrontmatter("Body\n", { categories: ["Notes"], movedTags: new Set() })).toBe("---\ncategories: [Notes]\n---\n\nBody\n");
  });

  it("keeps template placeholders in frontmatter as written", () => {
    const source = '---\ncategories:\n  - "[[Movies]]"\ngenre: []\nlast: {{date}}\nimdbId:\n---\n';
    expect(convertFrontmatter(source, { categories: [], movedTags: new Set() })).toBe("---\ncategories: [Movies]\ngenre: []\nlast: {{date}}\nimdbId:\n---\n");
  });

  it("drops aliases a page can't use and leaves broken YAML alone", () => {
    expect(convertFrontmatter("---\naliases: [Mi, 'M#1']\n---\n", { categories: [], movedTags: new Set() })).toBe("---\naliases: [Mi]\n---\n");
    expect(convertFrontmatter("---\na: [\n---\n", { categories: ["X"], movedTags: new Set() })).toBe("---\na: [\n---\n");
  });
});

describe("vaultTitle and tagCategory", () => {
  it("makes usable titles and category names", () => {
    expect(vaultTitle("Q&A #2 [draft].md")).toBe("Q&A -2 -draft-");
    expect(vaultTitle(".md")).toBe("Untitled");
    expect(tagCategory("character/ main/")).toBe("character › main");
  });
});

describe("VaultImporter", () => {
  let db: WikiDatabase;
  let wikis: WikiService;
  let pages: PageService;
  let importer: VaultImporter;

  const png = new Uint8Array([137, 80, 78, 71]);
  const encode = vi.fn<ImageEncoder>(async () => undefined);
  const vault = (files: Record<string, string | Uint8Array>) =>
    zipSync(Object.fromEntries(Object.entries(files).map(([path, data]) => [path, typeof data === "string" ? strToU8(data) : data])));

  beforeEach(async () => {
    db = new WikiDatabase(`test-${crypto.randomUUID()}`);
    const links = new LinkIndexer(db);
    wikis = new WikiService(db);
    pages = new PageService(db, links, new ChangeLog(db));
    importer = new VaultImporter(db, links, new AssetService(db, encode), wikis);
  });

  const sample = () =>
    vault({
      "Ashfall/.obsidian/app.json": "{}",
      "Ashfall/.obsidian/templates.json": '{"folder":"Templates/"}',
      "Ashfall/Readme.md": "Start with [[Mira]] or [[Characters/Theo|Theo]].\n",
      "Ashfall/Characters/Mira.md": "---\ntags: [lead]\n---\nKnows [[Theo]] and [[Mira#Childhood]]. #draft\n\n![[portrait.png|200]]\n",
      "Ashfall/Characters/Theo.md": "Friends with [[Mira]].\n",
      "Ashfall/Archive/Mira.md": "An older [[Mira]] note. #draft\n",
      "Ashfall/Attachments/portrait.png": png,
      "Ashfall/Templates/Character.md": "---\ncategories: ['[[Characters]]']\n---\n## {{title}}\n",
      "Ashfall/notes.pdf": "pdf",
      "__MACOSX/Ashfall/._Readme.md": "junk",
    });

  it("reads a vault zipped in its folder, leaving out settings and other files", async () => {
    const scan = await importer.scan(sample(), "ignored.zip");
    expect(scan.name).toBe("Ashfall");
    expect(scan.notes.map(({ path, title }) => [path, title])).toEqual([
      ["Readme.md", "Readme"],
      ["Archive/Mira.md", "Mira"],
      ["Characters/Mira.md", "Mira (Characters)"],
      ["Characters/Theo.md", "Theo"],
    ]);
    expect(scan.templates.map(({ title }) => title)).toEqual(["Character"]);
    expect(scan.images.map(({ path }) => path)).toEqual(["Attachments/portrait.png"]);
    expect(scan.skipped).toBe(1);
    expect(scan.tags).toEqual([
      { key: "draft", name: "draft", count: 2 },
      { key: "lead", name: "lead", count: 1 },
    ]);
  });

  it("imports notes as pages with folder and chosen tag categories, resolved links, images, and templates", async () => {
    const wiki = await importer.importVault(await importer.scan(sample()), { categoryTags: ["lead"] });
    expect(wiki.name).toBe("Ashfall");

    const mira = await pages.getByTitle(wiki.id, "Mira (Characters)");
    expect(mira!.body).toMatch(/^---\ncategories: \[Characters, lead\]\n---\n/);
    expect(mira!.body).toContain("Knows [[Theo]] and [[Mira (Characters)#Childhood|Mira]]. #draft");
    expect(mira!.body).toMatch(/!\[\[assets\/portrait-[0-9a-f]{10}\.png\|200\]\]/);
    expect(mira!.categoryKeys).toEqual(["characters", "lead"]);

    const readme = await pages.getByTitle(wiki.id, "Readme");
    expect(readme!.body).toBe("Start with [[Mira]] or [[Theo]].\n");
    expect(await pages.getByTitle(wiki.id, "Main Page")).toMatchObject({ body: expect.stringContaining("Start with [[Readme]].") });

    const [template] = await db.templates.where("wikiId").equals(wiki.id).toArray();
    expect(template).toMatchObject({ name: "Character (2)", frontmatter: { categories: ["Characters"] } });

    const changes = await db.changes.where("wikiId").equals(wiki.id).toArray();
    expect(changes).toHaveLength(5);
    expect(changes.every(({ kind, summary }) => kind === "create" && summary === "Imported from Obsidian")).toBe(true);
    expect(await db.links.where("wikiId").equals(wiki.id).filter((link) => !link.toPageId).count()).toBe(0);
  });

  it("names the wiki from the ZIP when the vault isn't wrapped in a folder, and numbers names in use", async () => {
    await wikis.create("Notes");
    const scan = await importer.scan(vault({ "One.md": "Hi\n", "Sub/Two.md": "There\n" }), "Notes.zip");
    expect(scan.name).toBe("Notes");
    expect((await importer.importVault(scan)).name).toBe("Notes (2)");
  });

  it("refuses files that aren't vaults, and removes a wiki whose import fails", async () => {
    await expect(importer.scan(strToU8("nope"))).rejects.toThrow("isn't a ZIP");
    await expect(importer.scan(vault({ "a.png": png }))).rejects.toThrow("no notes");

    const scan = await importer.scan(vault({ "One.md": "Hi\n" }));
    vi.spyOn(db.pages, "bulkAdd").mockRejectedValueOnce(new Error("disk full"));
    await expect(importer.importVault(scan, { name: "Broken" })).rejects.toThrow("disk full");
    expect(await db.wikis.count()).toBe(0);
  });
});
