import { applyPatch, createPatch, parsePatch, reversePatch } from "diff";
import type { WikiDatabase } from "@/db/database";
import type { ChangeEntry } from "@/db/types";
import { titleKey } from "@/markdown/wikilinks";

// Edits by one author this close together read as one change.
export const MERGE_WINDOW = 10 * 60 * 1000;

// The source an entry started from, given the source it produced; undefined when the diff doesn't fit it.
export function sourceBefore(entry: Pick<ChangeEntry, "diff">, after: string): string | undefined {
  const [patch] = parsePatch(entry.diff);
  if (!patch) return after;
  const before = applyPatch(after, reversePatch(patch));
  return before === false ? undefined : before;
}

// The source after each entry, walking back from the current source newest first. Entries older than one
// whose diff no longer fits are left out, as are entries after which the page didn't exist.
export function rebuildVersions(entries: ChangeEntry[], current: string): Map<number, string> {
  const versions = new Map<number, string>();
  let after: string | undefined = current;
  for (const entry of entries) {
    if (after === undefined) break;
    if (entry.kind !== "delete") versions.set(entry.id!, after);
    after = sourceBefore(entry, after);
  }
  return versions;
}

function joinSummaries(earlier: string, later: string): string {
  const parts = [earlier, later].flatMap((summary) => summary.split("; ")).filter(Boolean);
  return [...new Set(parts)].join("; ");
}

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

  // Returns undefined when an edit folded into the previous one and together they changed nothing.
  async record({ before, after, ...entry }: RecordChangeInput): Promise<ChangeEntry | undefined> {
    const at = Date.now();
    const latest = entry.kind === "edit" ? await this.db.changes.where("pageId").equals(entry.pageId).last() : undefined;
    if (latest?.kind === "edit" && latest.author === entry.author && at - latest.at <= MERGE_WINDOW) {
      const start = sourceBefore(latest, before);
      if (start !== undefined) return this.fold(latest, entry, start, after, at);
    }
    const change: ChangeEntry = { ...entry, diff: createPatch(entry.pageId, before, after), at };
    change.id = await this.db.changes.add(change);
    return change;
  }

  private async fold(latest: ChangeEntry, entry: Omit<RecordChangeInput, "before" | "after">, start: string, after: string, at: number) {
    if (start === after) {
      await this.db.changes.delete(latest.id!);
      return undefined;
    }
    const merged: ChangeEntry = {
      ...latest,
      pageTitle: entry.pageTitle,
      minor: latest.minor && entry.minor,
      summary: joinSummaries(latest.summary, entry.summary),
      diff: createPatch(entry.pageId, start, after),
      at,
    };
    await this.db.changes.put(merged);
    return merged;
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

  // The latest deletion of a page that hasn't come back, found by the title it had.
  async deletedPage(wikiId: string, title: string): Promise<ChangeEntry | undefined> {
    const key = titleKey(title);
    const deletions = await this.db.changes
      .where("wikiId")
      .equals(wikiId)
      .filter((entry) => entry.kind === "delete" && titleKey(entry.pageTitle) === key)
      .reverse()
      .sortBy("id");
    for (const deletion of deletions) {
      if (!(await this.db.pages.get(deletion.pageId))) return deletion;
    }
    return undefined;
  }

  async dropPageHistory(pageId: string): Promise<void> {
    await this.db.changes.where("pageId").equals(pageId).delete();
  }
}
