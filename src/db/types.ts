export type CanonTier = "hard" | "soft" | "maybe";

export interface Wiki {
  id: string;
  name: string;
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
  createdAt: number;
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
  author: "human" | "llm";
  minor: boolean;
  summary: string;
  diff: string;
  at: number;
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

export type ProviderId = "llama.cpp" | "koboldcpp" | "openrouter" | "nanogpt" | "openai";

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
