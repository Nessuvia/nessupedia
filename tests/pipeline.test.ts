import { describe, expect, it } from "vitest";
import { parseMarkdown, renderMarkdown } from "@/markdown/pipeline";
import { extractWikilinks } from "@/markdown/wikilinks";

const source = `---
title: Mira
aliases: [Mi, The Archivist]
---

# Mira

Mira grew up with [[Theo]] in [[Ashfall|the old city]].

## Early life

See [[Theo#Early life]] and ![[assets/mira.png]].
`;

describe("parseMarkdown", () => {
  it("reads frontmatter", () => {
    const { frontmatter, frontmatterError } = parseMarkdown(source);
    expect(frontmatterError).toBeUndefined();
    expect(frontmatter).toEqual({ title: "Mira", aliases: ["Mi", "The Archivist"] });
  });

  it("reports invalid frontmatter without throwing", () => {
    const { frontmatter, frontmatterError } = parseMarkdown("---\ntitle: [unclosed\n---\n\nBody");
    expect(frontmatter).toEqual({});
    expect(frontmatterError).toBeTruthy();
  });

  it("extracts wikilinks with headings and labels", () => {
    const links = extractWikilinks(parseMarkdown(source).tree);
    expect(links.map(({ title, heading, label }) => ({ title, heading, label }))).toEqual([
      { title: "Theo", heading: undefined, label: undefined },
      { title: "Ashfall", heading: undefined, label: "the old city" },
      { title: "Theo", heading: "Early life", label: undefined },
    ]);
  });

  it("keeps block positions for click-to-edit", () => {
    const { tree } = parseMarkdown(source);
    const paragraph = tree.children.find((node) => node.type === "paragraph");
    expect(paragraph?.position?.start.offset).toBe(source.indexOf("Mira grew up"));
  });
});

describe("renderMarkdown", () => {
  const render = (markdown: string) =>
    renderMarkdown(parseMarkdown(markdown).tree, { pageExists: (title) => title === "Theo" });

  it("renders existing and missing pages", () => {
    const html = render(source);
    expect(html).toContain('<a href="/wiki/Theo" class="wikilink" data-wikilink="Theo">Theo</a>');
    expect(html).toContain('<a href="/wiki/Ashfall" class="wikilink new" data-wikilink="Ashfall">the old city</a>');
  });

  it("links headings to slugged ids", () => {
    const html = render(source);
    expect(html).toContain('<h2 id="user-content-early-life">Early life</h2>');
    expect(html).toContain('href="/wiki/Theo#user-content-early-life"');
  });

  it("omits frontmatter from output", () => {
    expect(render(source)).not.toContain("aliases");
  });

  it("strips unsafe html", () => {
    const html = render('<script>alert(1)</script>\n\n<a href="javascript:alert(1)">x</a>');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
  });
});
