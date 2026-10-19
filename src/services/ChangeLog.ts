import { applyPatch, createPatch, parsePatch, reversePatch } from "diff";
import type { WikiDatabase } from "@/db/database";
import type { ChangeEntry } from "@/db/types";
import { parseMarkdown } from "@/markdown/pipeline";
import { titleKey } from "@/markdown/wikilinks";

// Edits by one author this close together read as one change.
export const MERGE_WINDOW = 10 * 60 * 1000;

const DAY = 24 * 60 * 60 * 1000;

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
  subject?: ChangeEntry["subject"];
  author: ChangeEntry["author"];
  minor: boolean;
  summary: string;
  before: string;
  after: string;
}

export interface ChangeListFilter {
  includeMinor?: boolean;
  author?: ChangeEntry["author"];
  page?: string;
  limit?: number;
}

export class ChangeLog {
  constructor(private readonly db: WikiDatabase) {}

  // Returns undefined when an edit folded into the previous one and together they changed nothing.
  async record({ before, after, ...entry }: RecordChangeInput): Promise<ChangeEntry | undefined> {
    const at = Date.now();
    const latest = entry.kind === "edit" ? (await this.listForPage(entry.pageId, entry.subject))[0] : undefined;
    if (latest?.kind === "edit" && latest.author === entry.author && at - latest.at <= MERGE_WINDOW) {
      const start = sourceBefore(latest, before);
      if (start !== undefined) return this.fold(latest, entry, start, after, at);
    }
    const { subject, ...fields } = entry;
    const change: ChangeEntry = { ...fields, ...(subject && { subject }), diff: createPatch(entry.pageId, before, after), at };
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

  // `page` matches part of a title, the one a change was made under or the page's title now.
  async list(wikiId: string, { includeMinor = false, author, page, limit = Infinity }: ChangeListFilter = {}): Promise<ChangeEntry[]> {
    const query = page?.trim().toLowerCase();
    const pageIds = query
      ? new Set(await this.db.pages.where("wikiId").equals(wikiId).filter((found) => found.title.toLowerCase().includes(query)).primaryKeys())
      : undefined;
    return this.db.changes
      .where("wikiId")
      .equals(wikiId)
      .reverse()
      .filter(
        (entry) =>
          (includeMinor || !entry.minor) &&
          (!author || entry.author === author) &&
          (!query || entry.pageTitle.toLowerCase().includes(query) || pageIds!.has(entry.pageId)),
      )
      .limit(limit)
      .toArray();
  }

  // Newest first: changes to the page's text, or to its card when `subject` is "card".
  listForPage(pageId: string, subject?: ChangeEntry["subject"]): Promise<ChangeEntry[]> {
    return this.db.changes
      .where("pageId")
      .equals(pageId)
      .reverse()
      .filter((entry) => entry.subject === subject)
      .toArray();
  }

  // The latest deletion of a page that hasn't come back, found by the title it had.
  async deletedPage(wikiId: string, title: string): Promise<ChangeEntry | undefined> {
    const key = titleKey(title);
    const deletions = await this.db.changes
      .where("wikiId")
      .equals(wikiId)
      .filter((entry) => entry.kind === "delete" && !entry.subject && titleKey(entry.pageTitle) === key)
      .reverse()
      .sortBy("id");
    for (const deletion of deletions) {
      if (!(await this.db.pages.get(deletion.pageId))) return deletion;
    }
    return undefined;
  }

  // Deletes changes older than the cutoff, except deletions, which restoring needs, and changes to pages
  // marked `history: keep`, read from the final source of pages since deleted.
  async prune(wikiId: string, days: number, now = Date.now()): Promise<number> {
    const cutoff = now - days * DAY;
    return this.db.transaction("rw", this.db.changes, this.db.pages, async () => {
      const old = await this.db.changes
        .where("wikiId")
        .equals(wikiId)
        .filter((entry) => entry.at < cutoff && entry.kind !== "delete")
        .toArray();
      const kept = new Map<string, boolean>();
      const doomed: number[] = [];
      for (const entry of old) {
        if (!kept.has(entry.pageId)) kept.set(entry.pageId, await this.keepsHistory(entry.pageId));
        if (!kept.get(entry.pageId)) doomed.push(entry.id!);
      }
      await this.db.changes.bulkDelete(doomed);
      return doomed.length;
    });
  }

  private async keepsHistory(pageId: string): Promise<boolean> {
    const page = await this.db.pages.get(pageId);
    if (page) return page.frontmatter.history === "keep";
    const [latest] = await this.listForPage(pageId);
    const final = latest?.kind === "delete" ? sourceBefore(latest, "") : undefined;
    return final !== undefined && parseMarkdown(final).frontmatter.history === "keep";
  }

  async dropPageHistory(pageId: string): Promise<void> {
    await this.db.changes.where("pageId").equals(pageId).delete();
  }
}
