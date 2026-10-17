import type { WikiDatabase } from "@/db/database";
import type { ChangeEntry, Page } from "@/db/types";
import { stringList } from "@/markdown/frontmatter";
import { parseMarkdown } from "@/markdown/pipeline";
import { titleKey } from "@/markdown/wikilinks";
import type { ChangeLog } from "./ChangeLog";
import type { LinkIndexer } from "./LinkIndexer";

export interface CreatePageInput {
  wikiId: string;
  title: string;
  body?: string;
  path?: string;
  templateId?: string;
  spinoffOf?: string;
  author?: ChangeEntry["author"];
}

export interface SavePageOptions {
  author?: ChangeEntry["author"];
  minor?: boolean;
  summary?: string;
}

export function pathForTitle(title: string): string {
  const fileName = title.replace(/[\\/:*?"<>|]/g, "-").trim();
  return `pages/${fileName}.md`;
}

function aliasFields(frontmatter: Record<string, unknown>): Pick<Page, "aliases" | "aliasKeys"> {
  const aliases = stringList(frontmatter.aliases);
  return { aliases, aliasKeys: [...new Set(aliases.map(titleKey))] };
}

export class PageService {
  constructor(
    private readonly db: WikiDatabase,
    private readonly links: LinkIndexer,
    private readonly changes: ChangeLog,
  ) {}

  get(id: string): Promise<Page | undefined> {
    return this.db.pages.get(id);
  }

  getByTitle(wikiId: string, title: string): Promise<Page | undefined> {
    return this.links.findPage(wikiId, title);
  }

  listForWiki(wikiId: string): Promise<Page[]> {
    return this.db.pages.where("wikiId").equals(wikiId).sortBy("title");
  }

  async create({ wikiId, title, body = "", path, templateId, spinoffOf, author = "human" }: CreatePageInput): Promise<Page> {
    const { tree, frontmatter } = parseMarkdown(body);
    const page: Page = {
      id: crypto.randomUUID(),
      wikiId,
      title,
      titleKey: titleKey(title),
      ...aliasFields(frontmatter),
      path: path ?? pathForTitle(title),
      ...(templateId && { templateId }),
      ...(spinoffOf && { spinoffOf }),
      frontmatter,
      body,
      updatedAt: Date.now(),
    };

    await this.db.transaction("rw", this.db.pages, this.db.links, this.db.changes, async () => {
      if (await this.links.findPage(wikiId, title)) throw new Error(`A page titled "${title}" already exists`);
      await this.db.pages.add(page);
      await this.links.indexPage(page, tree);
      await this.links.resolveInbound(page);
      await this.changes.record({
        wikiId,
        pageId: page.id,
        pageTitle: title,
        kind: "create",
        author,
        minor: false,
        summary: "Created page",
        before: "",
        after: body,
      });
    });
    return page;
  }

  async save(pageId: string, body: string, { author = "human", minor = false, summary = "" }: SavePageOptions = {}): Promise<Page> {
    return this.db.transaction("rw", this.db.pages, this.db.links, this.db.changes, async () => {
      const existing = await this.db.pages.get(pageId);
      if (!existing) throw new Error(`Page ${pageId} not found`);

      const { tree, frontmatter } = parseMarkdown(body);
      const page: Page = { ...existing, body, frontmatter, ...aliasFields(frontmatter), updatedAt: Date.now() };

      await this.db.pages.put(page);
      await this.links.indexPage(page, tree);
      await this.links.detachInbound(page.id, [page.titleKey, ...page.aliasKeys]);
      await this.links.resolveInbound(page);
      await this.changes.record({
        wikiId: page.wikiId,
        pageId,
        pageTitle: page.title,
        kind: "edit",
        author,
        minor,
        summary,
        before: existing.body,
        after: body,
      });
      return page;
    });
  }

  async delete(pageId: string, { author = "human" }: Pick<SavePageOptions, "author"> = {}): Promise<void> {
    await this.db.transaction("rw", [this.db.pages, this.db.links, this.db.changes, this.db.runs], async () => {
      const page = await this.db.pages.get(pageId);
      if (!page) throw new Error(`Page ${pageId} not found`);

      await this.db.pages.delete(pageId);
      await this.db.runs.where("pageId").equals(pageId).delete();
      await this.links.removePage(pageId);
      await this.changes.dropPageHistory(pageId);
      await this.changes.record({
        wikiId: page.wikiId,
        pageId,
        pageTitle: page.title,
        kind: "delete",
        author,
        minor: false,
        summary: "Deleted page",
        before: page.body,
        after: "",
      });
    });
  }
}
