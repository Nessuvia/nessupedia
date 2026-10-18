import { beforeEach, describe, expect, it, vi } from "vitest";
import { WikiDatabase } from "@/db/database";
import type { ModelSettings } from "@/db/types";
import { LlmClient } from "@/llm/LlmClient";
import { defaultModelSettings } from "@/llm/providers";
import { promptBudget, TokenCounter } from "@/llm/TokenCounter";
import { catalogEntry, suggestTokenizer, TOKENIZER_CATALOG } from "@/llm/tokenizerCatalog";
import { TokenizerService } from "@/services/TokenizerService";
import { fakeFetch, json, type FakeHandler } from "./fakeLlm";

const ORIGIN = "http://kobold.test:5001";
const HUB = "https://huggingface.co";

// A word-level tokenizer small enough to write out: one token per word or punctuation mark.
const TINY_TOKENIZER = {
  version: "1.0",
  truncation: null,
  padding: null,
  added_tokens: [],
  normalizer: { type: "Lowercase" },
  pre_tokenizer: { type: "Whitespace" },
  post_processor: null,
  decoder: null,
  model: { type: "WordLevel", vocab: { "[UNK]": 0, mira: 1, walks: 2, ".": 3 }, unk_token: "[UNK]" },
};

function settings(overrides: Partial<ModelSettings> = {}): ModelSettings {
  return { ...defaultModelSettings("koboldcpp"), baseUrl: `${ORIGIN}/v1`, model: "gemma", ...overrides };
}

const cloud = (overrides: Partial<ModelSettings> = {}) =>
  settings({ provider: "openrouter", baseUrl: "https://openrouter.ai/api/v1", model: "google/gemma-4-31b-it", ...overrides });

let db: WikiDatabase;

beforeEach(() => {
  db = new WikiDatabase(`test-${crypto.randomUUID()}`);
});

function hub() {
  const entry = catalogEntry("gemma-4")!;
  const base = `/${entry.repo}/resolve/main`;
  return fakeFetch(HUB, {
    [`GET ${base}/tokenizer.json`]: () => {
      const body = JSON.stringify(TINY_TOKENIZER);
      return new Response(body, { headers: { "Content-Type": "application/json", "Content-Length": String(body.length) } });
    },
    [`GET ${base}/tokenizer_config.json`]: () => json({}),
  });
}

describe("suggestTokenizer", () => {
  it("matches model names, ignoring the provider prefix", () => {
    expect(suggestTokenizer("google/gemma-4-31b-it")?.id).toBe("gemma-4");
    expect(suggestTokenizer("gemma-3-27b-it")?.id).toBe("gemma-3");
    expect(suggestTokenizer("meta-llama/llama-3.3-70b-instruct")?.id).toBe("llama-3");
    expect(suggestTokenizer("mistralai/mistral-nemo")?.id).toBe("mistral-tekken");
    expect(suggestTokenizer("qwen/qwen3-235b-a22b")?.id).toBe("qwen-3");
    expect(suggestTokenizer("qwen/qwen-2.5-72b-instruct")?.id).toBe("qwen-2.5");
    expect(suggestTokenizer("deepseek/deepseek-chat-v3")?.id).toBe("deepseek-v3");
    expect(suggestTokenizer("openai/gpt-4o-mini")?.id).toBe("gpt-o200k");
    expect(suggestTokenizer("openai/o3")?.id).toBe("gpt-o200k");
  });

  it("falls back to OpenRouter's tokenizer family, and to nothing", () => {
    expect(suggestTokenizer("thedrummer/artemis-31b", "Gemini")?.id).toBe("gemma-4");
    expect(suggestTokenizer("thedrummer/artemis-31b")).toBeUndefined();
    expect(suggestTokenizer("anthropic/claude-sonnet", "Claude")).toBeUndefined();
  });

  it("gives every entry a unique ID", () => {
    expect(new Set(TOKENIZER_CATALOG.map((entry) => entry.id)).size).toBe(TOKENIZER_CATALOG.length);
  });
});

describe("TokenizerService", () => {
  it("downloads both files into the database, reporting progress, and loads them to count", async () => {
    const { fetch, requests } = hub();
    const service = new TokenizerService(db, fetch);
    const progress: (number | undefined)[] = [];
    await service.download(catalogEntry("gemma-4")!, (fraction) => progress.push(fraction));

    expect(requests.map((request) => request.path)).toEqual([
      "/google/gemma-4-31b-it/resolve/main/tokenizer_config.json",
      "/google/gemma-4-31b-it/resolve/main/tokenizer.json",
    ]);
    expect(progress.at(-1)).toBe(1);
    expect(await service.downloadedIds()).toEqual(["gemma-4"]);
    expect(await db.tokenizers.get("gemma-4")).toMatchObject({ family: "Gemma 4", source: "google/gemma-4-31b-it" });

    const tokenizer = await service.load("gemma-4");
    expect(tokenizer!.count("Mira walks home.")).toBe(4);
  });

  it("loads the library once per tokenizer and forgets removed ones", async () => {
    const library = vi.fn(() => import("@huggingface/tokenizers"));
    const service = new TokenizerService(db, hub().fetch, library);
    await service.download(catalogEntry("gemma-4")!);
    await Promise.all([service.load("gemma-4"), service.load("gemma-4")]);
    expect(library).toHaveBeenCalledTimes(1);

    await service.remove("gemma-4");
    expect(await service.load("gemma-4")).toBeUndefined();
    expect(await service.downloadedIds()).toEqual([]);
  });

  it("reports a failed download and stores nothing", async () => {
    const service = new TokenizerService(db, fakeFetch(HUB, {}).fetch);
    await expect(service.download(catalogEntry("gemma-4")!)).rejects.toThrow("404");
    expect(await service.downloadedIds()).toEqual([]);
  });
});

describe("TokenCounter", () => {
  function counter(routes: Record<string, FakeHandler> = {}) {
    const server = fakeFetch(ORIGIN, routes);
    const tokenizers = new TokenizerService(db, hub().fetch);
    return { counter: new TokenCounter(new LlmClient(server.fetch), tokenizers), tokenizers, requests: server.requests };
  }

  it("asks koboldcpp and llama.cpp for exact counts, once per text", async () => {
    const { counter: kobold, requests } = counter({
      "POST /api/extra/tokencount": ({ body }) => json({ value: String(body!.prompt).length }),
      "POST /tokenize": ({ body }) => json({ tokens: String(body!.content).split(" ") }),
    });
    expect(await kobold.count(settings(), "Mira walks")).toEqual({ tokens: 10, method: "server" });
    expect(await kobold.count(settings(), "Mira walks")).toEqual({ tokens: 10, method: "server" });
    expect(requests).toHaveLength(1);
    expect(await kobold.count(settings({ provider: "llama.cpp" }), "Mira walks")).toEqual({ tokens: 2, method: "server" });
  });

  it("uses a downloaded tokenizer for cloud models", async () => {
    const { counter: tokens, tokenizers } = counter();
    await tokenizers.download(catalogEntry("gemma-4")!);
    expect(await tokens.count(cloud({ tokenizerId: "gemma-4" }), "Mira walks home.")).toEqual({ tokens: 4, method: "tokenizer" });
  });

  it("estimates when the server can't count and no tokenizer is downloaded", async () => {
    const { counter: tokens } = counter();
    expect(await tokens.count(settings(), "x".repeat(41))).toEqual({ tokens: 11, method: "estimate" });
    expect(await tokens.count(cloud({ tokenizerId: "gemma-4" }), "x".repeat(40))).toEqual({ tokens: 10, method: "estimate" });
  });

  it("tunes the estimate from the token counts replies report", () => {
    const { counter: tokens } = counter();
    tokens.calibrate(cloud(), 3000, 1000);
    expect(tokens.estimate(cloud(), "x".repeat(300))).toBe(100);
    tokens.calibrate(cloud(), 5000, 1000);
    expect(tokens.estimate(cloud(), "x".repeat(400))).toBe(100);
    expect(tokens.estimate(cloud({ model: "other" }), "x".repeat(400))).toBe(100);
    tokens.calibrate(cloud(), 50, 10);
    expect(tokens.estimate(cloud(), "x".repeat(400))).toBe(100);
  });
});

describe("promptBudget", () => {
  it("leaves room for the reply, and holds back 10% more when estimating", () => {
    const model = settings({ contextLength: 16384, replyTokens: 1024 });
    expect(promptBudget(model, "server")).toBe(15360);
    expect(promptBudget(model, "tokenizer")).toBe(15360);
    expect(promptBudget(model, "estimate")).toBe(13824);
  });
});
