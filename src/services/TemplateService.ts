import type { WikiDatabase } from "@/db/database";
import type { Page, Template } from "@/db/types";
import { editFrontmatter } from "@/markdown/frontmatterEdit";
import { parseMarkdown } from "@/markdown/pipeline";
import { titleKey } from "@/markdown/wikilinks";
import { BUNDLED_TEMPLATES, isBundled } from "@/templates";

// Names become file names on export, so they follow page title rules and can't hold a slash.
export function templateNameError(name: string): string | undefined {
  if (!name.trim()) return "A template needs a name";
  if (/[[\]|#/]/.test(name)) return "Template names can't contain [ ] | # or /";
  return undefined;
}

// Page keys that describe one page rather than the pages a template starts.
const PAGE_ONLY_KEYS = ["title", "aliases", "template"];

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

  // Returns the template already using a name in this wiki, bundled ones included.
  async findByName(wikiId: string, name: string): Promise<Template | undefined> {
    const key = titleKey(name);
    return (await this.list(wikiId)).find((template) => titleKey(template.name) === key);
  }

  async create(wikiId: string, name: string, body: string): Promise<Template> {
    const trimmed = await this.requireName(wikiId, name);
    const template: Template = { id: crypto.randomUUID(), wikiId, name: trimmed, body, frontmatter: parseMarkdown(body).frontmatter };
    await this.db.templates.add(template);
    return template;
  }

  fromPage(page: Page, name: string): Promise<Template> {
    const body = editFrontmatter(page.body, (doc) => {
      for (const key of PAGE_ONLY_KEYS) if (doc.contents) doc.delete(key);
    });
    return this.create(page.wikiId, name, body);
  }

  async duplicate(id: string, wikiId: string, name: string): Promise<Template> {
    const source = await this.get(id);
    if (!source) throw new Error(`Template ${id} not found`);
    return this.create(wikiId, name, source.body);
  }

  async rename(id: string, name: string): Promise<Template> {
    const template = await this.requireOwn(id);
    const trimmed = await this.requireName(template.wikiId!, name, id);
    await this.db.templates.update(id, { name: trimmed });
    return { ...template, name: trimmed };
  }

  async save(id: string, body: string): Promise<Template> {
    const template = await this.requireOwn(id);
    const saved = { ...template, body, frontmatter: parseMarkdown(body).frontmatter };
    await this.db.templates.put(saved);
    return saved;
  }

  async delete(id: string): Promise<void> {
    await this.requireOwn(id);
    await this.db.templates.delete(id);
  }

  private async requireName(wikiId: string, name: string, ownId?: string): Promise<string> {
    const error = templateNameError(name);
    if (error) throw new Error(error);
    const clash = await this.findByName(wikiId, name);
    if (clash && clash.id !== ownId) throw new Error(`A template named "${clash.name}" already exists`);
    return name.trim();
  }

  private async requireOwn(id: string): Promise<Template> {
    if (isBundled({ id })) throw new Error("Bundled templates can't be changed; duplicate one to make your own");
    const template = await this.db.templates.get(id);
    if (!template) throw new Error(`Template ${id} not found`);
    return template;
  }
}
