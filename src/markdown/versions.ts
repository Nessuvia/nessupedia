import type { Continuity } from "@/db/types";
import { spliceBlock } from "./blocks";
import { hintText } from "./hints";
import { parseMarkdown } from "./pipeline";
import { plainText } from "./plainText";
import { titleSegments } from "./subpages";
import { RELATIONSHIPS_TAB, titleKey } from "./wikilinks";

export function continuityNameError(name: string): string | undefined {
  if (!name.trim()) return "A continuity needs a name";
  if (/[[\]|#/]/.test(name)) return "Continuity names can't contain [ ] | # or /";
  if (titleKey(name) === titleKey(RELATIONSHIPS_TAB)) return `"${RELATIONSHIPS_TAB}" is kept for the generated tab`;
  return undefined;
}

export function findContinuity(continuities: readonly Continuity[], name: string): Continuity | undefined {
  return continuities.find((continuity) => titleKey(continuity.name) === titleKey(name));
}

export interface VersionTitle {
  main: string;
  continuity: Continuity;
}

// A title is a version when it's a top-level page's name followed by a continuity's: "Mira/Noir AU".
export function versionOf(title: string, continuities: readonly Continuity[]): VersionTitle | undefined {
  const segments = titleSegments(title);
  const continuity = segments.length === 2 ? findContinuity(continuities, segments[1]!) : undefined;
  return continuity && { main: segments[0]!, continuity };
}

// Continuity names under a page only work as the whole of a top-level page's version.
export function versionTitleError(title: string, continuities: readonly Continuity[]): string | undefined {
  const segments = titleSegments(title);
  const misplaced = segments.findIndex((segment, index) => index > 0 && !!findContinuity(continuities, segment) && (index !== 1 || segments.length !== 2));
  if (misplaced === -1) return undefined;
  return misplaced === 1
    ? `Versions can't have subpages; "${segments[1]}" is a continuity`
    : `Only top-level pages have versions; "${segments[misplaced]}" is a continuity`;
}

interface Range {
  start: number;
  end: number;
}

export interface Section extends Range {
  key: string;
  label: string;
  empty: boolean;
}

export interface SplitBody {
  // Absent when the lead holds nothing but hints.
  lead?: Range;
  sections: Section[];
}

// Cuts a body into its lead and `##` sections, each running from its first node to its last.
export function splitSections(body: string): SplitBody {
  const split: SplitBody = { sections: [] };
  let section: Section | undefined;
  for (const node of parseMarkdown(body).tree.children) {
    if (node.type === "yaml") continue;
    const start = node.position!.start.offset!;
    const end = node.position!.end.offset!;
    if (node.type === "heading" && node.depth <= 2) {
      const label = plainText({ type: "root", children: [node] }).trim();
      section = { key: titleKey(label), label, start, end, empty: true };
      split.sections.push(section);
    } else if (section) {
      section.end = end;
      section.empty = false;
    } else if (!(node.type === "html" && hintText(node.value))) {
      split.lead = { start: split.lead?.start ?? start, end };
    }
  }
  return split;
}

export interface Segment extends Range {
  origin: "main" | "own";
  kind: "lead" | "section";
  key?: string;
  label?: string;
  mergedStart: number;
  mergedEnd: number;
}

export interface MergedVersion {
  markdown: string;
  segments: Segment[];
  hidden: { key: string; label: string }[];
}

// Lays a version over its main page: the version's lead replaces the main lead, its sections replace
// main sections with the same heading, and an emptied one hides it. Main sections keep their order;
// sections only the version has follow the section they come after in the version.
export function mergeVersion(mainBody: string, ownBody: string): MergedVersion {
  const main = splitSections(mainBody);
  const own = splitSections(ownBody);
  const mainKeys = new Set(main.sections.map((section) => section.key));
  const ownByKey = new Map<string, Section>();
  const followers = new Map<string | null, Section[]>();
  let anchor: string | null = null;
  for (const section of own.sections) {
    if (mainKeys.has(section.key)) {
      if (!ownByKey.has(section.key)) ownByKey.set(section.key, section);
      anchor = section.key;
    } else {
      followers.set(anchor, [...(followers.get(anchor) ?? []), section]);
    }
  }

  const parts: Omit<Segment, "mergedStart" | "mergedEnd">[] = [];
  const hidden: MergedVersion["hidden"] = [];
  const ownSection = ({ start, end, key, label }: Section) => parts.push({ origin: "own", kind: "section", start, end, key, label });

  if (own.lead) parts.push({ origin: "own", kind: "lead", ...own.lead });
  else if (main.lead) parts.push({ origin: "main", kind: "lead", ...main.lead });
  followers.get(null)?.forEach(ownSection);

  const placed = new Set<string>();
  for (const section of main.sections) {
    const override = placed.has(section.key) ? undefined : ownByKey.get(section.key);
    placed.add(section.key);
    if (!override) parts.push({ origin: "main", kind: "section", start: section.start, end: section.end, key: section.key, label: section.label });
    else if (override.empty) hidden.push({ key: section.key, label: section.label });
    else ownSection(override);
    if (override) followers.get(section.key)?.forEach(ownSection);
  }

  let markdown = "";
  const segments = parts.map((part) => {
    if (markdown) markdown += "\n\n";
    const text = (part.origin === "own" ? ownBody : mainBody).slice(part.start, part.end);
    const segment = { ...part, mergedStart: markdown.length, mergedEnd: markdown.length + text.length };
    markdown += text;
    return segment;
  });
  return { markdown: markdown && `${markdown}\n`, segments, hidden };
}

export function segmentAt(merged: MergedVersion, offset: number): Segment | undefined {
  return merged.segments.find((segment) => offset >= segment.mergedStart && offset < segment.mergedEnd);
}

// Maps a range of the merged text back to the version's own body; undefined for inherited text.
export function toOwnRange(merged: MergedVersion, start: number, end: number): Range | undefined {
  const segment = segmentAt(merged, start);
  if (segment?.origin !== "own" || end > segment.mergedEnd) return undefined;
  const shift = segment.start - segment.mergedStart;
  return { start: start + shift, end: end + shift };
}

const frontmatterEnd = (body: string) => {
  const first = parseMarkdown(body).tree.children[0];
  return first?.type === "yaml" ? first.position!.end.offset! : 0;
};

// Copies the main page's lead into the version, right after its frontmatter.
export function forkLead(mainBody: string, ownBody: string): string {
  const lead = splitSections(mainBody).lead;
  if (!lead) return ownBody;
  const at = frontmatterEnd(ownBody);
  const before = ownBody.slice(0, at);
  const after = ownBody.slice(at).trim();
  return `${before}${before ? "\n\n" : ""}${mainBody.slice(lead.start, lead.end)}\n${after ? `\n${after}\n` : ""}`;
}

// Copies a main section into the version; where it lands doesn't matter, since main order wins.
export function forkSection(mainBody: string, ownBody: string, key: string): string {
  const section = splitSections(mainBody).sections.find((candidate) => candidate.key === key);
  if (!section) return ownBody;
  const kept = ownBody.trimEnd();
  return `${kept}${kept ? "\n\n" : ""}${mainBody.slice(section.start, section.end)}\n`;
}

export function hideSection(ownBody: string, label: string): string {
  const kept = ownBody.trimEnd();
  return `${kept}${kept ? "\n\n" : ""}## ${label}\n`;
}

export function unhideSection(ownBody: string, key: string): string {
  const section = splitSections(ownBody).sections.find((candidate) => candidate.key === key && candidate.empty);
  return section ? spliceBlock(ownBody, section.start, section.end, ownBody.slice(section.start, section.end), "") : ownBody;
}
