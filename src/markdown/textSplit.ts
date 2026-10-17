import type { Parent, PhrasingContent, Root, Text } from "mdast";
import { SKIP, visit } from "unist-util-visit";

// Replaces each regex match inside text nodes with the node `build` returns, or leaves it as text for undefined.
export function splitTextNodes(tree: Root, pattern: RegExp, build: (match: RegExpExecArray) => PhrasingContent | undefined): void {
  visit(tree, "text", (node: Text, index, parent: Parent | undefined) => {
    if (!parent || index === undefined) return;

    const parts: PhrasingContent[] = [];
    let cursor = 0;
    for (const match of node.value.matchAll(pattern)) {
      const built = build(match);
      if (!built) continue;
      if (match.index > cursor) parts.push({ type: "text", value: node.value.slice(cursor, match.index) });
      parts.push(built);
      cursor = match.index + match[0].length;
    }
    if (parts.length === 0) return;

    if (cursor < node.value.length) parts.push({ type: "text", value: node.value.slice(cursor) });
    parent.children.splice(index, 1, ...parts);
    return [SKIP, index + parts.length];
  });
}
