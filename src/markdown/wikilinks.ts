import type { Node, Root } from "mdast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";
import { splitTextNodes } from "./textSplit";

export interface WikiLink extends Node {
  type: "wikiLink";
  title: string;
  heading?: string;
  label?: string;
}

declare module "mdast" {
  interface PhrasingContentMap {
    wikiLink: WikiLink;
  }
  interface RootContentMap {
    wikiLink: WikiLink;
  }
}

export const WIKILINK = /(?<!!)\[\[([^[\]|#]+)(?:#([^[\]|]+))?(?:\|([^[\]]+))?\]\]/g;

const toWikiLink = ([, title = "", heading, label]: RegExpExecArray): WikiLink => ({
  type: "wikiLink",
  title: title.trim(),
  ...(heading && { heading: heading.trim() }),
  ...(label && { label: label.trim() }),
});

const remarkWikilinks: Plugin<[], Root> = () => (tree) => splitTextNodes(tree, WIKILINK, toWikiLink);

export default remarkWikilinks;

export function titleKey(title: string): string {
  return title.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

const TITLE_FORBIDDEN = /[[\]|#]/;

export function titleError(title: string): string | undefined {
  if (!title.trim()) return "A page needs a title";
  if (TITLE_FORBIDDEN.test(title)) return "Page titles can't contain [ ] | or #";
  return undefined;
}

export function extractWikilinks(tree: Root): WikiLink[] {
  const links: WikiLink[] = [];
  visit(tree, "wikiLink", (node) => {
    links.push(node);
  });
  return links;
}
