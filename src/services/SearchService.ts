import type { WikiDatabase } from "@/db/database";
import type { Page } from "@/db/types";
import { parseMarkdown } from "@/markdown/pipeline";
import { plainText } from "@/markdown/plainText";
import { titleKey } from "@/markdown/wikilinks";

export interface SearchHit {
  pageId: string;
  title: string;
  alias?: string;
  snippet?: string;
}

interface ScoredHit extends SearchHit {
  score: number;
}

const SNIPPET_BEFORE = 60;
const SNIPPET_LENGTH = 160;
const MAX_BODY_SCORE = 20;

function nameTier(nameKey: string, query: string): number {
  if (nameKey === query) return 4;
  if (nameKey.startsWith(query)) return 3;
  if (nameKey.split(" ").some((word) => word.startsWith(query))) return 2;
  return nameKey.includes(query) ? 1 : 0;
}

// Titles outrank aliases at the same tier, and every name match outranks any body score.
function nameMatch(page: Page, query: string): { score: number; alias?: string } {
  const titleTier = nameTier(page.titleKey, query);
  let rank = titleTier > 0 ? titleTier * 2 + 1 : 0;
  let alias: string | undefined;

  for (const name of page.aliases) {
    const tier = nameTier(titleKey(name), query);
    if (tier * 2 > rank) [rank, alias] = [tier * 2, name];
  }
  return { score: rank * (MAX_BODY_SCORE + 1), ...(alias && { alias }) };
}

function countOccurrences(text: string, term: string): number {
  let count = 0;
  for (let index = text.indexOf(term); index !== -1; index = text.indexOf(term, index + term.length)) count++;
  return count;
}

export function snippetAt(text: string, index: number): string {
  const spaceBefore = text.indexOf(" ", index - SNIPPET_BEFORE);
  const start = index <= SNIPPET_BEFORE ? 0 : spaceBefore === -1 ? index : Math.min(spaceBefore + 1, index);
  const limit = start + SNIPPET_LENGTH;
  const spaceAfter = text.lastIndexOf(" ", limit);
  const end = limit >= text.length ? text.length : spaceAfter > index ? spaceAfter : limit;
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

const byScoreThenTitle = (a: ScoredHit, b: ScoredHit) => b.score - a.score || a.title.localeCompare(b.title);

const toHit = ({ score: _score, ...hit }: ScoredHit): SearchHit => hit;

export class SearchService {
  private readonly textCache = new Map<string, { body: string; text: string }>();

  constructor(private readonly db: WikiDatabase) {}

  async suggest(wikiId: string, query: string, { limit = 8 } = {}): Promise<SearchHit[]> {
    const key = titleKey(query);
    if (!key) return [];

    const hits: ScoredHit[] = [];
    for (const page of await this.pages(wikiId)) {
      const { score, alias } = nameMatch(page, key);
      if (score > 0) hits.push({ pageId: page.id, title: page.title, ...(alias && { alias }), score });
    }
    return hits.sort(byScoreThenTitle).slice(0, limit).map(toHit);
  }

  async search(wikiId: string, query: string, { limit = 50 } = {}): Promise<SearchHit[]> {
    const key = titleKey(query);
    if (!key) return [];
    const terms = [...new Set(key.split(" "))];

    const hits: ScoredHit[] = [];
    for (const page of await this.pages(wikiId)) {
      const text = this.textOf(page);
      const lower = text.toLowerCase();
      const counts = terms.map((term) => countOccurrences(lower, term));
      const bodyMatches = counts.every((count) => count > 0);
      const { score: nameScore, alias } = nameMatch(page, key);
      if (!bodyMatches && nameScore === 0) continue;

      const bodyScore = bodyMatches ? Math.min(MAX_BODY_SCORE, counts.reduce((sum, count) => sum + count, 0)) : 0;
      const firstMatch = bodyMatches ? Math.min(...terms.map((term) => lower.indexOf(term))) : 0;
      hits.push({
        pageId: page.id,
        title: page.title,
        ...(alias && { alias }),
        ...(text && { snippet: snippetAt(text, firstMatch) }),
        score: nameScore + bodyScore,
      });
    }
    return hits.sort(byScoreThenTitle).slice(0, limit).map(toHit);
  }

  private pages(wikiId: string): Promise<Page[]> {
    return this.db.pages.where("wikiId").equals(wikiId).toArray();
  }

  private textOf(page: Page): string {
    const cached = this.textCache.get(page.id);
    if (cached?.body === page.body) return cached.text;
    const text = plainText(parseMarkdown(page.body).tree);
    this.textCache.set(page.id, { body: page.body, text });
    return text;
  }
}
