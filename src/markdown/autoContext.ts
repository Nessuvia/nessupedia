import type { RootContent } from "mdast";
import { SKIP, visit } from "unist-util-visit";
import type { Document } from "yaml";
import type { CanonTier } from "@/db/types";
import { TIER_LABELS } from "./canon";
import { stringList } from "./frontmatter";
import { hintText } from "./hints";
import { parseMarkdown } from "./pipeline";
import { mergeVersion, splitSections } from "./versions";

export type AutoContextInclude = "lead" | "infobox" | "full";

export interface AutoContextSettings {
  enabled: boolean;
  triggers: string[];
  include: AutoContextInclude;
}

export const AUTO_CONTEXT_KEY = "auto-context";
export const DEFAULT_AUTO_CONTEXT_DEPTH = 1;

const INCLUDES: AutoContextInclude[] = ["lead", "infobox", "full"];

export function readAutoContext(frontmatter: Record<string, unknown>): AutoContextSettings {
  const value = frontmatter[AUTO_CONTEXT_KEY];
  const settings = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const include = typeof settings.include === "string" ? settings.include.trim().toLowerCase() : "";
  return {
    enabled: settings.enabled !== false,
    triggers: stringList(settings.triggers)
      .map((trigger) => trigger.trim())
      .filter(Boolean),
    include: INCLUDES.includes(include as AutoContextInclude) ? (include as AutoContextInclude) : "lead",
  };
}

// Writes only what differs from the defaults, and drops the key when nothing does.
export function writeAutoContext(doc: Document, { enabled, triggers, include }: AutoContextSettings): void {
  const settings: Record<string, unknown> = {};
  if (!enabled) settings.enabled = false;
  if (triggers.length > 0) {
    const list = doc.createNode(triggers);
    list.flow = true;
    settings.triggers = list;
  }
  if (include !== "lead") settings.include = include;
  if (Object.keys(settings).length === 0) {
    if (doc.contents) doc.delete(AUTO_CONTEXT_KEY);
    return;
  }
  doc.set(AUTO_CONTEXT_KEY, doc.createNode(settings));
}

const isHint = (node: RootContent) => node.type === "html" && !!hintText(node.value);

// The part of a body auto-context sends: the lead (infobox included), the infobox alone, or everything,
// without frontmatter or hints.
function pickPart(body: string, include: AutoContextInclude): string {
  const parts: string[] = [];
  for (const node of parseMarkdown(body).tree.children) {
    if (node.type === "heading" && include === "lead") break;
    if (node.type === "yaml" || isHint(node) || (include === "infobox" && node.type !== "infobox")) continue;
    parts.push(body.slice(node.position!.start.offset!, node.position!.end.offset!));
  }
  return parts.join("\n\n");
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

const CLOSING_FENCE = /\n\s*:{3,}\s*$/;

// Removes Idea-tier text and turns Canon and Likely marks into plain labels the model can read:
// `[Canon] … [/Canon]` around blocks and `[Likely: …]` around phrases.
export function labelTiers(markdown: string): string {
  const edits: Edit[] = [];
  const range = (node: { position?: RootContent["position"] }) => ({ start: node.position?.start.offset, end: node.position?.end.offset });

  visit(parseMarkdown(markdown).tree, (node) => {
    const { start, end } = range(node);
    if (start === undefined || end === undefined) return;
    if (node.type === "yaml" || (node.type === "html" && hintText(node.value))) {
      edits.push({ start, end, text: "" });
      return SKIP;
    }
    // Field values lose their offsets when parsed, so infobox and pressure contents are relabelled from source.
    if (node.type === "infobox" || node.type === "pressure") {
      const source = markdown.slice(start, end);
      const innerStart = source.indexOf("\n");
      if (innerStart === -1) return SKIP;
      const innerEnd = CLOSING_FENCE.exec(source)?.index ?? source.length;
      if (innerEnd > innerStart) edits.push({ start: start + innerStart + 1, end: start + innerEnd, text: labelTiers(source.slice(innerStart + 1, innerEnd)) });
      return SKIP;
    }
    if (node.type !== "canonBlock" && node.type !== "canonInline") return;

    const first = node.children[0] && range(node.children[0]).start;
    const last = node.children.at(-1) && range(node.children.at(-1)!).end;
    if (node.tier === "maybe" || first === undefined || last === undefined) {
      edits.push({ start, end, text: "" });
      return SKIP;
    }
    const label = TIER_LABELS[node.tier];
    if (node.type === "canonBlock") {
      edits.push({ start, end: first, text: `[${label}]\n` }, { start: last, end, text: `\n[/${label}]` });
    } else {
      edits.push({ start, end: first, text: `[${label}: ` }, { start: last, end, text: "]" });
    }
  });

  let text = markdown;
  for (const { start, end, text: replacement } of edits.sort((a, b) => b.start - a.start)) {
    text = text.slice(0, start) + replacement + text.slice(end);
  }
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

export const MAIN_CANON_LABEL = "(From main canon)";

export interface ContextSection {
  key: string;
  label: string;
  text: string;
}

// A page's `##` sections, each with its heading, tiers labelled. A version's come merged, inherited ones labelled.
export function contextSections(body: string, mainBody?: string): ContextSection[] {
  if (mainBody === undefined) {
    return splitSections(body).sections.map(({ key, label, start, end }) => ({ key, label, text: labelTiers(body.slice(start, end)) }));
  }
  const merged = mergeVersion(mainBody, body);
  return merged.segments.flatMap((segment) => {
    if (segment.kind !== "section") return [];
    const text = labelTiers(merged.markdown.slice(segment.mergedStart, segment.mergedEnd));
    return [{ key: segment.key!, label: segment.label!, text: segment.origin === "main" ? `${MAIN_CANON_LABEL}\n${text}` : text }];
  });
}

export interface CanonMark {
  tier: CanonTier;
  text: string;
}

// Every Canon, Likely, and Idea mark in a body, blocks and phrases alike, in reading order.
export function canonMarks(markdown: string): CanonMark[] {
  const marks: CanonMark[] = [];
  visit(parseMarkdown(markdown).tree, (node) => {
    if (node.type !== "canonBlock" && node.type !== "canonInline") return;
    const first = node.children[0]?.position?.start.offset;
    const last = node.children.at(-1)?.position?.end.offset;
    if (first === undefined || last === undefined) return SKIP;
    marks.push({ tier: node.tier, text: markdown.slice(first, last).trim() });
    return SKIP;
  });
  return marks;
}

// A page's text for auto-context. A version goes in merged with its main page, inherited parts labelled.
export function contextText(body: string, include: AutoContextInclude, mainBody?: string): string {
  if (mainBody === undefined) return labelTiers(pickPart(body, include));
  const merged = mergeVersion(mainBody, body);
  return merged.segments
    .filter((segment) => segment.kind === "lead" || include === "full")
    .map((segment) => {
      const source = merged.markdown.slice(segment.mergedStart, segment.mergedEnd);
      const text = labelTiers(segment.kind === "lead" ? pickPart(source, include) : source);
      return text && segment.origin === "main" ? `${MAIN_CANON_LABEL}\n${text}` : text;
    })
    .filter(Boolean)
    .join("\n\n");
}
