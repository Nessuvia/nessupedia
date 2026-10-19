import { cardContextText } from "@/cards/cardFile";
import type { WikiDatabase } from "@/db/database";
import type { CanonTier, Card, Page } from "@/db/types";
import { canonMarks, contextSections, contextText, labelTiers } from "@/markdown/autoContext";
import { TIER_LABELS } from "@/markdown/canon";
import { parseMarkdown } from "@/markdown/pipeline";
import { plainText } from "@/markdown/plainText";
import { mergeVersion, versionOf } from "@/markdown/versions";
import { titleKey } from "@/markdown/wikilinks";
import type { LinkIndexer } from "@/services/LinkIndexer";
import type { RelationshipService } from "@/services/RelationshipService";
import { snippetAt, type SearchService } from "@/services/SearchService";
import { closestNames } from "@/utils/fuzzy";
import { formatEntry } from "./AutoContext";
import type { ToolCall, ToolDefinition } from "./LlmClient";
import { parseLooseJson } from "./textToolCalls";

const title = { type: "string", description: "A page title or alias." };

export const WIKI_TOOLS: ToolDefinition[] = [
  {
    name: "search_pages",
    description: "Search the wiki's page titles, aliases, and text. Returns matching titles with a snippet.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" }, limit: { type: "integer", description: "At most this many results (default 8)." } },
      required: ["query"],
    },
  },
  {
    name: "read_page",
    description: "Read a whole wiki page.",
    parameters: { type: "object", properties: { title }, required: ["title"] },
  },
  {
    name: "read_section",
    description: "Read one section of a wiki page by its heading.",
    parameters: { type: "object", properties: { title, heading: { type: "string" } }, required: ["title", "heading"] },
  },
  {
    name: "list_backlinks",
    description: "List the pages that link to a page.",
    parameters: { type: "object", properties: { title }, required: ["title"] },
  },
  {
    name: "get_relationships",
    description: "List a character's relationships, with a summary of each.",
    parameters: { type: "object", properties: { title }, required: ["title"] },
  },
  {
    name: "get_canon",
    description: "List the facts on a page marked Canon, Likely, or Idea. Idea notes are only reachable here.",
    parameters: {
      type: "object",
      properties: { title, tier: { type: "string", enum: ["canon", "likely", "idea"], description: "Only this tier; all tiers when left out." } },
      required: ["title"],
    },
  },
  {
    name: "read_card",
    description: "Read the character card on a page: the description, personality, scenario, and greetings written for chat apps. A reference, not canon.",
    parameters: { type: "object", properties: { title }, required: ["title"] },
  },
];

const TOOL_NAMES = WIKI_TOOLS.map((tool) => tool.name);
const DEFAULT_SEARCH_LIMIT = 8;
const MAX_SEARCH_LIMIT = 20;
const TIERS: Record<string, CanonTier> = { canon: "hard", hard: "hard", likely: "soft", soft: "soft", idea: "maybe", maybe: "maybe" };

export interface ToolOptions {
  // Pages with a version in this continuity are read as that version.
  continuity?: string;
  // Longer results are cut to fit.
  maxChars?: number;
}

export interface ToolOutcome {
  content: string;
  // Titles of the pages the result drew on.
  pages: string[];
  error?: boolean;
  // Set when the arguments needed fixing before they could be read.
  repaired?: boolean;
}

class ToolError extends Error {}

type Args = Record<string, unknown>;

// The read-only tools the Assistant uses to look things up. Every failure comes back as a result the model can act on.
export class WikiTools {
  constructor(
    private readonly db: WikiDatabase,
    private readonly links: LinkIndexer,
    private readonly search: SearchService,
    private readonly relationships: RelationshipService,
  ) {}

  async run(wikiId: string, call: Pick<ToolCall, "name" | "arguments">, options: ToolOptions = {}): Promise<ToolOutcome> {
    const parsed = call.arguments.trim() ? parseLooseJson(call.arguments) : { value: {}, repaired: false };
    const repaired = parsed?.repaired || undefined;
    try {
      const tool = WIKI_TOOLS.find((candidate) => candidate.name === call.name);
      if (!tool) {
        const closest = closestNames(call.name, TOOL_NAMES, { limit: 1 });
        throw new ToolError(`There's no tool called "${call.name}".${closest.length ? ` Did you mean ${closest[0]}?` : ""} Tools: ${TOOL_NAMES.join(", ")}.`);
      }
      if (!parsed || typeof parsed.value !== "object" || parsed.value === null || Array.isArray(parsed.value)) {
        throw new ToolError(`The arguments for ${call.name} must be a JSON object, such as {"title": "Mira"}.`);
      }
      const args = placePositional(tool, parsed.value as Args);
      const outcome = await this.dispatch(wikiId, call.name, args, options);
      return { ...outcome, content: fit(outcome.content, options.maxChars), ...(repaired && { repaired }) };
    } catch (cause) {
      if (!(cause instanceof ToolError)) throw cause;
      return { content: cause.message, pages: [], error: true, ...(repaired && { repaired }) };
    }
  }

  private dispatch(wikiId: string, name: string, args: Args, options: ToolOptions): Promise<Omit<ToolOutcome, "repaired">> {
    switch (name) {
      case "search_pages":
        return this.searchPages(wikiId, text(args, "query", name), args.limit);
      case "read_page":
        return this.readPage(wikiId, text(args, "title", name), options);
      case "read_section":
        return this.readSection(wikiId, text(args, "title", name), text(args, "heading", name), options);
      case "list_backlinks":
        return this.listBacklinks(wikiId, text(args, "title", name), options);
      case "get_relationships":
        return this.getRelationships(wikiId, text(args, "title", name), options);
      case "read_card":
        return this.readCard(wikiId, text(args, "title", name), options);
      default:
        return this.getCanon(wikiId, text(args, "title", name), args.tier, options);
    }
  }

  private async searchPages(wikiId: string, query: string, limitArg: unknown) {
    const limit = typeof limitArg === "number" && limitArg > 0 ? Math.min(Math.floor(limitArg), MAX_SEARCH_LIMIT) : DEFAULT_SEARCH_LIMIT;
    const key = titleKey(query);
    const terms = [...new Set(key.split(" "))];
    const lines: string[] = [];
    // Search reads every word on a page, so hits are checked again against the text the model may see, without Idea notes.
    for (const hit of await this.search.search(wikiId, query, { limit: limit * 2 })) {
      const page = await this.db.pages.get(hit.pageId);
      if (!page || lines.length >= limit) continue;
      const visible = plainText(parseMarkdown(labelTiers(page.body)).tree);
      const lower = visible.toLowerCase();
      const bodyMatch = terms.every((term) => lower.includes(term));
      const nameMatch = [page.title, ...page.aliases].some((name) => titleKey(name).includes(key));
      if (!bodyMatch && !nameMatch) continue;
      const snippet = bodyMatch ? snippetAt(visible, Math.min(...terms.map((term) => lower.indexOf(term)))) : "";
      lines.push(`- ${hit.title}${hit.alias ? ` (also called ${hit.alias})` : ""}${snippet ? `: ${snippet}` : ""}`);
    }
    if (lines.length === 0) return { content: `No pages match "${query}".`, pages: [] };
    return { content: lines.join("\n"), pages: [] };
  }

  private async readPage(wikiId: string, name: string, options: ToolOptions) {
    const { page, mainBody } = await this.resolve(wikiId, name, options);
    const body = contextText(page.body, "full", mainBody);
    return { content: formatEntry(page, body || "(This page is empty.)"), pages: [page.title] };
  }

  private async readSection(wikiId: string, name: string, heading: string, options: ToolOptions) {
    const { page, mainBody } = await this.resolve(wikiId, name, options);
    const sections = contextSections(page.body, mainBody);
    const section = sections.find((candidate) => candidate.key === titleKey(heading.replace(/^#+\s*/, "")));
    if (!section) {
      const labels = sections.map((candidate) => candidate.label);
      const closest = closestNames(heading, labels, { limit: 1 });
      throw new ToolError(
        labels.length === 0
          ? `${page.title} has no sections. Use read_page to read it.`
          : `${page.title} has no section "${heading}".${closest.length ? ` Did you mean ${closest[0]}?` : ""} Its sections: ${labels.join(", ")}.`,
      );
    }
    return { content: `# ${page.title}\n\n${section.text}`, pages: [page.title] };
  }

  private async listBacklinks(wikiId: string, name: string, options: ToolOptions) {
    const { page } = await this.resolve(wikiId, name, options);
    const links = await this.links.backlinks(page.id);
    const sources = await this.db.pages.bulkGet([...new Set(links.map((link) => link.fromPageId))]);
    const titles = sources.flatMap((source) => (source ? [source.title] : [])).sort((a, b) => a.localeCompare(b));
    if (titles.length === 0) return { content: `No pages link to ${page.title}.`, pages: [page.title] };
    return { content: `Pages linking to ${page.title}:\n${titles.map((source) => `- ${source}`).join("\n")}`, pages: [page.title] };
  }

  private async getRelationships(wikiId: string, name: string, options: ToolOptions) {
    const { page, main } = await this.resolve(wikiId, name, options);
    const relationships = await this.relationships.of(main ?? page, options.continuity);
    if (relationships.length === 0) return { content: `${page.title} has no relationship pages.`, pages: [page.title] };
    const parts = relationships.map(({ pairTarget, other, lead }) => `## ${other.title} (from ${pairTarget})\n\n${lead.trim() || "(No summary yet.)"}`);
    return { content: parts.join("\n\n"), pages: [page.title, ...new Set(relationships.map(({ pairTarget }) => pairTarget))] };
  }

  private async getCanon(wikiId: string, name: string, tierArg: unknown, options: ToolOptions) {
    const tier = tierArg === undefined || tierArg === "" ? undefined : TIERS[String(tierArg).trim().toLowerCase()];
    if (tierArg !== undefined && tierArg !== "" && !tier) throw new ToolError(`tier must be canon, likely, or idea.`);
    const { page, mainBody } = await this.resolve(wikiId, name, options);
    const source = mainBody === undefined ? page.body : mergeVersion(mainBody, page.body).markdown;
    const marks = canonMarks(source).filter((mark) => !tier || mark.tier === tier);
    if (marks.length === 0) {
      return { content: `${page.title} has no ${tier ? TIER_LABELS[tier] : "Canon, Likely, or Idea"} marks.`, pages: [page.title] };
    }
    return { content: marks.map((mark) => `[${TIER_LABELS[mark.tier]}] ${mark.text}`).join("\n\n"), pages: [page.title] };
  }

  private async readCard(wikiId: string, name: string, options: ToolOptions) {
    const { page, main } = await this.resolve(wikiId, name, options);
    const card = await pageCard(this.db, page, main);
    if (!card) return { content: `${page.title} has no character card.`, pages: [page.title] };
    return { content: `# Character card of ${page.title}\n\n${cardContextText(card.card)}`, pages: [page.title] };
  }

  // Finds a page by title or alias, preferring its version in the run's continuity. A version reads merged with its main page.
  private async resolve(wikiId: string, name: string, { continuity }: ToolOptions): Promise<{ page: Page; main?: Page; mainBody?: string }> {
    const found = await this.links.findPage(wikiId, name.replace(/^\[\[|\]\]$/g, ""));
    if (!found) throw new ToolError(await this.unknownPage(wikiId, name));
    const version = continuity ? await this.links.findPage(wikiId, `${found.title}/${continuity}`) : undefined;
    const page = version ?? found;
    const continuities = (await this.db.wikis.get(wikiId))?.continuities ?? [];
    const mainTitle = versionOf(page.title, continuities)?.main;
    const main = mainTitle ? await this.links.findPage(wikiId, mainTitle) : undefined;
    return { page, ...(main && { main, mainBody: main.body }) };
  }

  private async unknownPage(wikiId: string, name: string): Promise<string> {
    const pages = await this.db.pages.where("wikiId").equals(wikiId).toArray();
    const closest = closestNames(name, pages.flatMap((page) => [page.title, ...page.aliases]));
    return closest.length
      ? `No page called "${name}". Closest: ${closest.join(", ")}.`
      : `No page called "${name}". Use search_pages to look for it.`;
  }
}

// A page's card, or for a version without one, its main page's.
export async function pageCard(db: WikiDatabase, page: Page, main?: Page): Promise<Card | undefined> {
  return (await db.cards.get(page.id)) ?? (main ? await db.cards.get(main.id) : undefined);
}

// Text tool calls such as read_page("Mira") pass arguments by position; they fill the parameters in order.
function placePositional(tool: ToolDefinition, args: Args): Args {
  const names = Object.keys((tool.parameters.properties ?? {}) as Args);
  const placed: Args = {};
  for (const [key, value] of Object.entries(args)) {
    const name = /^\d+$/.test(key) ? names[Number(key)] : key;
    if (name && !(name in placed)) placed[name] = value;
  }
  return placed;
}

function text(args: Args, key: string, tool: string): string {
  const value = args[key];
  if ((typeof value === "string" && value.trim()) || typeof value === "number") return String(value).trim();
  throw new ToolError(`${tool} needs ${key === "query" ? "a query" : `a ${key}`}.`);
}

function fit(content: string, maxChars: number | undefined): string {
  if (maxChars === undefined || content.length <= maxChars) return content;
  const cut = content.lastIndexOf("\n", maxChars);
  return `${content.slice(0, cut > maxChars / 2 ? cut : maxChars).trimEnd()}\n… (cut short to fit)`;
}
