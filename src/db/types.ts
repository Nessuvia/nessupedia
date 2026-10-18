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

export type TranscriptEntry =
  | { kind: "message"; role: "system" | "user" | "assistant"; content: string; at: number }
  | { kind: "tool-call"; name: string; args: unknown; result?: unknown; at: number };

export interface AgentRun {
  id: string;
  wikiId: string;
  pageId: string;
  kind: "draft" | "suggest-links" | "fill-template";
  status: "running" | "done" | "interrupted" | "error";
  transcript: TranscriptEntry[];
  startedAt: number;
}
