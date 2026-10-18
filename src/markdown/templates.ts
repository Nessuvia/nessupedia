import type { Template } from "@/db/types";
import { stringList } from "./frontmatter";
import { editFrontmatter } from "./frontmatterEdit";
import { parseMarkdown } from "./pipeline";
import { plainText } from "./plainText";
import { titleKey } from "./wikilinks";

// A piece of a template that page creation can leave out: a `##` section with everything under it,
// or an infobox or pressure profile that sits directly in the page.
export interface TemplatePart {
  key: string;
  label: string;
  kind: "section" | "infobox" | "pressure";
  optional: boolean;
  start: number;
  end: number;
}

const BLOCK_LABELS = { infobox: "Infobox", pressure: "Pressure profile" } as const;

export const TEMPLATE_ONLY_KEYS = ["description", "optional"];

export function templateParts(body: string): TemplatePart[] {
  const { tree, frontmatter } = parseMarkdown(body);
  const optional = new Set(stringList(frontmatter.optional).map(titleKey));
  const parts: TemplatePart[] = [];
  let section: TemplatePart | undefined;

  for (const node of tree.children) {
    const start = node.position!.start.offset!;
    const end = node.position!.end.offset!;
    if (node.type === "heading" && node.depth <= 2) {
      if (section) section.end = start;
      section = undefined;
      if (node.depth === 2) {
        const label = plainText({ type: "root", children: [node] }).trim();
        section = { key: `section:${start}`, label, kind: "section", optional: optional.has(titleKey(label)), start, end: body.length };
        parts.push(section);
      }
      continue;
    }
    if (node.type === "infobox" || node.type === "pressure") {
      const label = BLOCK_LABELS[node.type];
      parts.push({ key: `${node.type}:${start}`, label, kind: node.type, optional: optional.has(titleKey(label)), start, end });
    }
  }
  return parts;
}

function withoutRanges(text: string, ranges: { start: number; end: number }[]): string {
  let result = "";
  let at = 0;
  for (const { start, end } of [...ranges].sort((a, b) => a.start - b.start)) {
    if (end <= at) continue;
    result += text.slice(at, Math.max(at, start));
    at = end;
  }
  return result + text.slice(at);
}

export interface InstantiateOptions {
  title: string;
  // Keys of the parts to leave out.
  exclude?: Iterable<string>;
}

// Builds a new page's markdown: drops excluded parts, fills in `{{title}}`, and swaps the template-only
// frontmatter keys for a `template` key naming the template.
export function instantiateTemplate(template: Pick<Template, "name" | "body">, { title, exclude = [] }: InstantiateOptions): string {
  const excluded = new Set(exclude);
  const removed = templateParts(template.body).filter((part) => excluded.has(part.key));
  const kept = withoutRanges(template.body, removed)
    .replace(/\n{3,}/g, "\n\n")
    .replaceAll("{{title}}", title);

  return editFrontmatter(kept, (doc) => {
    for (const key of TEMPLATE_ONLY_KEYS) if (doc.contents) doc.delete(key);
    doc.set("template", template.name);
  }).replace(/\n*$/, "\n");
}

export function templateDescription(template: Pick<Template, "frontmatter">): string {
  const { description } = template.frontmatter;
  return typeof description === "string" ? description : "";
}
