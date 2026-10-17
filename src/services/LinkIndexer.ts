import type { Root } from "mdast";
import type { WikiDatabase } from "@/db/database";
import type { Link, Page } from "@/db/types";
import { extractWikilinks, titleKey } from "@/markdown/wikilinks";

export class LinkIndexer {
  constructor(private readonly db: WikiDatabase) {}

  async findPage(wikiId: string, title: string): Promise<Page | undefined> {
    const key = titleKey(title);
    const byTitle = await this.db.pages.where("[wikiId+titleKey]").equals([wikiId, key]).first();
    if (byTitle) return byTitle;
    return this.db.pages.where("aliasKeys").equals(key).filter((page) => page.wikiId === wikiId).first();
  }

  async indexPage(page: Page, tree: Root): Promise<Link[]> {
    const titlesByKey = new Map<string, string>();
    for (const { title } of extractWikilinks(tree)) {
      const key = titleKey(title);
      if (!titlesByKey.has(key)) titlesByKey.set(key, title);
    }

    const links: Link[] = await Promise.all(
      [...titlesByKey].map(async ([targetKey, targetTitle]) => ({
        wikiId: page.wikiId,
        fromPageId: page.id,
        targetTitle,
        targetKey,
        toPageId: (await this.findPage(page.wikiId, targetTitle))?.id,
      })),
    );

    await this.db.transaction("rw", this.db.links, async () => {
      await this.db.links.where("fromPageId").equals(page.id).delete();
      await this.db.links.bulkAdd(links);
    });
    return links;
  }

  async resolveInbound(page: Page): Promise<number> {
    const keys = [page.titleKey, ...page.aliasKeys].map((key): [string, string] => [page.wikiId, key]);
    return this.db.links
      .where("[wikiId+targetKey]")
      .anyOf(keys)
      .filter((link) => link.toPageId === undefined)
      .modify({ toPageId: page.id });
  }

  backlinks(pageId: string): Promise<Link[]> {
    return this.db.links.where("toPageId").equals(pageId).toArray();
  }

  redLinks(wikiId: string): Promise<Link[]> {
    return this.db.links
      .where("wikiId")
      .equals(wikiId)
      .filter((link) => link.toPageId === undefined)
      .toArray();
  }
}
