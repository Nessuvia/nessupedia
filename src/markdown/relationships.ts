import { stringList } from "./frontmatter";
import { editFrontmatter } from "./frontmatterEdit";
import { normalizeTitle, titleError, titleKey } from "./wikilinks";

// The pages a relationship page is between, as written; names that can't be titles are skipped,
// and a repeated name counts once.
export function pairOf(frontmatter: Record<string, unknown>): string[] {
  const seen = new Set<string>();
  return stringList(frontmatter.between)
    .map(normalizeTitle)
    .filter((name) => {
      if (titleError(name) || seen.has(titleKey(name))) return false;
      seen.add(titleKey(name));
      return true;
    });
}

export function isRelationshipPage(frontmatter: Record<string, unknown>): boolean {
  return pairOf(frontmatter).length >= 2;
}

export function suggestedPairTitle(pair: string[]): string {
  return pair.map((name) => name.trim()).filter(Boolean).join(" & ");
}

// Points `between` entries naming one title at another, leaving the rest of the frontmatter as it was.
export function retargetBetween(markdown: string, fromTitle: string, toTitle: string, frontmatter: Record<string, unknown>): string {
  const names = stringList(frontmatter.between);
  if (!names.some((name) => titleKey(name) === titleKey(fromTitle))) return markdown;
  return editFrontmatter(markdown, (doc) => {
    const list = doc.createNode(names.map((name) => (titleKey(name) === titleKey(fromTitle) ? toTitle : name)));
    list.flow = true;
    doc.set("between", list);
  });
}
