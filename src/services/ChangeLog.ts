import { createPatch } from "diff";
import type { WikiDatabase } from "@/db/database";
import type { ChangeEntry } from "@/db/types";

export interface RecordChangeInput {
  wikiId: string;
  pageId: string;
  pageTitle: string;
  kind: ChangeEntry["kind"];
  author: ChangeEntry["author"];
  minor: boolean;
  summary: string;
  before: string;
  after: string;
}

export class ChangeLog {
  constructor(private readonly db: WikiDatabase) {}

  async record({ before, after, ...entry }: RecordChangeInput): Promise<ChangeEntry> {
    const change: ChangeEntry = { ...entry, diff: createPatch(entry.pageId, before, after), at: Date.now() };
    change.id = await this.db.changes.add(change);
    return change;
  }

  list(wikiId: string, { includeMinor = false, limit = Infinity } = {}): Promise<ChangeEntry[]> {
    return this.db.changes
      .where("wikiId")
      .equals(wikiId)
      .reverse()
      .filter((entry) => includeMinor || !entry.minor)
      .limit(limit)
      .toArray();
  }

  listForPage(pageId: string): Promise<ChangeEntry[]> {
    return this.db.changes.where("pageId").equals(pageId).reverse().toArray();
  }

  async dropPageHistory(pageId: string): Promise<void> {
    await this.db.changes
      .where("pageId")
      .equals(pageId)
      .filter((entry) => entry.kind !== "create")
      .delete();
  }
}
