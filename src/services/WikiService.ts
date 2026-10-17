import type { WikiDatabase } from "@/db/database";
import type { Wiki } from "@/db/types";

export class WikiService {
  constructor(private readonly db: WikiDatabase) {}

  async create(name: string): Promise<Wiki> {
    const wiki: Wiki = { id: crypto.randomUUID(), name, themeId: "fandom", voice: "fandom", createdAt: Date.now() };
    await this.db.wikis.add(wiki);
    return wiki;
  }

  list(): Promise<Wiki[]> {
    return this.db.wikis.orderBy("name").toArray();
  }

  get(id: string): Promise<Wiki | undefined> {
    return this.db.wikis.get(id);
  }
}
