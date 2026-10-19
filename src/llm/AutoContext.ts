import type { WikiDatabase } from "@/db/database";
import type { Page } from "@/db/types";
import { contextText, DEFAULT_AUTO_CONTEXT_DEPTH, readAutoContext } from "@/markdown/autoContext";
import { versionOf } from "@/markdown/versions";
import { titleKey } from "@/markdown/wikilinks";
import { MentionFinder } from "@/services/MentionFinder";

export interface AutoContextRequest {
  wikiId: string;
  // Text scanned for mentions: notes, rules, the current page.
  input: readonly string[];
  budget: number;
  count: (text: string) => number | Promise<number>;
  // Pages already in the request, such as the one being written.
  exclude?: readonly string[];
  // Matched pages with a version in this continuity go in as that version.
  continuity?: string;
}

export interface AutoContextEntry {
  pageId: string;
  title: string;
  text: string;
  tokens: number;
  // 0 for a page mentioned in the input, otherwise how many links away from one it is.
  depth: number;
  mentions: number;
}

export interface AutoContextResult {
  entries: AutoContextEntry[];
  // Pages that matched but didn't fit the budget.
  leftOut: AutoContextEntry[];
  tokens: number;
}

interface Candidate {
  page: Page;
  depth: number;
  mentions: number;
}

export function formatEntry(page: Pick<Page, "title" | "aliases">, text: string): string {
  const aliases = page.aliases.length > 0 ? `Also called: ${page.aliases.join(", ")}\n\n` : "";
  return `# ${page.title}\n\n${aliases}${text}`;
}

// Picks wiki pages for a request: pages the input mentions, then pages they link to, filled up to the budget.
export class AutoContext {
  constructor(private readonly db: WikiDatabase) {}

  async build({ wikiId, input, budget, count, exclude = [], continuity }: AutoContextRequest): Promise<AutoContextResult> {
    const wiki = await this.db.wikis.get(wikiId);
    const continuities = wiki?.continuities ?? [];
    const pages = await this.db.pages.where("wikiId").equals(wikiId).toArray();
    const byId = new Map(pages.map((page) => [page.id, page]));
    const byKey = new Map(pages.map((page) => [page.titleKey, page]));
    const excluded = new Set(exclude);
    const usable = (page: Page | undefined): page is Page => !!page && !excluded.has(page.id) && readAutoContext(page.frontmatter).enabled;

    const candidates = new Map<string, Candidate>();
    for (const [pageId, mentions] of MentionFinder.forPages(pages).count(input)) {
      const page = byId.get(pageId);
      if (usable(page)) candidates.set(pageId, { page, depth: 0, mentions });
    }

    let frontier = [...candidates.keys()];
    const maxDepth = wiki?.autoContextDepth ?? DEFAULT_AUTO_CONTEXT_DEPTH;
    for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
      const links = await this.db.links.where("fromPageId").anyOf(frontier).toArray();
      frontier = [];
      for (const { toPageId } of links) {
        const page = toPageId === undefined ? undefined : byId.get(toPageId);
        if (!usable(page) || candidates.has(page.id)) continue;
        candidates.set(page.id, { page, depth, mentions: 0 });
        frontier.push(page.id);
      }
    }

    const ordered = [...candidates.values()].sort(
      (a, b) =>
        Number(a.depth > 0) - Number(b.depth > 0) ||
        b.mentions - a.mentions ||
        a.depth - b.depth ||
        a.page.title.localeCompare(b.page.title),
    );

    const result: AutoContextResult = { entries: [], leftOut: [], tokens: 0 };
    const placed = new Set<string>();
    for (const { page: matched, depth, mentions } of ordered) {
      const version = continuity ? byKey.get(titleKey(`${matched.title}/${continuity}`)) : undefined;
      const page = version && !excluded.has(version.id) ? version : matched;
      if (placed.has(page.id)) continue;
      placed.add(page.id);

      const main = versionOf(page.title, continuities);
      const mainBody = main && byKey.get(titleKey(main.main))?.body;
      const text = contextText(page.body, readAutoContext(matched.frontmatter).include, mainBody);
      if (!text) continue;
      const formatted = formatEntry(page, text);
      const entry: AutoContextEntry = { pageId: page.id, title: page.title, text: formatted, tokens: await count(formatted), depth, mentions };
      if (result.tokens + entry.tokens <= budget) {
        result.entries.push(entry);
        result.tokens += entry.tokens;
      } else {
        result.leftOut.push(entry);
      }
    }
    return result;
  }
}
