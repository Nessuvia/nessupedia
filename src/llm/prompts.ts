import type { AssumptionMode } from "@/db/types";

const MODE_RULES: Record<AssumptionMode, string> = {
  strict:
    "Use only what the notes and the wiki say. Where the section needs something they don't give, don't invent it: " +
    "write a line starting with QUESTION: that asks the author for it.",
  guided:
    "Use what the notes and the wiki say. Fill a gap only when one of the author's rules covers it; " +
    "for any other gap, write a line starting with QUESTION: that asks the author for it.",
  liberal:
    "Use what the notes and the wiki say, and invent freely where they're silent. " +
    "Inventions must fit everything marked [Canon] or [Likely].",
};

export interface SystemPromptInput {
  mode: AssumptionMode;
  tools: boolean;
  wikiRules?: string;
  runRules?: string;
}

export function sectionSystemPrompt({ mode, tools, wikiRules, runRules }: SystemPromptInput): string {
  const parts = [
    "You write one section of a page in a fandom-style wiki about an author's original characters and their world.",
    [
      "Write in markdown, in the neutral voice of a fandom wiki.",
      "Reply with the section's text only: no heading for it, no other sections, and no remarks to the author.",
      "Link other wiki pages as [[Title]] the first time you mention them. Only link pages the wiki has; write any other name as plain text.",
      "In the wiki text, [Canon] marks fixed facts and [Likely] marks probable ones; (From main canon) marks text a version takes from its main page. " +
        "These labels are for you to read: never write them in the section.",
    ].join("\n"),
    MODE_RULES[mode],
  ];
  if (tools) {
    parts.push("You can look things up in the wiki with the tools first. Once you have what you need, reply with the section.");
  }
  if (wikiRules?.trim()) parts.push(`The author's rules for this wiki:\n${wikiRules.trim()}`);
  if (runRules?.trim()) parts.push(`The author's rules for this request:\n${runRules.trim()}`);
  return parts.join("\n\n");
}

export interface SectionPromptInput {
  heading: string;
  pageTitle: string;
  autoContext: string[];
  notes?: string;
  // The page as it stands, when it exists.
  pageText?: string;
  written: string[];
  hints: string[];
  retry?: { note?: string; previous?: string };
  problem?: string;
  authorMessage?: string;
}

export function sectionUserPrompt(input: SectionPromptInput): string {
  const parts: string[] = [];
  if (input.autoContext.length > 0) parts.push(`## Wiki pages\n\n${input.autoContext.join("\n\n")}`);
  if (input.notes?.trim()) parts.push(`## The author's notes\n\n${input.notes.trim()}`);
  parts.push(`## The page\n\nTitle: ${input.pageTitle}`);
  if (input.pageText?.trim()) parts.push(`## The page so far\n\n${input.pageText.trim()}`);
  if (input.written.length > 0) parts.push(`Sections already written: ${input.written.join(", ")}.`);
  if (input.hints.length > 0) parts.push(`What this section should cover:\n${input.hints.map((hint) => `- ${hint}`).join("\n")}`);
  if (input.retry?.previous) parts.push(`Your last try at this section:\n\n${input.retry.previous}`);
  if (input.retry?.note?.trim()) parts.push(`The author's note on it: ${input.retry.note.trim()}`);
  if (input.problem) parts.push(`Your last reply couldn't be used: ${input.problem} Reply with the section's text only.`);
  if (input.authorMessage?.trim()) parts.push(`A message from the author: ${input.authorMessage.trim()}`);
  parts.push(`Write the ${input.heading} section.`);
  return parts.join("\n\n");
}

export const PLAN_SYSTEM_PROMPT = "You plan pages for a fandom-style wiki about an author's original characters and their world.";

export function planUserPrompt(pageTitle: string, notes: string | undefined, autoContext: string[]): string {
  const parts: string[] = [];
  if (autoContext.length > 0) parts.push(`## Wiki pages\n\n${autoContext.join("\n\n")}`);
  if (notes?.trim()) parts.push(`## The author's notes\n\n${notes.trim()}`);
  parts.push(
    `List the section headings a wiki page titled "${pageTitle}" needs to hold these notes, one heading per line, ` +
      "in reading order, with nothing else in the reply. Leave out the opening summary; it has no heading.",
  );
  return parts.join("\n\n");
}

const MAX_HEADING = 60;
const MAX_HEADINGS = 12;

// Headings from a plan reply, one per line, with list marks, numbers, and markdown stripped. Empty when the reply isn't a list.
export function parseHeadings(reply: string): string[] {
  const seen = new Set<string>();
  const headings: string[] = [];
  for (const line of reply.replace(/<(think|thinking)>[\s\S]*?<\/\1>/gi, "").split("\n")) {
    if (/^(?:here|sure|certainly|okay|ok|below)\b/i.test(line.trim())) continue;
    const heading = line
      .trim()
      .replace(/^(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s+)/, "")
      .replace(/^\*\*(.*)\*\*$/, "$1")
      .replace(/:$/, "")
      .trim();
    if (!heading || heading.length > MAX_HEADING || /[.!?]$/.test(heading) || /[[\]|#]/.test(heading)) continue;
    const key = heading.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    headings.push(heading);
  }
  return headings.length >= 2 ? headings.slice(0, MAX_HEADINGS) : [];
}
