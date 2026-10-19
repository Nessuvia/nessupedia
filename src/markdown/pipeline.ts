import type { Element, ElementContent, Properties, Root as HastRoot } from "hast";
import { toHtml } from "hast-util-to-html";
import type { Paragraph, Root, RootContent, Text } from "mdast";
import type { State } from "mdast-util-to-hast";
import { slug } from "github-slugger";
import remarkDirective from "remark-directive";
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import remarkFrontmatter from "remark-frontmatter";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { shiftTier, TIER_LABELS } from "./canon";
import remarkCallouts from "./callouts";
import remarkDirectives from "./directives";
import remarkEmbeds from "./embeds";
import { readFrontmatter } from "./frontmatter";
import { hintText } from "./hints";
import remarkTables from "./tables";
import type {
  Callout,
  CanonBlock,
  CanonInline,
  FieldGroupNode,
  FieldNode,
  ImageEmbed,
  InfoboxNode,
  InfoboxTabNode,
  PressureNode,
  TextMark,
} from "./nodes";
import remarkWikilinks, { type WikiLink } from "./wikilinks";

export const HEADING_ID_PREFIX = "user-content-";

export interface ParsedMarkdown {
  tree: Root;
  frontmatter: Record<string, unknown>;
  frontmatterError?: string;
}

export interface RenderedHeading {
  depth: number;
  id: string;
  text: string;
}

// A top-level block with its source range, so click-to-edit can swap it for an editor.
export interface RenderedBlock {
  html: string;
  kind: string;
  start: number;
  end: number;
}

export interface RenderedMarkdown {
  html: string;
  headings: RenderedHeading[];
  blocks: RenderedBlock[];
}

export interface SourceMark {
  id: number;
  start: number;
  end: number;
}

export interface RenderOptions {
  pageExists?: (title: string) => boolean;
  pageHref?: (title: string, heading?: string) => string;
  // Source ranges to render as `<mark class="text-mark">`, when they fall inside one stretch of plain text.
  marks?: readonly SourceMark[];
}

const parser = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkTables)
  .use(remarkDirective)
  .use(remarkDirectives, { parseFragment })
  .use(remarkCallouts)
  .use(remarkEmbeds)
  .use(remarkWikilinks);

// Infobox and pressure values run through the same parser, so they get wikilinks, marks, and images too.
function parseFragment(markdown: string): Root {
  return parser.runSync(parser.parse(markdown), markdown);
}

type AttributeRule = NonNullable<SanitizeSchema["attributes"]>[string][number];

const isClassNameRule = (rule: AttributeRule): rule is Exclude<AttributeRule, string> =>
  Array.isArray(rule) && rule[0] === "className";

const anchorRules = defaultSchema.attributes?.a ?? [];
const anchorClassRule = anchorRules.find(isClassNameRule) ?? ["className"];

// Raw HTML never reaches the tree, so these only admit what the custom handlers below produce.
const sanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "aside", "button", "figure", "figcaption", "mark"],
  attributes: {
    ...defaultSchema.attributes,
    "*": [
      ...(defaultSchema.attributes?.["*"] ?? []),
      "className",
      "dataStart",
      "dataEnd",
      "dataKind",
      "dataTier",
      "dataLabel",
      "dataTab",
      "dataPanel",
      "hidden",
      "role",
      "ariaLabel",
      "ariaSelected",
    ],
    a: [
      ...anchorRules.filter((rule) => !isClassNameRule(rule)),
      [...anchorClassRule, "wikilink", "new"],
      "dataWikilink",
    ],
    button: ["type", "dataShift"],
    mark: ["dataMark"],
    img: [...(defaultSchema.attributes?.img ?? []), "dataAsset"],
  },
};

export function headingId(heading: string): string {
  return `${HEADING_ID_PREFIX}${slug(heading)}`;
}

export function defaultPageHref(title: string, heading?: string): string {
  const fragment = heading ? `#${headingId(heading)}` : "";
  return `/wiki/${encodeURIComponent(title)}${fragment}`;
}

export function parseMarkdown(markdown: string): ParsedMarkdown {
  const tree = parser.runSync(parser.parse(markdown), markdown);
  const { frontmatter, error } = readFrontmatter(tree);
  return { tree, frontmatter, ...(error && { frontmatterError: error }) };
}

const TOC_HEADING = /^h([2-4])$/;

function textOf(node: ElementContent): string {
  if (node.type === "text") return node.value;
  return node.type === "element" ? node.children.map(textOf).join("") : "";
}

// Runs after sanitizing so ids carry their final prefix.
const rehypeCollectHeadings = (headings: RenderedHeading[]) => () => (tree: HastRoot) => {
  visit(tree, "element", (node) => {
    const depth = TOC_HEADING.exec(node.tagName)?.[1];
    const id = node.properties.id;
    if (depth && typeof id === "string") headings.push({ depth: Number(depth), id, text: textOf(node).trim() });
  });
};

const el = (tagName: string, properties: Properties, children: ElementContent[] = []): Element => ({
  type: "element",
  tagName,
  properties,
  children,
});

const text = (value: string): ElementContent => ({ type: "text", value });

function sourceRange(node: RootContent): Properties {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  return start === undefined || end === undefined ? {} : { dataStart: start, dataEnd: end };
}

function assetImage(path: string, alt: string, extra: Properties = {}): Element {
  return el("img", { className: ["asset-image"], dataAsset: path, alt, ...extra });
}

// Buttons stay hidden until hover; their glyphs and labels come from CSS so they add no text to the page.
function tierControls(tier: CanonBlock["tier"]): Element[] {
  return ([1, -1] as const).flatMap((step) => {
    const next = shiftTier(tier, step);
    if (!next) return [];
    const verb = step === 1 ? "Promote" : "Demote";
    return [el("button", { type: "button", className: ["canon-shift"], dataShift: step, ariaLabel: `${verb} to ${TIER_LABELS[next]}` })];
  });
}

// Switches between panels through PageContent's click handler; the first panel starts visible.
function tabset(labels: string[], panels: ElementContent[][], className: string): Element {
  return el("div", { className: ["tabset", className] }, [
    el(
      "div",
      { className: ["tablist"], role: "tablist" },
      labels.map((label, index) =>
        el("button", { type: "button", role: "tab", dataTab: index, ariaSelected: index === 0 ? "true" : "false" }, [text(label)]),
      ),
    ),
    ...panels.map((children, index) => el("div", { role: "tabpanel", dataPanel: index, hidden: index !== 0 }, children)),
  ]);
}

const handlers = {
  canonBlock: (state: State, node: CanonBlock): Element =>
    el("div", { className: ["canon", `canon-${node.tier}`], dataKind: "canon", dataTier: node.tier, ...sourceRange(node) }, [
      el("div", { className: ["canon-bar"] }, [el("span", { className: ["canon-badge"], dataLabel: TIER_LABELS[node.tier] }), ...tierControls(node.tier)]),
      ...state.wrap(state.all(node), true),
    ]),

  textMark: (_state: State, node: TextMark): Element => el("mark", { className: ["text-mark"], dataMark: node.id }, [text(node.value)]),

  canonInline: (state: State, node: CanonInline): Element =>
    el("span", { className: ["canon-inline", `canon-${node.tier}`], dataTier: node.tier, title: TIER_LABELS[node.tier], ...sourceRange(node) }, [
      ...state.all(node),
      el("span", { className: ["canon-bar"] }, [el("span", { className: ["canon-badge"], dataLabel: TIER_LABELS[node.tier] }), ...tierControls(node.tier)]),
    ]),

  field: (state: State, node: FieldNode): Element =>
    el("div", { className: node.label ? ["field"] : ["field", "wide"] }, [
      ...(node.label ? [el("div", { className: ["field-label"] }, [text(node.label)])] : []),
      el("div", { className: ["field-value"] }, state.all(node)),
    ]),

  fieldGroup: (state: State, node: FieldGroupNode): Element =>
    el("div", { className: ["infobox-group"] }, [
      ...(node.label ? [el("div", { className: ["infobox-group-title"] }, [text(node.label)])] : []),
      ...state.all(node),
    ]),

  infoboxTab: (state: State, node: InfoboxTabNode): Element => {
    const figures = node.images.map(({ path, caption }) =>
      el("figure", { className: ["infobox-image"] }, [
        assetImage(path, caption || path),
        ...(caption ? [el("figcaption", {}, [text(caption)])] : []),
      ]),
    );
    const images =
      figures.length > 1
        ? [tabset(node.images.map(({ caption }, index) => caption || `Image ${index + 1}`), figures.map((figure) => [figure]), "image-tabs")]
        : figures;
    return el("div", { className: ["infobox-tab"] }, [...images, ...state.all(node)]);
  },

  infobox: (state: State, node: InfoboxNode): Element => {
    const [shared, ...tabs] = node.children;
    const sharedTab = shared && (state.one(shared, node) as Element);
    return el("aside", { className: ["infobox"], dataKind: "infobox", ...sourceRange(node) }, [
      ...(node.title ? [el("div", { className: ["infobox-title"] }, [text(node.title)])] : []),
      ...(tabs.length > 0
        ? [tabset(tabs.map(({ label }) => label), tabs.map((tab) => [state.one(tab, node) as Element]), "infobox-tabs")]
        : []),
      ...(sharedTab ? [sharedTab] : []),
    ]);
  },

  pressure: (state: State, node: PressureNode): Element =>
    el("div", { className: ["pressure"], dataKind: "pressure", ...sourceRange(node) }, [
      el("div", { className: ["pressure-title"] }, [text("Pressure profile")]),
      ...state.all(node),
    ]),

  callout: (state: State, node: Callout): Element => {
    const [title, ...content] = node.children;
    const titleChildren = [el("span", { className: ["callout-icon"] }), el("span", {}, state.all(title))];
    const body = el("div", { className: ["callout-content"] }, state.wrap(content.flatMap((child) => state.one(child, node) ?? []), true));
    const properties = { className: ["callout", `callout-${node.calloutType}`], ...sourceRange(node) };
    if (!node.fold) return el("div", properties, [el("div", { className: ["callout-title"] }, titleChildren), body]);
    return el("details", { ...properties, open: node.fold === "+" }, [el("summary", { className: ["callout-title"] }, titleChildren), body]);
  },

  imageEmbed: (_state: State, node: ImageEmbed): Element =>
    assetImage(node.path, node.alt ?? node.path.split("/").pop()!, {
      ...(node.width && { width: node.width }),
      ...(node.height && { height: node.height }),
    }),
};

const hintParagraph = (hint: string, { position }: RootContent): Paragraph => ({
  type: "paragraph",
  children: [{ type: "text", value: hint }],
  position,
  data: { hProperties: { className: ["template-hint"], dataKind: "hint" } },
});

// Splits text nodes around the marks they hold. Text with escapes or entities has no reliable offsets inside it, so a node
// whose source length differs from its value is left alone.
function markText(tree: Root, marks: readonly SourceMark[]): void {
  visit(tree, "text", (node, index, parent) => {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (!parent || index === undefined || start === undefined || end === undefined || end - start !== node.value.length) return;
    const inside = marks.filter((mark) => mark.start >= start && mark.end <= end).sort((a, b) => a.start - b.start);
    if (inside.length === 0) return;
    const pieces: (Text | TextMark)[] = [];
    let at = start;
    for (const mark of inside) {
      if (mark.start < at) continue;
      if (mark.start > at) pieces.push({ type: "text", value: node.value.slice(at - start, mark.start - start) });
      pieces.push({ type: "textMark", id: mark.id, value: node.value.slice(mark.start - start, mark.end - start) });
      at = mark.end;
    }
    if (at < end) pieces.push({ type: "text", value: node.value.slice(at - start) });
    (parent.children as RootContent[]).splice(index, 1, ...pieces);
    return index + pieces.length;
  });
}

export function renderMarkdown(tree: Root, options: RenderOptions = {}): RenderedMarkdown {
  const { pageExists = () => true, pageHref = defaultPageHref } = options;
  const headings: RenderedHeading[] = [];

  const wikiLink = (_state: unknown, node: WikiLink): Element =>
    el("a", { href: pageHref(node.title, node.heading), className: pageExists(node.title) ? ["wikilink"] : ["wikilink", "new"], dataWikilink: node.title }, [
      text(node.label ?? node.title),
    ]);

  const processor = unified()
    .use(remarkRehype, { handlers: { ...handlers, wikiLink } as never })
    .use(rehypeSlug)
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeCollectHeadings(headings));

  const copy = structuredClone(tree);
  // Raw HTML never renders, but a comment on its own becomes a hint that click-to-edit can show.
  copy.children = copy.children.map((node) => {
    const hint = node.type === "html" ? hintText(node.value) : undefined;
    return hint ? hintParagraph(hint, node) : node;
  });
  if (options.marks?.length) markText(copy, options.marks);
  for (const node of copy.children) {
    const range = sourceRange(node);
    if (range.dataStart !== undefined) node.data = { ...node.data, hProperties: { ...node.data?.hProperties, ...range } };
  }

  const hast = processor.runSync(copy) as HastRoot;
  const blocks: RenderedBlock[] = [];
  for (const child of hast.children) {
    if (child.type !== "element") continue;
    const { dataStart, dataEnd, dataKind } = child.properties;
    blocks.push({
      html: toHtml(child),
      kind: typeof dataKind === "string" ? dataKind : child.tagName,
      start: Number(dataStart ?? -1),
      end: Number(dataEnd ?? -1),
    });
  }
  return { html: blocks.map(({ html }) => html).join("\n"), headings, blocks };
}
