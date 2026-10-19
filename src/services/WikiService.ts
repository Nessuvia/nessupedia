import type { WikiDatabase } from "@/db/database";
import type { Wiki } from "@/db/types";
import { freeSlug, slugify } from "@/utils/slug";

// Every wiki opens on this page.
export const MAIN_PAGE_TITLE = "Main Page";

function requireName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("A wiki needs a name");
  return trimmed;
}

export async function takenSlugs(db: WikiDatabase): Promise<Set<string>> {
  return new Set((await db.wikis.orderBy("slug").uniqueKeys()) as string[]);
}

export class WikiService {
  constructor(private readonly db: WikiDatabase) {}

  async create(name: string): Promise<Wiki> {
    const trimmed = requireName(name);
    return this.db.transaction("rw", this.db.wikis, async () => {
      const slug = freeSlug(slugify(trimmed), await takenSlugs(this.db));
      const wiki: Wiki = { id: crypto.randomUUID(), name: trimmed, slug, themeId: "fandom", voice: "fandom", createdAt: Date.now() };
      await this.db.wikis.add(wiki);
      return wiki;
    });
  }

  list(): Promise<Wiki[]> {
    return this.db.wikis.orderBy("name").toArray();
  }

  get(id: string): Promise<Wiki | undefined> {
    return this.db.wikis.get(id);
  }

  // A URL's wiki segment is its slug; links from before slugs used its ID.
  async fromUrl(segment: string): Promise<Wiki | undefined> {
    return (await this.db.wikis.where("slug").equals(segment).first()) ?? this.db.wikis.get(segment);
  }

  async setSlug(id: string, slug: string): Promise<Wiki> {
    const cleaned = slugify(slug);
    if (!cleaned) throw new Error("A URL needs a letter or number");
    return this.db.transaction("rw", this.db.wikis, async () => {
      const wiki = await this.db.wikis.get(id);
      if (!wiki) throw new Error(`Wiki ${id} not found`);
      const owner = await this.db.wikis.where("slug").equals(cleaned).first();
      if (owner && owner.id !== id) throw new Error(`${owner.name} already uses that URL`);
      const updated = { ...wiki, slug: cleaned };
      await this.db.wikis.put(updated);
      return updated;
    });
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

  async setAssistantRules(id: string, rules: string): Promise<void> {
    await this.db.wikis.update(id, { assistantRules: rules.trim() || undefined });
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
