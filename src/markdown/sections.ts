import { hintText } from "./hints";
import { parseMarkdown } from "./pipeline";

const LEAD_SKIPS = new Set(["yaml", "infobox", "pressure"]);

// The lead's own text: everything before the first heading except frontmatter, the infobox, the
// pressure profile, and hints, as markdown.
export function leadMarkdown(body: string): string {
  const parts: string[] = [];
  for (const node of parseMarkdown(body).tree.children) {
    if (node.type === "heading") break;
    if (LEAD_SKIPS.has(node.type) || (node.type === "html" && hintText(node.value))) continue;
    parts.push(body.slice(node.position!.start.offset!, node.position!.end.offset!));
  }
  return parts.join("\n\n");
}
