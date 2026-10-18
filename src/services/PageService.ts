import type { WikiDatabase } from "@/db/database";
import type { ChangeEntry, Page } from "@/db/types";
import { categoryKeys } from "@/markdown/categories";
import { stringList } from "@/markdown/frontmatter";
import { parseMarkdown } from "@/markdown/pipeline";
import { retargetWikilinks } from "@/markdown/retarget";
import { titleError, titleKey } from "@/markdown/wikilinks";
import type { ChangeLog } from "./ChangeLog";
import type { LinkIndexer } from "./LinkIndexer";

export interface CreatePageInput {
  wikiId: string;
  title: string;
  body?: string;
  path?: string;
  templateId?: string;
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

function requireTitle(title: string): string {
  const error = titleError(title);
  if (error) throw new Error(error);
  return title.trim();
}

function frontmatterFields(frontmatter: Record<string, unknown>): Pick<Page, "aliases" | "aliasKeys" | "categoryKeys"> {
  const aliases = stringList(frontmatter.aliases);
  return { aliases, aliasKeys: [...new Set(aliases.map(titleKey))], categoryKeys: categoryKeys(frontmatter) };
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

  countForWiki(wikiId: string): Promise<number> {
    return this.db.pages.where("wikiId").equals(wikiId).count();
  }

  async create({ wikiId, title: rawTitle, body = "", path, templateId, author = "human" }: CreatePageInput): Promise<Page> {
    const title = requireTitle(rawTitle);
    const { tree, frontmatter } = parseMarkdown(body);
    const page: Page = {
      id: crypto.randomUUID(),
      wikiId,
      title,
      titleKey: titleKey(title),
      ...frontmatterFields(frontmatter),
      path: path ?? pathForTitle(title),
      ...(templateId && { templateId }),
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
      const page: Page = { ...existing, body, frontmatter, ...frontmatterFields(frontmatter), updatedAt: Date.now() };

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

  async rename(pageId: string, newTitle: string, { author = "human" }: Pick<SavePageOptions, "author"> = {}): Promise<Page> {
    const title = requireTitle(newTitle);
    return this.db.transaction("rw", this.db.pages, this.db.links, this.db.changes, async () => {
      const page = await this.db.pages.get(pageId);
      if (!page) throw new Error(`Page ${pageId} not found`);
      if (page.title === title) return page;

      const clash = await this.links.findPage(page.wikiId, title);
      if (clash && clash.id !== pageId) throw new Error(`A page titled "${title}" already exists`);

      const renamed: Page = { ...page, title, titleKey: titleKey(title), path: pathForTitle(title), updatedAt: Date.now() };
      await this.db.pages.put(renamed);
      await this.changes.record({
        wikiId: page.wikiId,
        pageId,
        pageTitle: title,
        kind: "rename",
        author,
        minor: false,
        summary: `Renamed from "${page.title}"`,
        before: page.body,
        after: page.body,
      });

      // Links by alias keep pointing here untouched; links by the old title are rewritten to the new one.
      const inbound = await this.links.linksByTitle(page);
      for (const fromPageId of new Set(inbound.map((link) => link.fromPageId))) {
        const source = (await this.db.pages.get(fromPageId))!;
        const body = retargetWikilinks(source.body, page.title, title);
        if (body !== source.body) await this.save(fromPageId, body, { author, minor: true, summary: `Updated links to "${title}"` });
      }

      await this.links.detachInbound(pageId, [renamed.titleKey, ...renamed.aliasKeys]);
      await this.links.resolveInbound(renamed);
      return (await this.db.pages.get(pageId))!;
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
