import { describe, expect, it } from "vitest";
import { editSummary, spliceBlock, StaleBlockError } from "@/markdown/blocks";
import { setCanonTier, shiftTier } from "@/markdown/canon";
import { joinDirective, splitDirective } from "@/markdown/directiveSource";
import { parseFields, parseInfobox, serializeFields, serializeInfobox } from "@/markdown/fields";
import { parseMarkdown, renderMarkdown } from "@/markdown/pipeline";
import { plainText } from "@/markdown/plainText";
import { retargetWikilinks } from "@/markdown/retarget";
import { extractWikilinks } from "@/markdown/wikilinks";

const render = (markdown: string) => renderMarkdown(parseMarkdown(markdown).tree);
const html = (markdown: string) => render(markdown).html;

const infobox = `:::infobox
title: Mira Vale
Species: Human
=== Adult
image: assets/mira.webp | Age 30
## Biographical
Born: 1203, [[Harrow]]
=== Young
image: assets/young.webp | Age 12
image: assets/young-2.webp
:::`;

describe("field lines", () => {
  it("reads labels, continuations, and unlabeled rows", () => {
    expect(parseFields("Triggers: Loud rooms.\nCoping: Jokes.\n  Never in front of [[Theo]].\n\n  Then leaves.\nShe hums.\nhttp://x.y")).toEqual([
      { label: "Triggers", value: "Loud rooms." },
      { label: "Coping", value: "Jokes.\nNever in front of [[Theo]].\n\nThen leaves." },
      { label: "", value: "She hums." },
      { label: "", value: "http://x.y" },
    ]);
  });

  it("round-trips fields", () => {
    const fields = [
      { label: "Coping", value: "Jokes.\nNever in front of [[Theo]].\n\nThen leaves." },
      { label: "Aftermath", value: "" },
      { label: "", value: "" },
    ];
    const written = serializeFields(fields);
    expect(written).toBe("Coping: Jokes.\n  Never in front of [[Theo]].\n\n  Then leaves.\nAftermath:");
    expect(parseFields(written)).toEqual(fields.slice(0, 2));
  });

  it("parses and round-trips infobox tabs, images, and groups", () => {
    const data = parseInfobox(infobox.split("\n").slice(1, -1).join("\n"));
    expect(data.title).toBe("Mira Vale");
    expect(data.shared.groups).toEqual([{ label: "", fields: [{ label: "Species", value: "Human" }] }]);
    expect(data.tabs.map((tab) => tab.label)).toEqual(["Adult", "Young"]);
    expect(data.tabs[0]!.images).toEqual([{ path: "assets/mira.webp", caption: "Age 30" }]);
    expect(data.tabs[0]!.groups[0]).toEqual({ label: "Biographical", fields: [{ label: "Born", value: "1203, [[Harrow]]" }] });
    expect(data.tabs[1]!.images).toHaveLength(2);
    expect(parseInfobox(serializeInfobox(data))).toEqual(data);
  });
});

describe("directives", () => {
  it("renders an infobox with tabs, image tabs, groups, and links", () => {
    const output = html(infobox);
    expect(output).toContain('<aside class="infobox" data-kind="infobox" data-start="0"');
    expect(output).toContain('<div class="infobox-title">Mira Vale</div>');
    expect(output).toMatch(/<button type="button" role="tab" data-tab="0" aria-selected="true">Adult<\/button>/);
    expect(output).toMatch(/data-panel="1" hidden>/);
    expect(output).toContain('<img class="asset-image" data-asset="assets/mira.webp" alt="Age 30">');
    expect(output).toContain('<div class="infobox-group-title">Biographical</div>');
    expect(output).toContain('data-wikilink="Harrow"');
    expect(output).toContain(">Image 2</button>");
  });

  it("indexes and searches links inside directive values", () => {
    const { tree } = parseMarkdown(`${infobox}\n\n:::pressure\nCoping: Jokes about [[Theo]].\n:::`);
    expect(extractWikilinks(tree).map((link) => link.title)).toEqual(["Harrow", "Theo"]);
    expect(plainText(tree)).toContain("Jokes about Theo");
  });

  it("renders pressure fields with markdown values", () => {
    const output = html(":::pressure\nTriggers: **Loud** rooms.\nCoping: First.\n\n  - a\n  - b\n:::");
    expect(output).toContain('<div class="field-label">Triggers</div><div class="field-value"><strong>Loud</strong> rooms.</div>');
    expect(output).toMatch(/<div class="field-value"><p>First.<\/p>\s*<ul>/);
  });

  it("renders canon blocks and inline marks with tiers and source ranges", () => {
    const source = ":::canon{tier=likely}\nShe was born in winter :canon[during the frost]{tier=idea}.\n:::\n\n:::canon\nPlain.\n:::";
    const output = html(source);
    expect(output).toContain('class="canon canon-soft" data-kind="canon" data-tier="soft" data-start="0"');
    expect(output).toContain('aria-label="Promote to Canon"');
    const inline = source.indexOf(":canon[");
    expect(output).toContain(`class="canon-inline canon-maybe" data-tier="maybe" title="Idea" data-start="${inline}"`);
    const hard = output.slice(output.indexOf('class="canon canon-hard"'));
    expect(hard).toContain('aria-label="Demote to Likely"');
    expect(hard).not.toContain('aria-label="Promote to');
  });

  it("leaves text that only looks like a directive alone", () => {
    expect(html("Watch re:Zero at 10:30 and [[re:Zero]].\n\n::stray")).toBe(
      '<p data-start="0" data-end="39">Watch re:Zero at 10:30 and <a href="/wiki/re%3AZero" class="wikilink" data-wikilink="re:Zero">re:Zero</a>.</p>\n<p data-start="41" data-end="48">::stray</p>',
    );
  });
});

describe("canon tiers", () => {
  it("shifts within Idea, Likely, Canon", () => {
    expect(shiftTier("maybe", 1)).toBe("soft");
    expect(shiftTier("hard", 1)).toBeUndefined();
    expect(shiftTier("maybe", -1)).toBeUndefined();
  });

  it("rewrites only the tier attribute", () => {
    expect(setCanonTier(":::canon{tier=soft #x}\nText {tier=soft}\n:::", "hard")).toBe(":::canon{tier=hard #x}\nText {tier=soft}\n:::");
    expect(setCanonTier(":::canon\nText\n:::", "soft")).toBe(":::canon{tier=soft}\nText\n:::");
    expect(setCanonTier(':canon[a [b] c]{.x tier="maybe"}', "soft")).toBe(":canon[a [b] c]{.x tier=soft}");
    expect(setCanonTier(":canon[a]{.x}", "soft")).toBe(":canon[a]{.x tier=soft}");
    expect(setCanonTier(":canon[a]", "hard")).toBe(":canon[a]{tier=hard}");
  });
});

describe("callouts", () => {
  it("renders titles, default titles, aliases, and unknown types", () => {
    expect(html("> [!faq] Why **now**?\n> Because.")).toBe(
      '<div class="callout callout-question" data-start="0" data-end="32"><div class="callout-title"><span class="callout-icon"></span><span>Why <strong>now</strong>?</span></div><div class="callout-content">\n<p>Because.</p>\n</div></div>',
    );
    expect(html("> [!tip]\n> Body")).toContain('<span>Tip</span></div><div class="callout-content">\n<p>Body</p>');
    expect(html("> [!whatever] X")).toContain('class="callout callout-note"');
    expect(html("> Plain quote")).toContain("<blockquote");
  });

  it("renders foldable callouts as details", () => {
    expect(html("> [!warning]- Spoilers\n> Hidden")).toMatch(/^<details class="callout callout-warning"[^>]*><summary class="callout-title">/);
    expect(html("> [!warning]+ Spoilers\n> Shown")).toMatch(/^<details class="callout callout-warning"[^>]* open>/);
  });
});

describe("image embeds", () => {
  it("renders image embeds with alt text or size and leaves other embeds as text", () => {
    expect(html("![[assets/a.webp]] ![[b.png|A cat]] ![[c.jpg|300]] ![[Theo]]")).toBe(
      '<p data-start="0" data-end="60"><img class="asset-image" data-asset="assets/a.webp" alt="a.webp"> <img class="asset-image" data-asset="b.png" alt="A cat"> <img class="asset-image" data-asset="c.jpg" alt="c.jpg" width="300"> ![[Theo]]</p>',
    );
  });

  it("keeps embeds out of the link index and rename rewrites", () => {
    expect(extractWikilinks(parseMarkdown("![[Theo.png]] [[Theo]]").tree)).toHaveLength(1);
    expect(retargetWikilinks("![[Theo.png]] [[Theo]]", "Theo", "Teo")).toBe("![[Theo.png]] [[Teo]]");
  });
});

describe("block editing", () => {
  const body = "Intro.\n\n## Early life\n\nFirst.\n\nSecond.\n";

  it("splices a block and refuses when it changed underneath", () => {
    const start = body.indexOf("First.");
    expect(spliceBlock(body, start, start + 6, "First.", "Changed.\n\nAdded.\n\n")).toBe(
      "Intro.\n\n## Early life\n\nChanged.\n\nAdded.\n\nSecond.\n",
    );
    expect(() => spliceBlock(body, start, start + 6, "Fist.", "x")).toThrow(StaleBlockError);
  });

  it("removes an emptied block with its blank lines", () => {
    const start = body.indexOf("First.");
    expect(spliceBlock(body, start, start + 6, "First.", "  \n")).toBe("Intro.\n\n## Early life\n\nSecond.\n");
    const last = body.indexOf("Second.");
    expect(spliceBlock(body, last, last + 7, "Second.", "")).toBe("Intro.\n\n## Early life\n\nFirst.\n");
  });

  it("summarizes edits by section", () => {
    const { tree } = parseMarkdown(body);
    expect(editSummary(tree, body.indexOf("Second."))).toBe("Edited “Early life”");
    expect(editSummary(tree, 0)).toBe("Edited the introduction");
  });

  it("splits and rejoins directive fences", () => {
    const parts = splitDirective(":::canon{tier=soft}\nText\n:::", "canon");
    expect(parts).toEqual({ open: ":::canon{tier=soft}", inner: "Text", close: ":::" });
    expect(joinDirective({ ...parts, inner: "New\n\n" })).toBe(":::canon{tier=soft}\nNew\n:::");
    expect(splitDirective(":::pressure\nA: b", "pressure")).toEqual({ open: ":::pressure", inner: "A: b", close: ":::" });
  });
});

describe("blocks", () => {
  it("returns top-level blocks with kinds and source ranges", () => {
    const source = "---\ntitle: X\n---\n\n## Early life\n\nText.\n\n- a\n- b\n\n:::pressure\nCoping: x\n:::";
    const { blocks } = render(source);
    expect(blocks.map(({ kind, start, end }) => [kind, source.slice(start, end)])).toEqual([
      ["h2", "## Early life"],
      ["p", "Text."],
      ["ul", "- a\n- b"],
      ["pressure", ":::pressure\nCoping: x\n:::"],
    ]);
  });
});
