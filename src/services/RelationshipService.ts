import type { WikiDatabase } from "@/db/database";
import type { Page } from "@/db/types";
import { pairOf } from "@/markdown/relationships";
import { leadMarkdown } from "@/markdown/sections";
import type { LinkIndexer } from "./LinkIndexer";

export interface Relationship {
  pair: Page;
  // The other page as titled now, or as written when it doesn't exist yet.
  other: { title: string; exists: boolean };
  lead: string;
}

export class RelationshipService {
  constructor(
    private readonly db: WikiDatabase,
    private readonly links: LinkIndexer,
  ) {}

  // Every relationship page naming this page in `between`, by the other page's title.
  async of(page: Page): Promise<Relationship[]> {
    const inbound = await this.db.links
      .where("toPageId")
      .equals(page.id)
      .filter((link) => link.field === "between")
      .toArray();

    const relationships: Relationship[] = [];
    for (const pairId of new Set(inbound.map((link) => link.fromPageId))) {
      const pair = await this.db.pages.get(pairId);
      if (!pair) continue;
      for (const name of pairOf(pair.frontmatter)) {
        const other = await this.links.findPage(pair.wikiId, name);
        if (other?.id === page.id) continue;
        relationships.push({ pair, other: { title: other?.title ?? name, exists: !!other }, lead: leadMarkdown(pair.body) });
      }
    }
    return relationships.sort((a, b) => a.other.title.localeCompare(b.other.title) || a.pair.title.localeCompare(b.pair.title));
  }

  async count(page: Page): Promise<number> {
    const inbound = await this.db.links.where("toPageId").equals(page.id).filter((link) => link.field === "between").toArray();
    return new Set(inbound.map((link) => link.fromPageId)).size;
  }
}
