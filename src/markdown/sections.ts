import { hintText } from "./hints";
import { parseMarkdown } from "./pipeline";
import { plainText } from "./plainText";

export interface BodySection {
  heading: string;
  hints: string[];
  // True when the section holds nothing but hints.
  empty: boolean;
}

// A body's `##` sections with their hints, noting which hold nothing else.
export function bodySections(body: string): BodySection[] {
  const sections: BodySection[] = [];
  let section: BodySection | undefined;
  for (const node of parseMarkdown(body).tree.children) {
    if (node.type === "heading" && node.depth <= 2) {
      section = { heading: plainText({ type: "root", children: [node] }).trim(), hints: [], empty: true };
      sections.push(section);
      continue;
    }
    if (!section) continue;
    const hint = node.type === "html" ? hintText(node.value) : undefined;
    if (hint) section.hints.push(hint);
    else section.empty = false;
  }
  return sections;
}

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
