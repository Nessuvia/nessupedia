import { hintText } from "./hints";
import { parseMarkdown } from "./pipeline";
import { plainText } from "./plainText";
import { splitSections } from "./versions";
import { titleKey } from "./wikilinks";

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

export interface NewSection {
  heading: string;
  markdown: string;
}

// Writes sections into a body: each replaces the content under a `##` heading with the same key, or is added in plan
// order, after the nearest earlier planned section the body has, or before the nearest later one, or at the end.
export function applySections(body: string, sections: readonly NewSection[], plan: readonly string[]): string {
  const planKeys = plan.map(titleKey);
  let text = body;
  for (const { heading, markdown } of sections) {
    const key = titleKey(heading);
    const existing = splitSections(text).sections;
    const match = existing.find((section) => section.key === key);
    if (match) {
      const lineEnd = text.indexOf("\n", match.start);
      const headingEnd = lineEnd === -1 || lineEnd > match.end ? match.end : lineEnd;
      const contentEnd = match.empty ? headingEnd : match.end;
      text = `${text.slice(0, headingEnd)}\n\n${markdown.trim()}${text.slice(contentEnd)}`;
      continue;
    }

    const position = planKeys.indexOf(key);
    const before = existing.filter((section) => {
      const at = planKeys.indexOf(section.key);
      return at !== -1 && at < position;
    });
    const after = existing.find((section) => {
      const at = planKeys.indexOf(section.key);
      return at !== -1 && at > position;
    });
    const block = `## ${heading}\n\n${markdown.trim()}`;
    if (before.length > 0 || !after) {
      const at = before.length > 0 ? before.at(-1)!.end : text.trimEnd().length;
      const head = text.slice(0, at).trimEnd();
      text = `${head}${head ? "\n\n" : ""}${block}${text.slice(at)}`;
    } else {
      text = `${text.slice(0, after.start)}${block}\n\n${text.slice(after.start)}`;
    }
  }
  return `${text.trimEnd()}\n`;
}

// What sits under a `##` heading, without the heading itself; undefined when the body has no such section.
export function sectionContent(body: string, heading: string): string | undefined {
  const section = splitSections(body).sections.find((candidate) => candidate.key === titleKey(heading));
  if (!section) return undefined;
  const lineEnd = body.indexOf("\n", section.start);
  return section.empty || lineEnd === -1 ? "" : body.slice(lineEnd, section.end).trim();
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
