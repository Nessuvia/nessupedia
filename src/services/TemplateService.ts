import type { WikiDatabase } from "@/db/database";
import type { Template } from "@/db/types";
import { BUNDLED_TEMPLATES } from "@/templates";

export class TemplateService {
  constructor(private readonly db: WikiDatabase) {}

  // Bundled templates first, in their fixed order, then the wiki's own by name.
  async list(wikiId: string): Promise<Template[]> {
    const own = await this.db.templates.where("wikiId").equals(wikiId).sortBy("name");
    return [...BUNDLED_TEMPLATES, ...own];
  }

  async get(id: string): Promise<Template | undefined> {
    return BUNDLED_TEMPLATES.find((template) => template.id === id) ?? this.db.templates.get(id);
  }
}
