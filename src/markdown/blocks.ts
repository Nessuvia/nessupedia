import type { Root } from "mdast";
import { plainText } from "./plainText";

export class StaleBlockError extends Error {
  constructor() {
    super("This part of the page changed since you started editing. Copy your text, then reopen it.");
  }
}

// Replaces body[start, end) after checking it still holds `original`. An empty replacement removes the
// block along with the blank lines around it, so no gap is left behind.
export function spliceBlock(body: string, start: number, end: number, original: string, replacement: string): string {
  if (body.slice(start, end) !== original) throw new StaleBlockError();
  const text = replacement.replace(/\s+$/, "");
  if (text.trim()) return body.slice(0, start) + text + body.slice(end);

  const before = body.slice(0, start).replace(/\n+$/, "");
  const after = body.slice(end).replace(/^\n+/, "");
  return before && after ? `${before}\n\n${after}` : before + (after || (before ? "\n" : ""));
}

// Names the section holding an offset after its nearest top-level heading, for change summaries.
export function sectionAt(tree: Root, offset: number): string | undefined {
  let section: string | undefined;
  for (const node of tree.children) {
    if ((node.position?.start.offset ?? Infinity) > offset) break;
    if (node.type === "heading" && node.depth >= 2) section = plainText({ type: "root", children: [node] });
  }
  return section;
}

export function editSummary(tree: Root, offset: number): string {
  const section = sectionAt(tree, offset);
  return section ? `Edited “${section}”` : "Edited the introduction";
}
