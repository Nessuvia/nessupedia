import type { Root } from "mdast";
import { visit } from "unist-util-visit";
import { parseMarkdown } from "./pipeline";
import { titleKey, WIKILINK } from "./wikilinks";

const UNLINKED_NODES = new Set(["code", "inlineCode", "yaml"]);

// Code and frontmatter, where wikilink-like text is left as written.
export function unlinkedRanges(tree: Root): [number, number][] {
  const ranges: [number, number][] = [];
  visit(tree, (node) => {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (UNLINKED_NODES.has(node.type) && start !== undefined && end !== undefined) ranges.push([start, end]);
  });
  return ranges;
}

export function retargetWikilinks(markdown: string, fromTitle: string, toTitle: string): string {
  const fromKey = titleKey(fromTitle);
  const unlinked = unlinkedRanges(parseMarkdown(markdown).tree);
  const isUnlinked = (offset: number) => unlinked.some(([start, end]) => offset >= start && offset < end);

  return markdown.replace(WIKILINK, (raw: string, title: string, _heading, _label, offset: number) => {
    if (titleKey(title) !== fromKey || isUnlinked(offset)) return raw;
    return `[[${toTitle}${raw.slice(2 + title.length)}`;
  });
}
