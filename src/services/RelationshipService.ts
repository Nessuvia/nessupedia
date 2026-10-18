import type { WikiDatabase } from "@/db/database";
import type { Page } from "@/db/types";
import { pairOf } from "@/markdown/relationships";
import { leadMarkdown } from "@/markdown/sections";
import { mergeVersion } from "@/markdown/versions";
import type { LinkIndexer } from "./LinkIndexer";

export interface Relationship {
  pair: Page;
  // The page to link for the pair: its version in the continuity asked for, when there is one.
  pairTarget: string;
  // The other page as titled now, or as written when it doesn't exist yet, and the page to link for it.
  other: { title: string; exists: boolean; target: string };
  lead: string;
}

export class RelationshipService {
  constructor(
    private readonly db: WikiDatabase,
    private readonly links: LinkIndexer,
  ) {}

  // Every relationship page naming this page in `between`, by the other page's title. Given a continuity,
  // pairs and other pages with a version in it link there, and a pair's lead comes from its version.
  async of(page: Page, continuity?: string): Promise<Relationship[]> {
    const versionIn = async (title: string) => (continuity ? await this.links.findPage(page.wikiId, `${title}/${continuity}`) : undefined);
    const inbound = await this.db.links
      .where("toPageId")
      .equals(page.id)
      .filter((link) => link.field === "between")
      .toArray();

    const relationships: Relationship[] = [];
    for (const pairId of new Set(inbound.map((link) => link.fromPageId))) {
      const pair = await this.db.pages.get(pairId);
      if (!pair) continue;
      const pairVersion = await versionIn(pair.title);
      const lead = leadMarkdown(pairVersion ? mergeVersion(pair.body, pairVersion.body).markdown : pair.body);
      for (const name of pairOf(pair.frontmatter)) {
        const other = await this.links.findPage(pair.wikiId, name);
        if (other?.id === page.id) continue;
        const title = other?.title ?? name;
        const otherVersion = other && (await versionIn(other.title));
        relationships.push({
          pair,
          pairTarget: pairVersion?.title ?? pair.title,
          other: { title, exists: !!other, target: otherVersion?.title ?? title },
          lead,
        });
      }
    }
    return relationships.sort((a, b) => a.other.title.localeCompare(b.other.title) || a.pair.title.localeCompare(b.pair.title));
  }

  async count(page: Page): Promise<number> {
    const inbound = await this.db.links.where("toPageId").equals(page.id).filter((link) => link.field === "between").toArray();
    return new Set(inbound.map((link) => link.fromPageId)).size;
  }
}
