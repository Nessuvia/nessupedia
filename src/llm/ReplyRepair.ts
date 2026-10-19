import { WIKILINK, titleKey } from "@/markdown/wikilinks";
import { closestNames } from "@/utils/fuzzy";

export interface RepairOptions {
  // The section being written, which the reply shouldn't repeat as a heading.
  heading: string;
  // Every page title and alias in the wiki, for checking links.
  names: readonly string[];
}

export interface UnknownLink {
  title: string;
  closest: string[];
}

export interface RepairedReply {
  markdown: string;
  // What was fixed, in plain words, for the run's transcript.
  fixes: string[];
  unknownLinks: UnknownLink[];
  // Why the reply can't be used, when it can't.
  problem?: string;
}

const THINKING = /<(think|thinking|thought|reasoning)>[\s\S]*?<\/\1>/gi;
const THINKING_END = /<\/(think|thinking|thought|reasoning)>/i;
const UNCLOSED_THINKING = /^\s*<(think|thinking|thought|reasoning)>/i;
const STRAY_THINKING_END = /^[\s\S]*?<\/(think|thinking|thought|reasoning)>/i;
const OUTER_FENCE = /^```[\w-]*\n([\s\S]*?)\n```$/;
const OPENER = /^(?:(?:sure|certainly|of course|okay|ok|absolutely|alright)[!,.].{0,120}|(?:here(?:'s| is| are)|below is)\b.{0,120}:)$/i;
const CLOSER = /^(?:let me know|i hope|feel free|would you like|if you(?:'d| would) like)\b/i;
const HEADING_LINE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const BOLD_LINE = /^\*\*(.+?)\*\*:?\s*$/;
const QUESTION_LINE = /^\s*(?:[-*]\s+)?(?:\*\*)?question\s*:(?:\*\*)?\s*(.+)$/i;
const FENCE_LINE = /^\s*(```|~~~)/;
const DIRECTIVE_OPEN = /^\s*(:{3,})\s*[A-Za-z]/;
const DIRECTIVE_CLOSE = /^\s*(:{3,})\s*$/;

// Cleans a model's reply into one section's body: no thinking, chatter, wrapping fence, repeated heading, or extra
// sections; open directive blocks closed and QUESTION: lines turned into question callouts.
export function repairReply(raw: string, { heading, names }: RepairOptions): RepairedReply {
  const fixes: string[] = [];
  let text = raw.replace(/\r\n?/g, "\n");

  if (UNCLOSED_THINKING.test(text) && !THINKING_END.test(text)) {
    return { markdown: "", fixes, unknownLinks: [], problem: "The reply was all thinking and never got to the section." };
  }
  const withoutThinking = text.replace(THINKING, "").replace(STRAY_THINKING_END, "");
  if (withoutThinking !== text) fixes.push("Removed the model's thinking.");
  text = withoutThinking.trim();

  const firstLine = text.split("\n", 1)[0]!.trim();
  if (text.includes("\n") && OPENER.test(firstLine)) {
    fixes.push(`Removed the opener "${firstLine}"`);
    text = text.slice(text.indexOf("\n") + 1).trim();
  }

  const fenced = OUTER_FENCE.exec(text);
  if (fenced) {
    text = fenced[1]!.trim();
    fixes.push("Took the section out of a code block.");
  }

  let lines = text.split("\n");
  if (lines.length > 0 && /^(?:-{3,}|\*{3,})$/.test(lines[0]!.trim())) lines.shift();

  const first = lines[0]?.trim() ?? "";
  const leading = HEADING_LINE.exec(first);
  const leadingBold = BOLD_LINE.exec(first);
  if ((leading && leading[1]!.length <= 2) || (leadingBold && titleKey(leadingBold[1]!) === titleKey(heading))) {
    fixes.push(`Removed the heading "${(leading?.[2] ?? leadingBold![1])!}" the reply started with.`);
    lines = lines.slice(1);
  } else if (leading && titleKey(leading[2]!) === titleKey(heading)) {
    fixes.push(`Removed the repeated heading "${leading[2]}".`);
    lines = lines.slice(1);
  }

  const kept: string[] = [];
  const open: string[] = [];
  let fence: string | undefined;
  const dropped: string[] = [];
  for (const line of lines) {
    const fenceMark = FENCE_LINE.exec(line)?.[1];
    if (fence) {
      if (fenceMark === fence) fence = undefined;
      kept.push(line);
      continue;
    }
    if (fenceMark) {
      fence = fenceMark;
      kept.push(line);
      continue;
    }
    const extra = HEADING_LINE.exec(line);
    if (extra && extra[1]!.length <= 2) {
      dropped.push(extra[2]!);
      break;
    }
    const opening = DIRECTIVE_OPEN.exec(line)?.[1];
    const closing = DIRECTIVE_CLOSE.exec(line)?.[1];
    if (opening) open.push(opening);
    else if (closing) {
      let closes = open.length - 1;
      while (closes >= 0 && open[closes]!.length > closing.length) closes--;
      if (closes !== -1) open.splice(closes);
    }

    const question = QUESTION_LINE.exec(line);
    if (question) {
      kept.push("", `> [!question]`, `> ${question[1]!.trim()}`, "");
      continue;
    }
    kept.push(line);
  }
  if (dropped.length > 0) fixes.push(`Dropped "${dropped[0]}" and everything after it, which belonged to another section.`);
  while (kept.length > 0 && !kept.at(-1)!.trim()) kept.pop();
  while (kept.length > 0 && CLOSER.test(kept.at(-1)!.trim())) {
    fixes.push(`Removed the closing remark "${kept.pop()!.trim()}"`);
    while (kept.length > 0 && !kept.at(-1)!.trim()) kept.pop();
  }
  if (open.length > 0) {
    kept.push("", ...open.reverse());
    fixes.push(open.length === 1 ? "Closed a block the reply left open." : `Closed ${open.length} blocks the reply left open.`);
  }

  const markdown = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const known = new Set(names.map(titleKey));
  const unknownLinks: UnknownLink[] = [];
  for (const match of markdown.matchAll(WIKILINK)) {
    const title = match[1]!.trim();
    if (known.has(titleKey(title)) || unknownLinks.some((link) => titleKey(link.title) === titleKey(title))) continue;
    unknownLinks.push({ title, closest: closestNames(title, names) });
  }

  return {
    markdown,
    fixes,
    unknownLinks,
    ...(!markdown && { problem: raw.trim() ? "Nothing was left once the reply was cleaned up." : "The reply was empty." }),
  };
}

const TAIL = 2000;
const MIN_PERIOD = 8;
const MAX_PERIOD = 400;
const REPEATS = 4;
const MIN_LINE = 30;

// True when a reply has fallen into a loop: its end repeats one stretch of text, or one long line keeps coming back.
export function isRepeating(text: string): boolean {
  const tail = text.slice(-TAIL);
  for (let period = MIN_PERIOD; period <= MAX_PERIOD && period * REPEATS <= tail.length; period++) {
    const unit = tail.slice(-period);
    let repeats = 1;
    while (repeats < REPEATS && tail.slice(-(repeats + 1) * period, -repeats * period) === unit) repeats++;
    if (repeats === REPEATS && unit.trim()) return true;
  }
  const counts = new Map<string, number>();
  for (const line of text.split("\n")) {
    const key = line.trim();
    if (key.length < MIN_LINE) continue;
    const count = (counts.get(key) ?? 0) + 1;
    if (count >= REPEATS) return true;
    counts.set(key, count);
  }
  return false;
}

// Tags a whole section as Idea, with a fence longer than any directive inside it.
export function wrapIdea(markdown: string): string {
  const longest = Math.max(2, ...[...markdown.matchAll(/^\s*(:{3,})/gm)].map((match) => match[1]!.length));
  const fence = ":".repeat(longest + 1);
  return `${fence}canon{tier=maybe}\n${markdown}\n${fence}`;
}
