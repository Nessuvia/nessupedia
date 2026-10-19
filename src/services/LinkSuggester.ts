import type { Node } from "unist";
import { SKIP, visit } from "unist-util-visit";
import type { WikiDatabase } from "@/db/database";
import type { AgentRun, LinkSuggestion, ModelSettings, Page } from "@/db/types";
import { LlmError, type ChatMessage, type LlmClient } from "@/llm/LlmClient";
import { promptBudget, type TokenCounter } from "@/llm/TokenCounter";
import { parseMarkdown } from "@/markdown/pipeline";
import { extractWikilinks, titleKey } from "@/markdown/wikilinks";
import { MentionFinder } from "./MentionFinder";
import type { PageService } from "./PageService";

// Text inside these is never linked: it's already a link, a heading, code, or not shown.
const SKIPPED = new Set(["heading", "code", "inlineCode", "wikiLink", "link", "linkReference", "yaml", "html", "imageEmbed", "image"]);

interface Stretch {
  start: number;
  value: string;
}

// Plain text a link could wrap, with exact source offsets. Text with escapes, and infobox values, which lose their
// offsets when parsed, are left out.
export function linkableText(body: string): Stretch[] {
  const stretches: Stretch[] = [];
  visit(parseMarkdown(body).tree as Node, (node) => {
    if (SKIPPED.has(node.type)) return SKIP;
    if (node.type !== "text") return;
    const { value } = node as Node & { value: string };
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start !== undefined && end !== undefined && end - start === value.length) stretches.push({ start, value });
  });
  return stretches;
}

const namesOf = (page: Page) => [page.title, ...page.aliases];

// Pages a body already links to, by any of their names.
function linkedPageIds(body: string, pages: readonly Page[]): Set<string> {
  const byKey = new Map(pages.flatMap((page) => namesOf(page).map((name) => [titleKey(name), page.id] as const)));
  return new Set(extractWikilinks(parseMarkdown(body).tree).flatMap((link) => byKey.get(titleKey(link.title)) ?? []));
}

// The first unlinked mention of each other page, by title or alias, skipping pages the body already links to.
export function unlinkedMentions(page: Page, pages: readonly Page[]): LinkSuggestion[] {
  const ownKeys = new Set(namesOf(page).map(titleKey));
  const others = pages.filter((other) => other.id !== page.id);
  const finder = new MentionFinder(
    others.flatMap((other) => namesOf(other).filter((name) => !ownKeys.has(titleKey(name))).map((name) => ({ name, pageId: other.id }))),
  );
  const titles = new Map(others.map((other) => [other.id, other.title]));
  const seen = linkedPageIds(page.body, pages);
  const suggestions: LinkSuggestion[] = [];
  for (const stretch of linkableText(page.body)) {
    for (const mention of finder.find(stretch.value)) {
      if (seen.has(mention.pageId) || mention.text.includes("\n")) continue;
      seen.add(mention.pageId);
      suggestions.push({ start: stretch.start + mention.start, end: stretch.start + mention.end, text: mention.text, title: titles.get(mention.pageId)! });
    }
  }
  return suggestions.sort((a, b) => a.start - b.start);
}

// A link keeps the words as written: bare when they name the page, labelled otherwise.
export function linkMarkup(text: string, target: Page | undefined, title: string): string {
  const names = target ? namesOf(target) : [title];
  return names.some((name) => titleKey(name) === titleKey(text)) ? `[[${text}]]` : `[[${title}|${text}]]`;
}

// Wraps each suggestion still found at its offsets, so text edited since it was suggested is left alone.
export function applyLinks(body: string, suggestions: readonly LinkSuggestion[], pages: readonly Page[]): string {
  const byKey = new Map(pages.map((page) => [page.titleKey, page]));
  let text = body;
  for (const suggestion of [...suggestions].sort((a, b) => b.start - a.start)) {
    if (text.slice(suggestion.start, suggestion.end) !== suggestion.text) continue;
    const markup = linkMarkup(suggestion.text, byKey.get(titleKey(suggestion.title)), suggestion.title);
    text = text.slice(0, suggestion.start) + markup + text.slice(suggestion.end);
  }
  return text;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Reads `phrase -> Title` lines, keeping those whose title is a page and whose phrase appears, unlinked, in the text.
export function parseLinkLines(reply: string, page: Page, pages: readonly Page[], taken: readonly LinkSuggestion[]): LinkSuggestion[] {
  const byName = new Map(pages.flatMap((other) => namesOf(other).map((name) => [titleKey(name), other] as const)));
  const linked = linkedPageIds(page.body, pages);
  const stretches = linkableText(page.body);
  const found: LinkSuggestion[] = [];
  const overlaps = (start: number, end: number) => [...taken, ...found].some((other) => start < other.end && end > other.start);

  for (const line of reply.replace(/<(think|thinking)>[\s\S]*?<\/\1>/gi, "").split("\n")) {
    const match = /^\s*(?:[-*]\s+|\d+[.)]\s+)?["“']?(.+?)["”']?\s*(?:->|→|=>)\s*(?:\[\[)?([^\]|]+?)(?:\]\])?\s*$/.exec(line);
    if (!match) continue;
    const phrase = match[1]!.trim();
    const target = byName.get(titleKey(match[2]!));
    if (!phrase || !target || target.id === page.id || linked.has(target.id)) continue;
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escape(phrase)}(?![\\p{L}\\p{N}_])`, "iu");
    for (const stretch of stretches) {
      const hit = pattern.exec(stretch.value);
      if (!hit) continue;
      const start = stretch.start + hit.index;
      const end = start + hit[0].length;
      if (overlaps(start, end)) continue;
      found.push({ start, end, text: hit[0], title: target.title, byAssistant: true });
      break;
    }
  }
  return found;
}

const SYSTEM_PROMPT = "You find where a wiki page refers to other pages of the same wiki.";
const MAX_TITLES_SHARE = 0.4;

// Suggest links: exact mentions found locally, and indirect ones the Assistant finds on request.
export class LinkSuggester {
  constructor(
    private readonly db: WikiDatabase,
    private readonly pages: PageService,
    private readonly client: LlmClient,
    private readonly counter: TokenCounter,
    private readonly settings: () => Promise<ModelSettings>,
  ) {}

  async suggest(pageId: string): Promise<LinkSuggestion[]> {
    const page = await this.pages.get(pageId);
    if (!page) return [];
    return unlinkedMentions(page, await this.pages.listForWiki(page.wikiId));
  }

  // Links the chosen mentions: those found locally as your edit, the Assistant's as its own.
  async accept(pageId: string, suggestions: readonly LinkSuggestion[]): Promise<void> {
    const page = await this.pages.get(pageId);
    if (!page || suggestions.length === 0) return;
    const pages = await this.pages.listForWiki(page.wikiId);
    const local = suggestions.filter((suggestion) => !suggestion.byAssistant);
    const summary = (chosen: readonly LinkSuggestion[]) => `Linked ${[...new Set(chosen.map((suggestion) => suggestion.title))].join(", ")}`;
    if (local.length > 0) await this.pages.save(pageId, applyLinks(page.body, local, pages), { author: "human", summary: summary(local), minor: true });
    const assisted = suggestions.filter((suggestion) => suggestion.byAssistant);
    if (assisted.length > 0) {
      await this.pages.save(pageId, applyLinks(page.body, suggestions, pages), { author: "llm", summary: summary(assisted), minor: true });
    }
  }

  // One request with the page and the wiki's titles, recorded as a run so the run panel can show it.
  async askAssistant(pageId: string, taken: readonly LinkSuggestion[], signal?: AbortSignal): Promise<AgentRun> {
    const page = await this.pages.get(pageId);
    if (!page) throw new Error("This page no longer exists.");
    const settings = await this.settings();
    const run: AgentRun = {
      id: crypto.randomUUID(),
      wikiId: page.wikiId,
      pageId: page.id,
      pageTitle: page.title,
      kind: "suggest-links",
      mode: "strict",
      input: {},
      status: "running",
      sections: [],
      linkSuggestions: [],
      transcript: [],
      startedAt: Date.now(),
    };
    await this.db.runs.add(run);
    try {
      if (!settings.baseUrl.trim()) throw new Error("Set up a model in Settings first.");
      const pages = (await this.pages.listForWiki(page.wikiId)).filter((other) => other.id !== page.id);
      const messages: ChatMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: this.prompt(page, pages, settings) },
      ];
      messages.forEach((message) => run.transcript.push({ kind: "message", role: message.role as "system" | "user", content: message.content, at: Date.now() }));
      let suggestions: LinkSuggestion[] = [];
      for (let attempt = 1; attempt <= 2; attempt++) {
        const result = await this.client.chat(settings, { messages, ...(signal && { signal }) });
        run.transcript.push({ kind: "message", role: "assistant", content: result.content, at: Date.now() });
        suggestions = parseLinkLines(result.content, page, [page, ...pages], taken);
        if (suggestions.length > 0 || /->|→|=>|\bnone\b/i.test(result.content)) break;
        run.transcript.push({ kind: "repair", text: "The reply had no phrase -> Title lines; asking again.", at: Date.now() });
      }
      run.linkSuggestions = suggestions;
      run.status = "done";
    } catch (cause) {
      run.status = cause instanceof LlmError && cause.kind === "aborted" ? "interrupted" : "error";
      run.error = cause instanceof Error ? cause.message : String(cause);
    }
    await this.db.runs.put(run);
    return run;
  }

  private prompt(page: Page, pages: readonly Page[], settings: ModelSettings): string {
    const room = promptBudget(settings, "estimate") * MAX_TITLES_SHARE;
    const lines: string[] = [];
    let used = 0;
    for (const other of [...pages].sort((a, b) => a.title.localeCompare(b.title))) {
      const line = `- ${other.title}${other.aliases.length ? ` (also called ${other.aliases.join(", ")})` : ""}`;
      used += this.counter.estimate(settings, line);
      if (used > room) break;
      lines.push(line);
    }
    return [
      `## Pages in the wiki\n\n${lines.join("\n")}`,
      `## The page "${page.title}"\n\n${page.body.replace(/^---\n[\s\S]*?\n---\n/, "").trim()}`,
      "Find phrases in the page that refer to one of the listed pages without using its exact title or alias, such as a nickname, " +
        'a description ("her brother"), or another spelling. Skip text that is already a [[link]]. ' +
        "Write one per line as `phrase -> Title`, copying the phrase exactly as the page writes it. If there are none, write NONE.",
    ].join("\n\n");
  }
}
