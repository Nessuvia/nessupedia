import type { Page } from "@/db/types";
import { readAutoContext } from "@/markdown/autoContext";
import { titleKey } from "@/markdown/wikilinks";

export interface MentionName {
  name: string;
  pageId: string;
}

export interface Mention {
  pageId: string;
  text: string;
  start: number;
  end: number;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Finds names in text: case-insensitive, whole words only, and the longest name wins where several start at once.
export class MentionFinder {
  private readonly owners = new Map<string, string>();
  private readonly pattern?: RegExp;

  // When two pages share a name, the earlier entry keeps it.
  constructor(names: readonly MentionName[]) {
    for (const { name, pageId } of names) {
      const key = titleKey(name);
      if (key && !this.owners.has(key)) this.owners.set(key, pageId);
    }
    const alternatives = [...this.owners.keys()]
      .sort((a, b) => b.length - a.length)
      .map((key) => key.split(" ").map(escape).join("\\s+"));
    if (alternatives.length > 0) this.pattern = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives.join("|")})(?![\\p{L}\\p{N}_])`, "giu");
  }

  // Titles, then aliases, then triggers of every page auto-context may use.
  static forPages(pages: readonly Page[]): MentionFinder {
    const enabled = pages.filter((page) => readAutoContext(page.frontmatter).enabled);
    return new MentionFinder([
      ...enabled.map((page) => ({ name: page.title, pageId: page.id })),
      ...enabled.flatMap((page) => page.aliases.map((name) => ({ name, pageId: page.id }))),
      ...enabled.flatMap((page) => readAutoContext(page.frontmatter).triggers.map((name) => ({ name, pageId: page.id }))),
    ]);
  }

  find(text: string): Mention[] {
    if (!this.pattern) return [];
    const mentions: Mention[] = [];
    for (const match of text.matchAll(this.pattern)) {
      const pageId = this.owners.get(titleKey(match[0]));
      if (pageId) mentions.push({ pageId, text: match[0], start: match.index, end: match.index + match[0].length });
    }
    return mentions;
  }

  count(texts: readonly string[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const { pageId } of texts.flatMap((text) => this.find(text))) counts.set(pageId, (counts.get(pageId) ?? 0) + 1);
    return counts;
  }
}
