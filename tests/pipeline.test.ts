import { describe, expect, it } from "vitest";
import { parseMarkdown, renderMarkdown } from "@/markdown/pipeline";
import { retargetWikilinks } from "@/markdown/retarget";
import { buildToc } from "@/markdown/toc";
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

describe("retargetWikilinks", () => {
  it("rewrites matching titles and keeps headings and labels", () => {
    const markdown = "[[Theo]], [[theo#Early life]], [[Theo|him]], [[Theodore]], ![[Theo]]";
    expect(retargetWikilinks(markdown, "Theo", "Teo")).toBe(
      "[[Teo]], [[Teo#Early life]], [[Teo|him]], [[Theodore]], ![[Theo]]",
    );
  });

  it("leaves code and frontmatter alone", () => {
    const markdown = "---\nrelated: '[[Theo]]'\n---\n\n`[[Theo]]`\n\n```\n[[Theo]]\n```\n\n[[Theo]]";
    expect(retargetWikilinks(markdown, "Theo", "Teo")).toBe(
      "---\nrelated: '[[Theo]]'\n---\n\n`[[Theo]]`\n\n```\n[[Theo]]\n```\n\n[[Teo]]",
    );
  });
});

describe("buildToc", () => {
  const toc = (depths: number[]) =>
    buildToc(depths.map((depth, index) => ({ depth, id: `h${index}`, text: `H${index}` }))).map(
      ({ level, number }) => `${level}:${number}`,
    );

  it("numbers nested sections", () => {
    expect(toc([2, 3, 3, 2, 3, 4, 2])).toEqual(["0:1", "1:1.1", "1:1.2", "0:2", "1:2.1", "2:2.1.1", "0:3"]);
  });

  it("nests skipped levels one step and keeps out-of-order levels in sequence", () => {
    expect(toc([2, 4, 3])).toEqual(["0:1", "1:1.1", "1:1.2"]);
    expect(toc([3, 2])).toEqual(["0:1", "0:2"]);
  });
});

describe("renderMarkdown", () => {
  const render = (markdown: string) =>
    renderMarkdown(parseMarkdown(markdown).tree, { pageExists: (title) => title === "Theo" }).html;

  it("renders tables with alignment, links in cells, and escaped bars", () => {
    const table = "| Name | Role |\n| :--- | ---: |\n| [[Theo\\|him]] | ![[assets/a.webp\\|100]] |\n| a \\| b | `x` |\n";
    const { html, blocks } = renderMarkdown(parseMarkdown(table).tree, { pageExists: (title) => title === "Theo" });
    expect(html).toContain('<th align="left">Name</th>');
    expect(html).toContain('<td align="left"><a href="/wiki/Theo" class="wikilink" data-wikilink="Theo">him</a></td>');
    expect(html).toMatch(/<td align="right"><img[^>]*width="100"/);
    expect(html).toContain('<td align="left">a | b</td>');
    expect(blocks).toMatchObject([{ kind: "table", start: 0, end: table.length - 1 }]);
  });

  it("renders existing and missing pages", () => {
    const html = render(source);
    expect(html).toContain('<a href="/wiki/Theo" class="wikilink" data-wikilink="Theo">Theo</a>');
    expect(html).toContain('<a href="/wiki/Ashfall" class="wikilink new" data-wikilink="Ashfall">the old city</a>');
  });

  it("links headings to slugged ids", () => {
    const html = render(source);
    expect(html).toMatch(/<h2 [^>]*id="user-content-early-life">Early life<\/h2>/);
    expect(html).toContain('href="/wiki/Theo#user-content-early-life"');
  });

  it("collects h2 to h4 headings with their final ids", () => {
    const { headings } = renderMarkdown(
      parseMarkdown("# Top\n\n## Early life\n\n### With [[Theo|him]]\n\n## Early life\n\n##### Deep").tree,
    );
    expect(headings).toEqual([
      { depth: 2, id: "user-content-early-life", text: "Early life" },
      { depth: 3, id: "user-content-with-him", text: "With him" },
      { depth: 2, id: "user-content-early-life-1", text: "Early life" },
    ]);
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
