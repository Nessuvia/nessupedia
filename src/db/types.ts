import type { CharacterCard } from "@/cards/cardFile";

export type CanonTier = "hard" | "soft" | "maybe";

export interface Wiki {
  id: string;
  name: string;
  // The wiki's segment in URLs, unique across wikis.
  slug: string;
  themeId: string;
  voice: "fandom" | "in-universe";
  keepOriginalImages?: boolean;
  // Changes older than this many days are pruned when the wiki opens; unset keeps them all.
  historyDays?: number;
  continuities?: Continuity[];
  // How many links auto-context follows from mentioned pages; unset means 1, and 0 turns following off.
  autoContextDepth?: number;
  // Rules the Assistant follows in every run, in every mode.
  assistantRules?: string;
  appearance?: Appearance;
  // When a ZIP export or import last held this wiki; drives the export reminder and isn't exported.
  lastExportedAt?: number;
  createdAt: number;
}

export type ImageSlot = "banner" | "background" | "wordmark" | "icon";

export interface Appearance {
  // A #rrggbb color; unset uses the theme's default red.
  accent?: string;
  fonts?: { heading?: WikiFont; body?: WikiFont };
  // Asset paths of the wiki's images.
  images?: Partial<Record<ImageSlot, string>>;
}

// A Fontsource font whose files are stored as the wiki's assets.
export interface WikiFont {
  id: string;
  family: string;
  category: string;
  files: { path: string; weight: number; style: "normal" | "italic"; unicodeRange?: string }[];
}

// An alternate universe or spinoff. Pages join it through versions titled "<page>/<name>".
export interface Continuity {
  id: string;
  name: string;
  description: string;
}

export interface Page {
  id: string;
  wikiId: string;
  title: string;
  titleKey: string;
  aliases: string[];
  aliasKeys: string[];
  categoryKeys: string[];
  path: string;
  templateId?: string;
  frontmatter: Record<string, unknown>;
  body: string;
  updatedAt: number;
}

export interface Link {
  id?: number;
  wikiId: string;
  fromPageId: string;
  targetTitle: string;
  targetKey: string;
  toPageId?: string;
  // Set for links from a frontmatter field rather than the body.
  field?: "between";
}

export interface ChangeEntry {
  id?: number;
  wikiId: string;
  pageId: string;
  pageTitle: string;
  kind: "create" | "edit" | "rename" | "delete" | "restore";
  // Set on changes to the page's character card rather than its text; each has its own chain of diffs.
  subject?: "card";
  author: "human" | "llm";
  minor: boolean;
  summary: string;
  diff: string;
  at: number;
}

// A page's character card, at most one per page. Versions are pages, so each AU can have its own.
export interface Card {
  pageId: string;
  wikiId: string;
  card: CharacterCard;
  // Asset path of the card's image.
  avatar?: string;
  updatedAt: number;
}

export interface Asset {
  id: string;
  wikiId: string;
  path: string;
  mime: string;
  blob: Blob;
  hash: string;
  width?: number;
  height?: number;
  original?: Blob;
  createdAt: number;
}

export interface Template {
  id: string;
  wikiId?: string;
  name: string;
  body: string;
  frontmatter: Record<string, unknown>;
}

export type ProviderId = "llama.cpp" | "koboldcpp" | "ollama" | "lmstudio" | "openrouter" | "nanogpt" | "openai";

// The one app-wide record in `settings`; Test connection fills in contextLength and tools, which stay overridable.
export interface ModelSettings {
  id: "model";
  provider: ProviderId;
  baseUrl: string;
  apiKey?: string;
  model: string;
  contextLength: number;
  replyTokens: number;
  tools: boolean;
  tokenizerId?: string;
}

// A downloaded tokenizer.json with its tokenizer_config.json, kept on the device rather than in the app.
export interface Tokenizer {
  id: string;
  family: string;
  source: string;
  data: Blob;
  config: Blob;
  downloadedAt: number;
}

// `section` is the index of the section an entry belongs to; planning entries have none.
export type TranscriptEntry =
  | { kind: "message"; section?: number; role: "system" | "user" | "assistant"; content: string; at: number }
  | { kind: "tool-call"; section?: number; name: string; args: unknown; result?: string; error?: boolean; repeat?: number; at: number }
  | { kind: "repair"; section?: number; text: string; at: number };

export type AssumptionMode = "strict" | "guided" | "liberal";

export interface RunSection {
  heading: string;
  status: "pending" | "writing" | "proposed" | "accepted" | "discarded" | "failed";
  // The proposal as it will be written into the page, without its heading.
  markdown?: string;
  // The model's last reply as it came, kept when it couldn't be used.
  raw?: string;
  // Titles of the pages auto-context and tools served while writing it.
  sources: string[];
  // The template's hints for this section.
  hints?: string[];
  // The author's note for a retry.
  note?: string;
  // Why the section failed.
  problem?: string;
  unknownLinks?: { title: string; closest: string[] }[];
}

export interface LinkSuggestion {
  start: number;
  end: number;
  text: string;
  title: string;
  // Set on suggestions the Assistant found; accepting them is an Assistant edit.
  byAssistant?: boolean;
}

export interface AgentRun {
  id: string;
  wikiId: string;
  // Unset on a draft of a new page until its first section is accepted.
  pageId?: string;
  pageTitle: string;
  kind: "draft" | "suggest-links" | "fill-template";
  mode: AssumptionMode;
  input: {
    notes?: string;
    rules?: string;
    templateId?: string;
    // A new page's starting text, from its template with the chosen parts; its sections are the plan.
    body?: string;
    // Waits for each proposal to be reviewed before writing the next.
    stepwise?: boolean;
  };
  status: "running" | "reviewing" | "done" | "interrupted" | "error";
  // What stopped the run, when it stopped with an error.
  error?: string;
  sections: RunSection[];
  linkSuggestions?: LinkSuggestion[];
  transcript: TranscriptEntry[];
  startedAt: number;
}
