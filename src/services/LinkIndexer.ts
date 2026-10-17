import type { Root } from "mdast";
import type { WikiDatabase } from "@/db/database";
import type { Link, Page } from "@/db/types";
import { extractWikilinks } from "@/markdown/wikilinks";

export class LinkIndexer {
  constructor(private readonly db: WikiDatabase) {}

  async findPage(wikiId: string, title: string): Promise<Page | undefined> {
    const byTitle = await this.db.pages.where("[wikiId+title]").equals([wikiId, title]).first();
    if (byTitle) return byTitle;
    return this.db.pages.where("aliases").equals(title).filter((page) => page.wikiId === wikiId).first();
  }

  async indexPage(page: Page, tree: Root): Promise<Link[]> {
    const titles = [...new Set(extractWikilinks(tree).map((link) => link.title))];
    const links: Link[] = await Promise.all(
      titles.map(async (targetTitle) => ({
        wikiId: page.wikiId,
        fromPageId: page.id,
        targetTitle,
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
    const names = [page.title, ...page.aliases].map((name): [string, string] => [page.wikiId, name]);
    return this.db.links
      .where("[wikiId+targetTitle]")
      .anyOf(names)
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
