import type { Root } from "mdast";
import { SKIP, visit } from "unist-util-visit";

const BLOCK_NODES = new Set(["paragraph", "heading", "code", "tableCell", "listItem", "break"]);

export function plainText(tree: Root): string {
  const parts: string[] = [];
  visit(tree, (node) => {
    if (node.type === "yaml") return SKIP;
    if (BLOCK_NODES.has(node.type)) parts.push(" ");
    if (node.type === "text" || node.type === "inlineCode" || node.type === "code") parts.push(node.value);
    if (node.type === "wikiLink") parts.push(node.label ?? node.title);
  });
  return parts.join("").replace(/\s+/g, " ").trim();
}
