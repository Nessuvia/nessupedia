import { stringList } from "./frontmatter";
import { titleError, titleKey } from "./wikilinks";

// Names that break title rules are skipped, and a repeated name keeps its first spelling.
export function pageCategories(frontmatter: Record<string, unknown>): string[] {
  const seen = new Set<string>();
  return stringList(frontmatter.categories)
    .map((name) => name.trim())
    .filter((name) => {
      const key = titleKey(name);
      if (titleError(name) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function categoryKeys(frontmatter: Record<string, unknown>): string[] {
  return pageCategories(frontmatter).map(titleKey);
}
