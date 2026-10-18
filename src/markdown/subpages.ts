import { stringList } from "./frontmatter";
import { normalizeTitle, titleKey } from "./wikilinks";

export function titleSegments(title: string): string[] {
  return normalizeTitle(title).split("/");
}

// The page whose tab bar a title sits under: "Mira" for "Mira/History/Childhood".
export function topTitle(title: string): string {
  return titleSegments(title)[0]!;
}

// The tab a title belongs to: itself for a top page or a direct subpage, its ancestor for deeper ones.
export function tabTitle(title: string): string {
  return titleSegments(title).slice(0, 2).join("/");
}

export function subpageName(title: string): string {
  return titleSegments(title).at(-1)!;
}

export function isDirectSubpage(title: string, parent: string): boolean {
  const segments = titleSegments(title);
  return segments.length === titleSegments(parent).length + 1 && titleKey(segments.slice(0, -1).join("/")) === titleKey(parent);
}

// Orders a page's subpages by its `tabs` frontmatter, then alphabetically.
export function orderTabs<T extends { title: string }>(subpages: T[], frontmatter: Record<string, unknown> = {}): T[] {
  const order = stringList(frontmatter.tabs).map(titleKey);
  const rank = (page: T) => {
    const index = order.indexOf(titleKey(subpageName(page.title)));
    return index === -1 ? order.length : index;
  };
  return [...subpages].sort((a, b) => rank(a) - rank(b) || subpageName(a.title).localeCompare(subpageName(b.title)));
}
