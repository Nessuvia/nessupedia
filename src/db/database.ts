import Dexie, { type EntityTable } from "dexie";
import { categoryKeys } from "@/markdown/categories";
import type { AgentRun, Asset, ChangeEntry, Link, ModelSettings, Page, Template, Tokenizer, Wiki } from "./types";

export class WikiDatabase extends Dexie {
  wikis!: EntityTable<Wiki, "id">;
  pages!: EntityTable<Page, "id">;
  links!: EntityTable<Link, "id">;
  changes!: EntityTable<ChangeEntry, "id">;
  assets!: EntityTable<Asset, "id">;
  templates!: EntityTable<Template, "id">;
  runs!: EntityTable<AgentRun, "id">;
  settings!: EntityTable<ModelSettings, "id">;
  tokenizers!: EntityTable<Tokenizer, "id">;

  constructor(name = "oc-wiki") {
    super(name);
    this.version(1).stores({
      wikis: "id, name",
      pages: "id, wikiId, [wikiId+titleKey], *aliasKeys, [wikiId+path], spinoffOf, updatedAt",
      links: "++id, wikiId, fromPageId, toPageId, [wikiId+targetKey]",
      changes: "++id, wikiId, pageId, at, minor",
      assets: "id, wikiId, [wikiId+path]",
      templates: "id, wikiId, name",
      runs: "id, wikiId, pageId, startedAt",
    });
    this.version(2).stores({
      assets: "id, wikiId, [wikiId+path], [wikiId+hash]",
    });
    this.version(3)
      .stores({
        pages: "id, wikiId, [wikiId+titleKey], *aliasKeys, *categoryKeys, [wikiId+path], updatedAt",
      })
      .upgrade((tx) =>
        tx
          .table<Page & { spinoffOf?: string }>("pages")
          .toCollection()
          .modify((page) => {
            page.categoryKeys = categoryKeys(page.frontmatter);
            delete page.spinoffOf;
          }),
      );
    this.version(4).stores({
      settings: "id",
      tokenizers: "id",
    });
  }
}

export const db = new WikiDatabase();
