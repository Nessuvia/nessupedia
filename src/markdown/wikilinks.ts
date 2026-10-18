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
  return title.normalize("NFC").trim().replace(/\s+/g, " ").replace(/ ?\/ ?/g, "/").toLowerCase();
}

// Trims each segment of a subpage title, so "Mira / History" is stored as "Mira/History".
export function normalizeTitle(title: string): string {
  return title
    .split("/")
    .map((segment) => segment.trim())
    .join("/");
}

const TITLE_FORBIDDEN = /[[\]|#]/;

// The generated Relationships tab takes this name under every page.
export const RELATIONSHIPS_TAB = "Relationships";

export function titleError(title: string): string | undefined {
  if (!title.trim()) return "A page needs a title";
  if (TITLE_FORBIDDEN.test(title)) return "Page titles can't contain [ ] | or #";
  const segments = normalizeTitle(title).split("/");
  if (segments.some((segment) => !segment)) return "Each part of a title around a / needs a name";
  if (segments.length > 1 && titleKey(segments.at(-1)!) === titleKey(RELATIONSHIPS_TAB)) {
    return `"${RELATIONSHIPS_TAB}" is kept for the generated tab`;
  }
  return undefined;
}

export function extractWikilinks(tree: Root): WikiLink[] {
  const links: WikiLink[] = [];
  visit(tree, "wikiLink", (node) => {
    links.push(node);
  });
  return links;
}
