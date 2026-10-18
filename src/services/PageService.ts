import type { WikiDatabase } from "@/db/database";
import type { ChangeEntry, Page } from "@/db/types";
import { categoryKeys } from "@/markdown/categories";
import { stringList } from "@/markdown/frontmatter";
import { parseMarkdown } from "@/markdown/pipeline";
import { retargetBetween } from "@/markdown/relationships";
import { retargetWikilinks } from "@/markdown/retarget";
import { isDirectSubpage, titleSegments } from "@/markdown/subpages";
import { versionOf, versionTitleError } from "@/markdown/versions";
import { normalizeTitle, titleError, titleKey } from "@/markdown/wikilinks";
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

// Subpages become folders: "Mira/History" is stored at pages/Mira/History.md.
export function pathForTitle(title: string): string {
  const segments = titleSegments(title).map((segment) => segment.replace(/[\\:*?"<>|]/g, "-"));
  return `pages/${segments.join("/")}.md`;
}

export function requireTitle(title: string): string {
  const error = titleError(title);
  if (error) throw new Error(error);
  return normalizeTitle(title.trim());
}

export function frontmatterFields(frontmatter: Record<string, unknown>): Pick<Page, "aliases" | "aliasKeys" | "categoryKeys"> {
  const aliases = stringList(frontmatter.aliases);
  return { aliases, aliasKeys: [...new Set(aliases.map(titleKey))], categoryKeys: categoryKeys(frontmatter) };
}

// A page record for a title that has passed the title rules.
export function newPage(id: string, wikiId: string, title: string, body: string): Page {
  const { frontmatter } = parseMarkdown(body);
  return {
    id,
    wikiId,
    title,
    titleKey: titleKey(title),
    ...frontmatterFields(frontmatter),
    path: pathForTitle(title),
    frontmatter,
    body,
    updatedAt: Date.now(),
  };
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

  // Every page under a title, at any depth, by title.
  subpages(wikiId: string, title: string): Promise<Page[]> {
    const prefix = `${titleKey(title)}/`;
    return this.db.pages.where("[wikiId+titleKey]").between([wikiId, prefix], [wikiId, `${prefix}￿`]).sortBy("title");
  }

  async directSubpages(wikiId: string, title: string): Promise<Page[]> {
    return (await this.subpages(wikiId, title)).filter((page) => isDirectSubpage(page.title, title));
  }

  async create({ wikiId, title: rawTitle, body = "", path, templateId, author = "human" }: CreatePageInput): Promise<Page> {
    const title = requireTitle(rawTitle);
    const page = { ...newPage(crypto.randomUUID(), wikiId, title, body), ...(path && { path }), ...(templateId && { templateId }) };

    await this.db.transaction("rw", [this.db.wikis, this.db.pages, this.db.links, this.db.changes], async () => {
      if (await this.links.findPage(wikiId, title)) throw new Error(`A page titled "${title}" already exists`);
      await this.requireVersionRules(wikiId, title);
      // A deleted page's history stays restorable until a new page takes its title.
      const deleted = await this.changes.deletedPage(wikiId, title);
      if (deleted) await this.changes.dropPageHistory(deleted.pageId);
      await this.insert(page);
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

  save(pageId: string, body: string, { author = "human", minor = false, summary = "" }: SavePageOptions = {}): Promise<Page> {
    return this.write(pageId, body, { kind: "edit", author, minor, summary });
  }

  // Brings back an earlier source, recreating the page under its old ID when it was deleted.
  async restore(pageId: string, body: string, { author = "human", summary = "Restored an earlier version" }: Omit<SavePageOptions, "minor"> = {}): Promise<Page> {
    return this.db.transaction("rw", [this.db.wikis, this.db.pages, this.db.links, this.db.changes], async () => {
      if (await this.db.pages.get(pageId)) return this.write(pageId, body, { kind: "restore", author, minor: false, summary });

      const [latest] = await this.changes.listForPage(pageId);
      if (latest?.kind !== "delete") throw new Error(`Page ${pageId} not found`);
      const { wikiId, pageTitle: title } = latest;
      const clash = await this.links.findPage(wikiId, title);
      if (clash) throw new Error(`"${clash.title}" now goes by "${title}"; rename it before restoring this page`);
      await this.requireVersionRules(wikiId, title);

      const page = newPage(pageId, wikiId, title, body);
      await this.insert(page);
      await this.changes.record({ wikiId, pageId, pageTitle: title, kind: "restore", author, minor: false, summary, before: "", after: body });
      return page;
    });
  }


  private async insert(page: Page): Promise<void> {
    await this.db.pages.add(page);
    await this.links.indexPage(page, parseMarkdown(page.body).tree);
    await this.links.resolveInbound(page);
  }

  private write(pageId: string, body: string, { kind, author, minor, summary }: Required<SavePageOptions> & { kind: "edit" | "restore" }): Promise<Page> {
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
        kind,
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
    return this.db.transaction("rw", [this.db.wikis, this.db.pages, this.db.links, this.db.changes], async () => {
      const page = await this.db.pages.get(pageId);
      if (!page) throw new Error(`Page ${pageId} not found`);
      if (page.title === title) return page;

      const clash = await this.links.findPage(page.wikiId, title);
      if (clash && clash.id !== pageId) throw new Error(`A page titled "${title}" already exists`);
      await this.requireVersionRules(page.wikiId, title);
      // Found before the rename, so a page moved under its own old title doesn't count itself.
      const children = await this.directSubpages(page.wikiId, page.title);

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
        const body = retargetBetween(retargetWikilinks(source.body, page.title, title), page.title, title, source.frontmatter);
        if (body !== source.body) await this.save(fromPageId, body, { author, minor: true, summary: `Updated links to "${title}"` });
      }

      await this.links.detachInbound(pageId, [renamed.titleKey, ...renamed.aliasKeys]);
      await this.links.resolveInbound(renamed);

      // Each subpage moves its own subpages in turn.
      const depth = titleSegments(page.title).length;
      for (const child of children) {
        await this.rename(child.id, [title, ...titleSegments(child.title).slice(depth)].join("/"), { author });
      }
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

  // A continuity name under a page must make a top-level page's version, and the main page must exist.
  private async requireVersionRules(wikiId: string, title: string): Promise<void> {
    const continuities = (await this.db.wikis.get(wikiId))?.continuities ?? [];
    const error = versionTitleError(title, continuities);
    if (error) throw new Error(error);
    const version = versionOf(title, continuities);
    if (!version) return;
    const main = await this.links.findPage(wikiId, version.main);
    if (main?.titleKey !== titleKey(version.main)) throw new Error(`Create "${version.main}" before its ${version.continuity.name} version`);
  }
}
