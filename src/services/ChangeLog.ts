import { createPatch } from "diff";
import type { WikiDatabase } from "@/db/database";
import type { ChangeEntry } from "@/db/types";

export interface RecordChangeInput {
  wikiId: string;
  pageId: string;
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

  async list(wikiId: string, { includeMinor = false } = {}): Promise<ChangeEntry[]> {
    const entries = await this.db.changes.where("wikiId").equals(wikiId).reverse().toArray();
    return includeMinor ? entries : entries.filter((entry) => !entry.minor);
  }

  listForPage(pageId: string): Promise<ChangeEntry[]> {
    return this.db.changes.where("pageId").equals(pageId).reverse().toArray();
  }
}
