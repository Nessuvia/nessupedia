import type { Data, Parent, PhrasingContent, Root, Text } from "mdast";
import type { Plugin } from "unified";
import { SKIP, visit } from "unist-util-visit";

export interface WikiLink {
  type: "wikiLink";
  title: string;
  heading?: string;
  label?: string;
  data?: Data;
}

declare module "mdast" {
  interface PhrasingContentMap {
    wikiLink: WikiLink;
  }
  interface RootContentMap {
    wikiLink: WikiLink;
  }
}

const WIKILINK = /(?<!!)\[\[([^[\]|#]+)(?:#([^[\]|]+))?(?:\|([^[\]]+))?\]\]/g;

function splitText(node: Text): PhrasingContent[] | undefined {
  const parts: PhrasingContent[] = [];
  let cursor = 0;

  for (const match of node.value.matchAll(WIKILINK)) {
    const [raw, title, heading, label] = match;
    if (match.index > cursor) parts.push({ type: "text", value: node.value.slice(cursor, match.index) });
    parts.push({
      type: "wikiLink",
      title: title.trim(),
      ...(heading && { heading: heading.trim() }),
      ...(label && { label: label.trim() }),
    });
    cursor = match.index + raw.length;
  }

  if (parts.length === 0) return undefined;
  if (cursor < node.value.length) parts.push({ type: "text", value: node.value.slice(cursor) });
  return parts;
}

const remarkWikilinks: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, "text", (node, index, parent: Parent | undefined) => {
      if (!parent || index === undefined) return;
      const parts = splitText(node);
      if (!parts) return;
      parent.children.splice(index, 1, ...parts);
      return [SKIP, index + parts.length];
    });
  };
};

export default remarkWikilinks;

export function extractWikilinks(tree: Root): WikiLink[] {
  const links: WikiLink[] = [];
  visit(tree, "wikiLink", (node) => {
    links.push(node);
  });
  return links;
}
