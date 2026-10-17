import Dexie, { type EntityTable } from "dexie";
import type { AgentRun, Asset, ChangeEntry, Link, Page, Template, Wiki } from "./types";

export class WikiDatabase extends Dexie {
  wikis!: EntityTable<Wiki, "id">;
  pages!: EntityTable<Page, "id">;
  links!: EntityTable<Link, "id">;
  changes!: EntityTable<ChangeEntry, "id">;
  assets!: EntityTable<Asset, "id">;
  templates!: EntityTable<Template, "id">;
  runs!: EntityTable<AgentRun, "id">;

  constructor(name = "oc-wiki") {
    super(name);
    this.version(1).stores({
      wikis: "id, name",
      pages: "id, wikiId, [wikiId+title], *aliases, [wikiId+path], spinoffOf, updatedAt",
      links: "++id, wikiId, fromPageId, toPageId, [wikiId+targetTitle]",
      changes: "++id, wikiId, pageId, at, minor",
      assets: "id, wikiId, [wikiId+path]",
      templates: "id, wikiId, name",
      runs: "id, wikiId, pageId, startedAt",
    });
  }
}

export const db = new WikiDatabase();
