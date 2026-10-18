import { diffWordsWithSpace, parsePatch } from "diff";

export interface DiffPart {
  text: string;
  changed: boolean;
}

export interface DiffLine {
  kind: "context" | "removed" | "added";
  oldLine?: number;
  newLine?: number;
  parts: DiffPart[];
}

export interface DiffGap {
  kind: "gap";
  oldStart: number;
  newStart: number;
}

export type DiffRow = DiffLine | DiffGap;

const whole = (text: string): DiffPart[] => [{ text, changed: false }];

// A removed line and the added line that replaced it get their changed words marked, unless they share nothing.
function markWords(removed: DiffLine, added: DiffLine): void {
  const changes = diffWordsWithSpace(removed.parts[0]!.text, added.parts[0]!.text);
  if (!changes.some((change) => !change.added && !change.removed && change.value.trim())) return;
  removed.parts = changes.filter((change) => !change.added).map((change) => ({ text: change.value, changed: !!change.removed }));
  added.parts = changes.filter((change) => !change.removed).map((change) => ({ text: change.value, changed: !!change.added }));
}

export function diffRows(diff: string): DiffRow[] {
  const [patch] = parsePatch(diff);
  const rows: DiffRow[] = [];
  for (const hunk of patch?.hunks ?? []) {
    rows.push({ kind: "gap", oldStart: hunk.oldStart, newStart: hunk.newStart });
    let oldLine = hunk.oldStart;
    let newLine = hunk.newStart;
    let removed: DiffLine[] = [];
    let added: DiffLine[] = [];
    const flush = () => {
      for (let i = 0; i < Math.min(removed.length, added.length); i++) markWords(removed[i]!, added[i]!);
      rows.push(...removed, ...added);
      removed = [];
      added = [];
    };
    for (const line of hunk.lines) {
      const text = line.slice(1);
      if (line.startsWith("\\")) continue;
      if (line.startsWith("-")) removed.push({ kind: "removed", oldLine: oldLine++, parts: whole(text) });
      else if (line.startsWith("+")) added.push({ kind: "added", newLine: newLine++, parts: whole(text) });
      else {
        flush();
        rows.push({ kind: "context", oldLine: oldLine++, newLine: newLine++, parts: whole(text) });
      }
    }
    flush();
  }
  return rows;
}

export function diffStats(rows: DiffRow[]): { added: number; removed: number } {
  return {
    added: rows.filter((row) => row.kind === "added").length,
    removed: rows.filter((row) => row.kind === "removed").length,
  };
}
