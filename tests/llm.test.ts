import { beforeEach, describe, expect, it } from "vitest";
import { WikiDatabase } from "@/db/database";
import type { ModelSettings } from "@/db/types";
import { connectionHelp, testConnection } from "@/llm/connection";
import { LlmClient, LlmError } from "@/llm/LlmClient";
import { defaultModelSettings, serverUrl } from "@/llm/providers";
import { parseTextToolCalls } from "@/llm/textToolCalls";
import { ModelSettingsService } from "@/services/ModelSettingsService";
import { fakeFetch, finish, json, sse, textDelta, toolDelta, type FakeHandler } from "./fakeLlm";

const ORIGIN = "http://kobold.test:5001";

function settings(overrides: Partial<ModelSettings> = {}): ModelSettings {
  return { ...defaultModelSettings("koboldcpp"), baseUrl: `${ORIGIN}/v1`, model: "gemma", ...overrides };
}

function clientFor(routes: Record<string, FakeHandler>, timeouts = { firstToken: 5000, idle: 5000 }) {
  const server = fakeFetch(ORIGIN, routes);
  return { client: new LlmClient(server.fetch, timeouts), requests: server.requests };
}

const ask = { messages: [{ role: "user" as const, content: "Hi" }] };

async function failure(promise: Promise<unknown>): Promise<LlmError> {
  try {
    await promise;
  } catch (cause) {
    if (cause instanceof LlmError) return cause;
    throw cause;
  }
  throw new Error("Expected the call to fail");
}

describe("LlmClient.chat", () => {
  it("streams text, reporting it as it grows, and reads usage", async () => {
    const { client } = clientFor({
      "POST /v1/chat/completions": () =>
        sse([textDelta("Mira "), textDelta("walks."), finish("stop"), { choices: [], usage: { prompt_tokens: 12, completion_tokens: 3 } }]),
    });
    const seen: string[] = [];
    const result = await client.chat(settings(), { ...ask, onText: (text) => seen.push(text) });
    expect(result).toEqual({ content: "Mira walks.", toolCalls: [], finishReason: "stop", usage: { promptTokens: 12, completionTokens: 3 } });
    expect(seen).toEqual(["Mira ", "Mira walks."]);
  });

  it("joins tool calls that arrive in pieces, giving unnamed ones an ID", async () => {
    const { client } = clientFor({
      "POST /v1/chat/completions": () =>
        sse([
          toolDelta(0, { id: "call_1", name: "read_page", arguments: '{"title":' }),
          toolDelta(0, { arguments: ' "Mira"}' }),
          toolDelta(1, { name: "read_page", arguments: '{"title": "Theo"}' }),
          finish("tool_calls"),
        ]),
    });
    const result = await client.chat(settings(), ask);
    expect(result.toolCalls).toEqual([
      { id: "call_1", name: "read_page", arguments: '{"title": "Mira"}' },
      { id: "tool_1", name: "read_page", arguments: '{"title": "Theo"}' },
    ]);
    expect(result.finishReason).toBe("tool_calls");
  });

  it("reads a whole JSON answer from a server that doesn't stream", async () => {
    const { client } = clientFor({
      "POST /v1/chat/completions": () =>
        json({
          choices: [
            {
              message: { content: "", tool_calls: [{ id: "c", function: { name: "read_page", arguments: '{"title":"Mira"}' } }] },
              finish_reason: "tool_calls",
            },
          ],
          usage: { prompt_tokens: 240, completion_tokens: 57 },
        }),
    });
    expect(await client.chat(settings(), ask)).toEqual({
      content: "",
      toolCalls: [{ id: "c", name: "read_page", arguments: '{"title":"Mira"}' }],
      finishReason: "tool_calls",
      usage: { promptTokens: 240, completionTokens: 57 },
    });
  });

  it("sends the key, model, reply length, tools, and tool results in the OpenAI shape", async () => {
    const { client, requests } = clientFor({ "POST /v1/chat/completions": () => sse([textDelta("ok")]) });
    await client.chat(settings({ apiKey: " sk-1 ", replyTokens: 700 }), {
      messages: [
        { role: "user", content: "Who is Mira?" },
        { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "read_page", arguments: '{"title":"Mira"}' }] },
        { role: "tool", toolCallId: "c1", content: "Mira is a courier." },
      ],
      tools: [{ name: "read_page", description: "Read a page", parameters: { type: "object" } }],
      temperature: 0.4,
    });
    const [request] = requests;
    expect(request!.headers.Authorization).toBe("Bearer sk-1");
    expect(request!.body).toMatchObject({
      model: "gemma",
      stream: true,
      max_tokens: 700,
      temperature: 0.4,
      tools: [{ type: "function", function: { name: "read_page", description: "Read a page", parameters: { type: "object" } } }],
      messages: [
        { role: "user", content: "Who is Mira?" },
        { role: "assistant", content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "read_page", arguments: '{"title":"Mira"}' } }] },
        { role: "tool", tool_call_id: "c1", content: "Mira is a courier." },
      ],
    });
  });

  it("leaves out the key and tools when there are none", async () => {
    const { client, requests } = clientFor({ "POST /v1/chat/completions": () => sse([textDelta("ok")]) });
    await client.chat(settings({ apiKey: "  " }), { ...ask, tools: [] });
    expect(requests[0]!.headers.Authorization).toBeUndefined();
    expect(requests[0]!.body).not.toHaveProperty("tools");
  });

  it("sorts failures by cause", async () => {
    const answer = (status: number, body: unknown) => clientFor({ "POST /v1/chat/completions": () => json(body, status) }).client;
    expect((await failure(answer(401, { error: { message: "Invalid key" } }).chat(settings(), ask))).kind).toBe("auth");
    expect((await failure(answer(404, "nope").chat(settings(), ask))).kind).toBe("not-found");
    const overflow = await failure(answer(400, { error: { message: "This model's maximum context length is 16384 tokens" } }).chat(settings(), ask));
    expect(overflow).toMatchObject({ kind: "context", status: 400 });
    expect(overflow.message).toContain("maximum context length");
    expect((await failure(answer(400, { error: "tools not supported" }).chat(settings(), ask))).kind).toBe("bad-request");
    expect((await failure(answer(500, { error: "boom" }).chat(settings(), ask))).kind).toBe("server");
    const unreachable = await failure(new LlmClient(fakeFetch(ORIGIN, {}).fetch).chat(settings({ baseUrl: "http://elsewhere.test/v1" }), ask));
    expect(unreachable.kind).toBe("network");
  });

  it("stops when asked", async () => {
    const { client } = clientFor({ "POST /v1/chat/completions": ({ signal }) => sse([textDelta("Mira")], { hang: true, signal }) });
    const controller = new AbortController();
    const reply = client.chat(settings(), { ...ask, signal: controller.signal, onText: () => controller.abort() });
    expect((await failure(reply)).kind).toBe("aborted");
  });

  it("gives up on a server that stops sending text", async () => {
    const { client } = clientFor(
      { "POST /v1/chat/completions": ({ signal }) => sse([textDelta("Mira")], { hang: true, signal }) },
      { firstToken: 1000, idle: 20 },
    );
    expect((await failure(client.chat(settings(), ask))).kind).toBe("timeout");
  });
});

describe("LlmClient models and context size", () => {
  it("lists models with OpenRouter's context sizes and tokenizer families", async () => {
    const { client } = clientFor({
      "GET /v1/models": () =>
        json({
          data: [
            { id: "google/gemma-4-31b-it", context_length: 131072, architecture: { tokenizer: "Gemini" } },
            { id: "mistral", top_provider: { context_length: 32000 } },
            { id: "bare" },
            { name: "no id" },
          ],
        }),
    });
    expect(await client.listModels(settings())).toEqual([
      { id: "google/gemma-4-31b-it", contextLength: 131072, tokenizer: "Gemini" },
      { id: "mistral", contextLength: 32000 },
      { id: "bare" },
    ]);
  });

  it("asks koboldcpp and llama.cpp at the server root, and reads other providers from the model list", async () => {
    const { client } = clientFor({
      "GET /api/extra/true_max_context_length": () => json({ value: 16384 }),
      "GET /props": () => json({ default_generation_settings: { n_ctx: 8192 } }),
    });
    expect(await client.contextLength(settings())).toBe(16384);
    expect(await client.contextLength(settings({ provider: "llama.cpp" }))).toBe(8192);
    const models = [{ id: "gemma", contextLength: 131072 }];
    expect(await client.contextLength(settings({ provider: "openrouter" }), models)).toBe(131072);
    expect(await client.contextLength(settings({ provider: "openrouter", model: "other" }), models)).toBeUndefined();
  });

  it("reads the loaded context size of Ollama's and LM Studio's running model", async () => {
    const { client } = clientFor({
      "GET /api/ps": () => json({ models: [{ name: "qwen3:8b", model: "qwen3:8b", context_length: 4096 }] }),
      "GET /api/v0/models": () =>
        json({ data: [{ id: "gemma", state: "loaded", max_context_length: 131072, loaded_context_length: 32768 }, { id: "idle", max_context_length: 8192 }] }),
    });
    expect(await client.contextLength(settings({ provider: "ollama", model: "qwen3:8b" }))).toBe(4096);
    expect(await client.contextLength(settings({ provider: "ollama", model: "llama3" }))).toBeUndefined();
    expect(await client.contextLength(settings({ provider: "lmstudio" }))).toBe(32768);
    expect(await client.contextLength(settings({ provider: "lmstudio", model: "idle" }))).toBeUndefined();
  });

  it("treats a missing context endpoint as unknown", async () => {
    const { client } = clientFor({});
    expect(await client.contextLength(settings())).toBeUndefined();
  });

  it("finds the server root by dropping /v1", () => {
    expect(serverUrl("http://localhost:5001/v1/", "/props")).toBe("http://localhost:5001/props");
    expect(serverUrl("http://localhost:8080", "/props")).toBe("http://localhost:8080/props");
  });
});

describe("parseTextToolCalls", () => {
  const tools = ["read_page", "search_pages"];

  it("reads <tool_call> tags, fenced JSON, and bare JSON", () => {
    expect(parseTextToolCalls('<tool_call>{"name": "read_page", "arguments": {"title": "Mira"}}</tool_call>', tools)).toEqual([
      { id: "text_0", name: "read_page", arguments: '{"title":"Mira"}' },
    ]);
    expect(parseTextToolCalls('Let me look.\n```json\n{"name": "search_pages", "parameters": {"query": "crown",}}\n```', tools)).toEqual([
      { id: "text_0", name: "search_pages", arguments: '{"query":"crown"}' },
    ]);
    expect(parseTextToolCalls('[{"function": {"name": "read_page", "arguments": "{\\"title\\": \\"Theo\\"}"}}]', tools)).toEqual([
      { id: "text_0", name: "read_page", arguments: '{"title": "Theo"}' },
    ]);
  });

  it("reads Python-style calls", () => {
    expect(parseTextToolCalls('```tool_code\nread_page(title="Mira \\"Kit\\" Vale")\n```', tools)).toEqual([
      { id: "text_0", name: "read_page", arguments: '{"title":"Mira \\"Kit\\" Vale"}' },
    ]);
    expect(parseTextToolCalls("search_pages(query='crown', limit=3)", tools)).toEqual([
      { id: "text_0", name: "search_pages", arguments: '{"query":"crown","limit":3}' },
    ]);
  });

  it("ignores unknown tools and plain prose", () => {
    expect(parseTextToolCalls('{"name": "delete_page", "arguments": {}}', tools)).toEqual([]);
    expect(parseTextToolCalls("Mira read the page twice.", tools)).toEqual([]);
  });
});

describe("testConnection", () => {
  function server(chat: FakeHandler) {
    return clientFor({
      "GET /v1/models": () => json({ data: [{ id: "koboldcpp/Artemis-31B" }] }),
      "GET /api/extra/true_max_context_length": () => json({ value: 16384 }),
      "POST /v1/chat/completions": chat,
    });
  }

  it("fills in the model, context size, and native tool support", async () => {
    const { client, requests } = server(() => sse([toolDelta(0, { id: "c", name: "read_page", arguments: '{"title":"Mira"}' })]));
    expect(await testConnection(client, settings({ model: "" }))).toEqual({
      models: [{ id: "koboldcpp/Artemis-31B" }],
      model: "koboldcpp/Artemis-31B",
      contextLength: 16384,
      tools: true,
    });
    expect(requests.at(-2)!.body).toMatchObject({ model: "koboldcpp/Artemis-31B", max_tokens: 200 });
    expect(requests.at(-1)!.path).toBe("/api/extra/true_max_context_length");
  });

  it("keeps a model already chosen", async () => {
    const { client } = server(() => sse([textDelta("ok")]));
    expect((await testConnection(client, settings({ model: "mine" }))).model).toBe("mine");
  });

  it("counts a tool call written as text", async () => {
    const { client } = server(() => sse([textDelta('<tool_call>{"name": "read_page", "arguments": {"title": "Mira"}}</tool_call>')]));
    expect((await testConnection(client, settings())).tools).toBe(true);
  });

  it("reports no tools when the model answers in prose or the server refuses them", async () => {
    expect((await testConnection(server(() => sse([textDelta("Mira is a courier.")])).client, settings())).tools).toBe(false);
    const refused = await testConnection(server(() => json({ error: "tools are not supported" }, 400)).client, settings());
    expect(refused).toMatchObject({ tools: false });
    expect(refused.error).toBeUndefined();
  });

  it("explains an unreachable server", async () => {
    const report = await testConnection(new LlmClient(fakeFetch(ORIGIN, {}).fetch), settings({ baseUrl: "http://localhost:5001/v1" }));
    expect(report.models).toEqual([]);
    expect(report.error).toMatchObject({ kind: "network" });
    expect(report.error!.help).toContain("koboldcpp is running");
  });

  it("explains a rejected key", async () => {
    const { client } = clientFor({ "GET /v1/models": () => json({ error: { message: "Invalid API key" } }, 401) });
    const report = await testConnection(client, settings({ provider: "openrouter" }));
    expect(report.error).toMatchObject({ kind: "auth", message: "401: Invalid API key" });
    expect(report.error!.help).toContain("API key");
  });
});

describe("connectionHelp", () => {
  const network = new LlmError("network", "Couldn't reach it.");

  it("points out that HTTPS pages can't call plain HTTP servers away from localhost", () => {
    expect(connectionHelp(network, settings({ baseUrl: "http://10.0.0.5:5001/v1" }), "https:")).toContain("HTTPS");
    expect(connectionHelp(network, settings({ baseUrl: "http://localhost:5001/v1" }), "https:")).toContain("koboldcpp is running");
    expect(connectionHelp(network, settings({ baseUrl: "http://10.0.0.5:5001/v1" }), "http:")).toContain("koboldcpp is running");
  });

  it("says how to let the browser into Ollama and LM Studio", () => {
    expect(connectionHelp(network, settings({ provider: "ollama", baseUrl: "http://localhost:11434/v1" }))).toContain("OLLAMA_ORIGINS");
    expect(connectionHelp(network, settings({ provider: "lmstudio", baseUrl: "http://localhost:1234/v1" }))).toContain("Enable CORS");
  });

  it("covers cloud providers and a missing URL", () => {
    expect(connectionHelp(network, settings({ provider: "openrouter", baseUrl: "https://openrouter.ai/api/v1" }))).toContain("internet");
    expect(connectionHelp(network, settings({ baseUrl: " " }))).toContain("URL");
  });
});

describe("ModelSettingsService", () => {
  let service: ModelSettingsService;

  beforeEach(() => {
    service = new ModelSettingsService(new WikiDatabase(`test-${crypto.randomUUID()}`));
  });

  it("starts from koboldcpp's defaults", async () => {
    expect(await service.get()).toEqual(defaultModelSettings("koboldcpp"));
    expect(await service.configured()).toBe(false);
  });

  it("saves one app-wide record, trimmed and within bounds", async () => {
    const { id: _id, ...rest } = settings();
    await service.save({ ...rest, baseUrl: " http://localhost:8080/v1 ", model: " gemma ", apiKey: " ", contextLength: 100, replyTokens: 900.7 });
    expect(await service.get()).toEqual({ ...settings(), baseUrl: "http://localhost:8080/v1", contextLength: 512, replyTokens: 900 });
    expect(await service.configured()).toBe(true);
  });
});
