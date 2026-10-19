import type { WikiDatabase } from "@/db/database";
import type { Wiki } from "@/db/types";

// Every wiki opens on this page.
export const MAIN_PAGE_TITLE = "Main Page";

function requireName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("A wiki needs a name");
  return trimmed;
}

export class WikiService {
  constructor(private readonly db: WikiDatabase) {}

  async create(name: string): Promise<Wiki> {
    const wiki: Wiki = { id: crypto.randomUUID(), name: requireName(name), themeId: "fandom", voice: "fandom", createdAt: Date.now() };
    await this.db.wikis.add(wiki);
    return wiki;
  }

  list(): Promise<Wiki[]> {
    return this.db.wikis.orderBy("name").toArray();
  }

  get(id: string): Promise<Wiki | undefined> {
    return this.db.wikis.get(id);
  }

  async rename(id: string, name: string): Promise<Wiki> {
    const trimmed = requireName(name);
    return this.db.transaction("rw", this.db.wikis, async () => {
      const wiki = await this.db.wikis.get(id);
      if (!wiki) throw new Error(`Wiki ${id} not found`);
      const renamed = { ...wiki, name: trimmed };
      await this.db.wikis.put(renamed);
      return renamed;
    });
  }

  async setKeepOriginalImages(id: string, keep: boolean): Promise<void> {
    await this.db.wikis.update(id, { keepOriginalImages: keep });
  }

  async setHistoryDays(id: string, days: number | undefined): Promise<void> {
    await this.db.wikis.update(id, { historyDays: days });
  }

  async setAutoContextDepth(id: string, depth: number | undefined): Promise<void> {
    await this.db.wikis.update(id, { autoContextDepth: depth });
  }

  async delete(id: string): Promise<void> {
    // Tables indexed by wikiId hold this wiki's data; app-wide tables such as settings aren't, and bundled templates have no wikiId.
    const wikiTables = this.db.tables.filter((table) => table.name !== "wikis" && table.schema.idxByName.wikiId);
    await this.db.transaction("rw", [this.db.wikis, ...wikiTables], async () => {
      await this.db.wikis.delete(id);
      for (const table of wikiTables) await table.where("wikiId").equals(id).delete();
    });
  }
}
