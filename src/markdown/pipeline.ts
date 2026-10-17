import type { Element } from "hast";
import type { Root } from "mdast";
import { slug } from "github-slugger";
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkFrontmatter from "remark-frontmatter";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { readFrontmatter } from "./frontmatter";
import remarkWikilinks, { type WikiLink } from "./wikilinks";

export const HEADING_ID_PREFIX = "user-content-";

export interface ParsedMarkdown {
  tree: Root;
  frontmatter: Record<string, unknown>;
  frontmatterError?: string;
}

export interface RenderOptions {
  pageExists?: (title: string) => boolean;
  pageHref?: (title: string, heading?: string) => string;
}

const parser = unified().use(remarkParse).use(remarkFrontmatter, ["yaml"]).use(remarkWikilinks);

type AttributeRule = NonNullable<SanitizeSchema["attributes"]>[string][number];

const isClassNameRule = (rule: AttributeRule): rule is Exclude<AttributeRule, string> =>
  Array.isArray(rule) && rule[0] === "className";

const anchorRules = defaultSchema.attributes?.a ?? [];
const anchorClassRule = anchorRules.find(isClassNameRule) ?? ["className"];

const sanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [
      ...anchorRules.filter((rule) => !isClassNameRule(rule)),
      [...anchorClassRule, "wikilink", "new"],
      "dataWikilink",
    ],
  },
};

export function defaultPageHref(title: string, heading?: string): string {
  const fragment = heading ? `#${HEADING_ID_PREFIX}${slug(heading)}` : "";
  return `/wiki/${encodeURIComponent(title)}${fragment}`;
}

export function parseMarkdown(markdown: string): ParsedMarkdown {
  const tree = parser.runSync(parser.parse(markdown));
  const { frontmatter, error } = readFrontmatter(tree);
  return { tree, frontmatter, ...(error && { frontmatterError: error }) };
}

export function renderMarkdown(tree: Root, options: RenderOptions = {}): string {
  const { pageExists = () => true, pageHref = defaultPageHref } = options;

  const wikiLink = (_state: unknown, node: WikiLink): Element => ({
    type: "element",
    tagName: "a",
    properties: {
      href: pageHref(node.title, node.heading),
      className: pageExists(node.title) ? ["wikilink"] : ["wikilink", "new"],
      dataWikilink: node.title,
    },
    children: [{ type: "text", value: node.label ?? node.title }],
  });

  const processor = unified()
    .use(remarkRehype, { handlers: { wikiLink } })
    .use(rehypeSlug)
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeStringify);

  return processor.stringify(processor.runSync(structuredClone(tree)));
}
