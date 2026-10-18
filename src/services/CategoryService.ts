import type { WikiDatabase } from "@/db/database";
import type { Page } from "@/db/types";
import { pageCategories } from "@/markdown/categories";
import { titleKey } from "@/markdown/wikilinks";

export interface CategorySummary {
  name: string;
  key: string;
  count: number;
}

export class CategoryService {
  constructor(private readonly db: WikiDatabase) {}

  // Pages may spell a category differently; the most common spelling names it, ties going to the first seen.
  async list(wikiId: string): Promise<CategorySummary[]> {
    const byKey = new Map<string, { count: number; spellings: Map<string, number> }>();
    await this.db.pages
      .where("wikiId")
      .equals(wikiId)
      .each((page) => {
        for (const name of pageCategories(page.frontmatter)) {
          const entry = byKey.get(titleKey(name)) ?? { count: 0, spellings: new Map<string, number>() };
          entry.count += 1;
          entry.spellings.set(name, (entry.spellings.get(name) ?? 0) + 1);
          byKey.set(titleKey(name), entry);
        }
      });

    return [...byKey]
      .map(([key, { count, spellings }]) => ({
        key,
        count,
        name: [...spellings].reduce((best, next) => (next[1] > best[1] ? next : best))[0],
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  pagesIn(wikiId: string, name: string): Promise<Page[]> {
    return this.db.pages
      .where("categoryKeys")
      .equals(titleKey(name))
      .filter((page) => page.wikiId === wikiId)
      .sortBy("title");
  }
}
