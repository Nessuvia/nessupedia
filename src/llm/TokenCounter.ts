import type { ModelSettings } from "@/db/types";
import type { TokenizerService } from "@/services/TokenizerService";
import { LlmError, type LlmClient } from "./LlmClient";

export type CountMethod = "server" | "tokenizer" | "estimate";

export interface TokenCount {
  tokens: number;
  method: CountMethod;
}

const DEFAULT_CHARS_PER_TOKEN = 4;
// Estimates can run short, so a prompt counted by estimate gets only 90% of the room.
export const ESTIMATE_MARGIN = 0.9;
const CACHE_SIZE = 500;

export function promptBudget(settings: ModelSettings, method: CountMethod): number {
  const room = Math.max(0, settings.contextLength - settings.replyTokens);
  return Math.floor(method === "estimate" ? room * ESTIMATE_MARGIN : room);
}

// Counts with the first method that works: the server's own tokenizer, a downloaded one, then characters per token.
export class TokenCounter {
  private readonly charsPerToken = new Map<string, number>();
  private readonly serverCounts = new Map<string, number>();

  constructor(
    private readonly client: LlmClient,
    private readonly tokenizers: TokenizerService,
  ) {}

  async count(settings: ModelSettings, text: string, signal?: AbortSignal): Promise<TokenCount> {
    const server = await this.serverCount(settings, text, signal);
    if (server !== undefined) return { tokens: server, method: "server" };
    if (settings.tokenizerId) {
      const tokenizer = await this.tokenizers.load(settings.tokenizerId);
      if (tokenizer) return { tokens: tokenizer.count(text), method: "tokenizer" };
    }
    return { tokens: this.estimate(settings, text), method: "estimate" };
  }

  estimate(settings: ModelSettings, text: string): number {
    return Math.ceil(text.length / (this.charsPerToken.get(modelKey(settings)) ?? DEFAULT_CHARS_PER_TOKEN));
  }

  // Replies report how many tokens the prompt really took, which tunes the estimate for that model.
  calibrate(settings: ModelSettings, promptChars: number, promptTokens: number): void {
    if (promptChars < 200 || promptTokens <= 0) return;
    const measured = Math.min(6, Math.max(2, promptChars / promptTokens));
    const key = modelKey(settings);
    const previous = this.charsPerToken.get(key);
    this.charsPerToken.set(key, previous === undefined ? measured : (previous + measured) / 2);
  }

  private async serverCount(settings: ModelSettings, text: string, signal?: AbortSignal): Promise<number | undefined> {
    const key = `${modelKey(settings)}\n${text}`;
    const cached = this.serverCounts.get(key);
    if (cached !== undefined) return cached;
    let tokens: number | undefined;
    try {
      tokens = await this.client.countTokens(settings, text, signal);
    } catch (cause) {
      if (cause instanceof LlmError && cause.kind === "aborted") throw cause;
      return undefined;
    }
    if (tokens === undefined) return undefined;
    if (this.serverCounts.size >= CACHE_SIZE) this.serverCounts.delete(this.serverCounts.keys().next().value!);
    this.serverCounts.set(key, tokens);
    return tokens;
  }
}

function modelKey(settings: ModelSettings): string {
  return `${settings.provider}|${settings.baseUrl}|${settings.model}`;
}
