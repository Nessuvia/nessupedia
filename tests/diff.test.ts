import { createPatch } from "diff";
import { describe, expect, it } from "vitest";
import { diffRows, diffStats, type DiffLine } from "@/utils/diffRows";

const lines = (before: string, after: string) => diffRows(createPatch("page", before, after)).filter((row): row is DiffLine => row.kind !== "gap");
const marked = (row: DiffLine) => row.parts.filter((part) => part.changed).map((part) => part.text);

describe("diffRows", () => {
  it("numbers context, removed, and added lines from the source", () => {
    const rows = lines("One\nTwo\nThree\n", "One\nTwo and a half\nThree\n");
    expect(rows.map(({ kind, oldLine, newLine }) => [kind, oldLine, newLine])).toEqual([
      ["context", 1, 1],
      ["removed", 2, undefined],
      ["added", undefined, 2],
      ["context", 3, 3],
    ]);
  });

  it("marks the words that changed between a removed line and its replacement", () => {
    const [, removed, added] = lines("Intro\nShe was born in winter.\n", "Intro\nShe was born in early spring.\n");
    expect(marked(removed!)).toEqual(["winter"]);
    expect(marked(added!)).toEqual(["early spring"]);
    expect(added!.parts.map((part) => part.text).join("")).toBe("She was born in early spring.");
  });

  it("pairs lines in order within a run and leaves extras whole", () => {
    const rows = lines("A cat sat\nA dog ran\n", "A cat slept\nA dog walked\nA bird sang\n");
    expect(rows.filter((row) => row.kind === "added").map(marked)).toEqual([["slept"], ["walked"], []]);
  });

  it("doesn't mark words when a line was rewritten outright", () => {
    const [removed, added] = lines("Completely different\n", "Nothing alike here\n");
    expect(marked(removed!)).toEqual([]);
    expect(marked(added!)).toEqual([]);
  });

  it("starts each hunk with a gap row, and is empty when nothing changed", () => {
    const before = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`).join("\n");
    const after = before.replace("Line 2\n", "Line two\n").replace("Line 19\n", "Line nineteen\n");
    const rows = diffRows(createPatch("page", before, after));
    expect(rows.filter((row) => row.kind === "gap")).toHaveLength(2);
    expect(diffStats(rows)).toEqual({ added: 2, removed: 2 });
    expect(diffRows(createPatch("page", "Same\n", "Same\n"))).toEqual([]);
  });
});
