import { describe, expect, it } from "vitest";
import { parseMarkdown, renderMarkdown } from "@/markdown/pipeline";
import { instantiateTemplate, templateParts } from "@/markdown/templates";
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
