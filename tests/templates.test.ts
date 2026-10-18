import { beforeEach, describe, expect, it } from "vitest";
import { WikiDatabase } from "@/db/database";
import { parseMarkdown, renderMarkdown } from "@/markdown/pipeline";
import { instantiateTemplate, templateParts } from "@/markdown/templates";
import { ChangeLog } from "@/services/ChangeLog";
import { LinkIndexer } from "@/services/LinkIndexer";
import { PageService } from "@/services/PageService";
import { TemplateService } from "@/services/TemplateService";
import { WikiService } from "@/services/WikiService";
import { BUNDLED_TEMPLATES } from "@/templates";

const template = (body: string) => ({ name: "Sample", body });

const SAMPLE = [
  "---",
  "description: A sample.",
  "categories: [Characters]",
  "optional: [Trivia, pressure profile]",
  "---",
  "",
  ":::infobox",
  "title: {{title}}",
  "Age:",
  ":::",
  "",
  "<!-- Who is {{title}}? -->",
  "",
  "## Personality",
  "",
  "Kind.",
  "",
  ":::pressure",
  "Triggers:",
  ":::",
  "",
  "### Habits",
  "",
  "Hums.",
  "",
  "## Trivia",
  "",
  "Likes tea.",
  "",
].join("\n");

describe("templateParts", () => {
  it("finds sections and top-level blocks, marking the ones the template lists as optional", () => {
    expect(templateParts(SAMPLE).map(({ label, kind, optional }) => ({ label, kind, optional }))).toEqual([
      { label: "Infobox", kind: "infobox", optional: false },
      { label: "Personality", kind: "section", optional: false },
      { label: "Pressure profile", kind: "pressure", optional: true },
      { label: "Trivia", kind: "section", optional: true },
    ]);
  });

  it("gives a section everything up to the next h2, subsections included", () => {
    const personality = templateParts(SAMPLE).find((part) => part.label === "Personality")!;
    expect(SAMPLE.slice(personality.start, personality.end)).toMatch(/^## Personality[\s\S]*Hums\.\n\n$/);
  });
});

describe("instantiateTemplate", () => {
  it("fills in the title and swaps template-only keys for the template's name", () => {
    const page = instantiateTemplate(template(SAMPLE), { title: "Mira" });
    expect(parseMarkdown(page).frontmatter).toEqual({ categories: ["Characters"], template: "Sample" });
    expect(page).toContain("title: Mira\n");
    expect(page).toContain("<!-- Who is Mira? -->");
    expect(page).not.toContain("{{title}}");
  });

  it("leaves out excluded parts without leaving gaps, including blocks inside kept sections", () => {
    const parts = templateParts(SAMPLE);
    const exclude = parts.filter((part) => part.label === "Trivia" || part.kind === "pressure").map((part) => part.key);
    const page = instantiateTemplate(template(SAMPLE), { title: "Mira", exclude });

    expect(page).not.toMatch(/Trivia|Likes tea|:::pressure/);
    expect(page).toContain("Kind.\n\n### Habits\n\nHums.\n");
    expect(page).not.toMatch(/\n{3,}/);
    expect(page.endsWith("Hums.\n")).toBe(true);
  });

  it("keeps a template without frontmatter free of everything but the template key", () => {
    expect(instantiateTemplate(template("## Notes\n"), { title: "X" })).toBe("---\ntemplate: Sample\n---\n\n## Notes\n");
  });
});

describe("bundled templates", () => {
  it.each(BUNDLED_TEMPLATES.map((bundled) => [bundled.name, bundled] as const))("%s builds a page that renders without its hints", (_name, bundled) => {
    expect(bundled.frontmatter.description).toEqual(expect.any(String));
    const page = instantiateTemplate(bundled, { title: "Mira" });
    const { html } = renderMarkdown(parseMarkdown(page).tree);
    expect(html).not.toMatch(/<!--|\{\{title\}\}/);
    expect(templateParts(bundled.body).length).toBeGreaterThan(1);
  });
});

describe("TemplateService", () => {
  let db: WikiDatabase;
  let pages: PageService;
  let templates: TemplateService;
  let wikiId: string;

  beforeEach(async () => {
    db = new WikiDatabase(`test-${crypto.randomUUID()}`);
    pages = new PageService(db, new LinkIndexer(db), new ChangeLog(db));
    templates = new TemplateService(db);
    wikiId = (await new WikiService(db).create("Ashfall")).id;
  });

  it("lists bundled templates first, then the wiki's own by name", async () => {
    await templates.create(wikiId, "Villain", "");
    await templates.create(wikiId, "Faction", "");
    await templates.create((await new WikiService(db).create("Other")).id, "Elsewhere", "");

    expect((await templates.list(wikiId)).map((template) => template.name)).toEqual([
      "Character",
      "Location",
      "Relationship",
      "Faction",
      "Villain",
    ]);
  });

  it("saves a page as a template without the keys that only describe that page", async () => {
    const page = await pages.create({
      wikiId,
      title: "Mira",
      body: "---\naliases: [Mi]\ncategories: [Characters]\ntemplate: Character\n---\n\n## Personality\n\nKind.",
    });
    const template = await templates.fromPage(page, "Archivist");

    expect(template.body).toBe("---\ncategories: [Characters]\n---\n\n## Personality\n\nKind.");
    expect(template.frontmatter).toEqual({ categories: ["Characters"] });
    expect(await templates.get(template.id)).toEqual(template);
  });

  it("rejects bad names and names already taken, bundled ones included, ignoring case", async () => {
    const villain = await templates.create(wikiId, "Villain", "");

    await expect(templates.create(wikiId, "  ", "")).rejects.toThrow("needs a name");
    await expect(templates.create(wikiId, "A/B", "")).rejects.toThrow("can't contain");
    await expect(templates.create(wikiId, "character", "")).rejects.toThrow('"Character" already exists');
    await expect(templates.create(wikiId, "VILLAIN", "")).rejects.toThrow('"Villain" already exists');
    expect(await templates.rename(villain.id, "villain")).toMatchObject({ name: "villain" });
  });

  it("duplicates, edits, renames, and deletes the wiki's own templates but never bundled ones", async () => {
    const copy = await templates.duplicate("bundled:location", wikiId, "City");
    expect(copy.body).toBe(BUNDLED_TEMPLATES[1]!.body);

    await templates.save(copy.id, "---\ndescription: A city.\n---\n\n## Districts\n");
    await templates.rename(copy.id, "Big city");
    expect(await templates.get(copy.id)).toMatchObject({ name: "Big city", frontmatter: { description: "A city." } });

    await templates.delete(copy.id);
    expect(await templates.get(copy.id)).toBeUndefined();

    await expect(templates.save("bundled:character", "")).rejects.toThrow("can't be changed");
    await expect(templates.rename("bundled:character", "Person")).rejects.toThrow("can't be changed");
    await expect(templates.delete("bundled:character")).rejects.toThrow("can't be changed");
  });
});
