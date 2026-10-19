import type { ModelSettings } from "@/db/types";
import { apiUrl, serverUrl } from "./providers";

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatRequest {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onText?: (text: string) => void;
}

export interface ChatResult {
  content: string;
  toolCalls: ToolCall[];
  finishReason?: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface ModelInfo {
  id: string;
  contextLength?: number;
  tokenizer?: string;
}

export type LlmErrorKind = "network" | "auth" | "not-found" | "context" | "bad-request" | "server" | "timeout" | "aborted";

export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export interface ClientTimeouts {
  // Local servers read the whole prompt before the first token, which takes a while on long prompts.
  firstToken: number;
  idle: number;
}

const DEFAULT_TIMEOUTS: ClientTimeouts = { firstToken: 5 * 60_000, idle: 60_000 };

type Fetch = typeof globalThis.fetch;

// Talks to an OpenAI-compatible server straight from the browser. Settings come with every call, so edits apply at once.
export class LlmClient {
  constructor(
    private readonly fetch: Fetch = (...args) => globalThis.fetch(...args),
    private readonly timeouts: ClientTimeouts = DEFAULT_TIMEOUTS,
  ) {}

  async listModels(settings: ModelSettings, signal?: AbortSignal): Promise<ModelInfo[]> {
    const body = (await this.getJson(settings, apiUrl(settings.baseUrl, "/models"), signal)) as { data?: unknown[] };
    return (body.data ?? []).flatMap((entry) => {
      const model = entry as {
        id?: unknown;
        context_length?: unknown;
        top_provider?: { context_length?: unknown };
        architecture?: { tokenizer?: unknown };
      };
      if (typeof model.id !== "string") return [];
      const contextLength = positive(model.context_length) ?? positive(model.top_provider?.context_length);
      const tokenizer = typeof model.architecture?.tokenizer === "string" ? model.architecture.tokenizer : undefined;
      return [{ id: model.id, ...(contextLength && { contextLength }), ...(tokenizer && { tokenizer }) }];
    });
  }

  // The loaded model's context size, from the server's own endpoint where it has one.
  async contextLength(settings: ModelSettings, models: ModelInfo[] = [], signal?: AbortSignal): Promise<number | undefined> {
    try {
      if (settings.provider === "koboldcpp") {
        const body = (await this.getJson(settings, serverUrl(settings.baseUrl, "/api/extra/true_max_context_length"), signal)) as { value?: unknown };
        return positive(body.value);
      }
      if (settings.provider === "llama.cpp") {
        const body = (await this.getJson(settings, serverUrl(settings.baseUrl, "/props"), signal)) as {
          n_ctx?: unknown;
          default_generation_settings?: { n_ctx?: unknown };
        };
        return positive(body.default_generation_settings?.n_ctx) ?? positive(body.n_ctx);
      }
      // Both report the size the running model was loaded with, often far below what it supports.
      if (settings.provider === "ollama") {
        const body = (await this.getJson(settings, serverUrl(settings.baseUrl, "/api/ps"), signal)) as {
          models?: { name?: unknown; model?: unknown; context_length?: unknown }[];
        };
        const running = body.models?.find(({ name, model }) => name === settings.model || model === settings.model);
        return positive(running?.context_length);
      }
      if (settings.provider === "lmstudio") {
        const body = (await this.getJson(settings, serverUrl(settings.baseUrl, "/api/v0/models"), signal)) as {
          data?: { id?: unknown; loaded_context_length?: unknown }[];
        };
        return positive(body.data?.find(({ id }) => id === settings.model)?.loaded_context_length);
      }
    } catch (cause) {
      if (cause instanceof LlmError && cause.kind === "aborted") throw cause;
      return undefined;
    }
    return models.find((model) => model.id === settings.model)?.contextLength;
  }

  // Exact counts from servers that tokenize with the loaded model; undefined for the rest.
  async countTokens(settings: ModelSettings, text: string, signal?: AbortSignal): Promise<number | undefined> {
    if (settings.provider === "koboldcpp") {
      const body = (await this.postJson(settings, serverUrl(settings.baseUrl, "/api/extra/tokencount"), { prompt: text }, signal)) as { value?: unknown };
      return typeof body.value === "number" ? body.value : undefined;
    }
    if (settings.provider === "llama.cpp") {
      const body = (await this.postJson(settings, serverUrl(settings.baseUrl, "/tokenize"), { content: text }, signal)) as { tokens?: unknown };
      return Array.isArray(body.tokens) ? body.tokens.length : undefined;
    }
    return undefined;
  }

  async chat(settings: ModelSettings, request: ChatRequest): Promise<ChatResult> {
    const controller = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const wait = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, ms);
    };
    const forwardAbort = () => controller.abort();
    request.signal?.addEventListener("abort", forwardAbort);
    if (request.signal?.aborted) controller.abort();
    wait(this.timeouts.firstToken);

    try {
      const response = await this.send(settings, apiUrl(settings.baseUrl, "/chat/completions"), {
        method: "POST",
        body: JSON.stringify(wireRequest(settings, request)),
        signal: controller.signal,
      });
      if (!response.headers.get("content-type")?.includes("text/event-stream")) {
        return resultFromJson(await response.json());
      }
      return await readStream(response, request.onText, () => wait(this.timeouts.idle));
    } catch (cause) {
      if (timedOut) throw new LlmError("timeout", "The model stopped sending text.");
      throw asLlmError(cause, request.signal);
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", forwardAbort);
    }
  }

  private async getJson(settings: ModelSettings, url: string, signal?: AbortSignal): Promise<unknown> {
    try {
      return await (await this.send(settings, url, { signal })).json();
    } catch (cause) {
      throw asLlmError(cause, signal);
    }
  }

  private async postJson(settings: ModelSettings, url: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
    try {
      return await (await this.send(settings, url, { method: "POST", body: JSON.stringify(body), signal })).json();
    } catch (cause) {
      throw asLlmError(cause, signal);
    }
  }

  private async send(settings: ModelSettings, url: string, init: RequestInit): Promise<Response> {
    const headers: Record<string, string> = {};
    if (init.body) headers["Content-Type"] = "application/json";
    if (settings.apiKey?.trim()) headers.Authorization = `Bearer ${settings.apiKey.trim()}`;
    let response: Response;
    try {
      response = await this.fetch(url, { ...init, headers });
    } catch (cause) {
      if (init.signal?.aborted) throw cause;
      throw new LlmError("network", `Couldn't reach ${url}.`);
    }
    if (!response.ok) throw await httpError(response);
    return response;
  }
}

function positive(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

function wireRequest(settings: ModelSettings, request: ChatRequest) {
  return {
    model: settings.model,
    stream: true,
    stream_options: { include_usage: true },
    messages: request.messages.map(wireMessage),
    ...(request.tools?.length && {
      tools: request.tools.map((tool) => ({ type: "function", function: tool })),
    }),
    ...(request.temperature !== undefined && { temperature: request.temperature }),
    max_tokens: request.maxTokens ?? settings.replyTokens,
  };
}

function wireMessage(message: ChatMessage) {
  if (message.role === "tool") return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
  if (message.role === "assistant" && message.toolCalls?.length) {
    return {
      role: "assistant",
      content: message.content,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: call.arguments },
      })),
    };
  }
  return { role: message.role, content: message.content };
}

interface WireToolCall {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface WireChoice {
  message?: { content?: string | null; tool_calls?: WireToolCall[] };
  delta?: { content?: string | null; tool_calls?: WireToolCall[] };
  finish_reason?: string | null;
}

interface WireUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

function usageOf(usage: WireUsage | undefined): ChatResult["usage"] {
  if (typeof usage?.prompt_tokens !== "number") return undefined;
  return { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens ?? 0 };
}

function resultFromJson(body: { choices?: WireChoice[]; usage?: WireUsage }): ChatResult {
  const choice = body.choices?.[0];
  const toolCalls = (choice?.message?.tool_calls ?? []).map((call, index) => ({
    id: call.id || `tool_${index}`,
    name: call.function?.name ?? "",
    arguments: call.function?.arguments ?? "",
  }));
  return {
    content: choice?.message?.content ?? "",
    toolCalls,
    ...(choice?.finish_reason && { finishReason: choice.finish_reason }),
    ...(body.usage && { usage: usageOf(body.usage) }),
  };
}

// Server-sent events: `data: {...}` lines, ending with `data: [DONE]`. Tool calls arrive in pieces keyed by index.
async function readStream(response: Response, onText: ChatRequest["onText"], onChunk: () => void): Promise<ChatResult> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const calls = new Map<number, ToolCall>();
  let content = "";
  let finishReason: string | undefined;
  let usage: ChatResult["usage"];
  let buffer = "";

  const handle = (line: string) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    let event: { choices?: WireChoice[]; usage?: WireUsage };
    try {
      event = JSON.parse(data);
    } catch {
      return;
    }
    usage = usageOf(event.usage) ?? usage;
    const choice = event.choices?.[0];
    if (!choice) return;
    if (choice.finish_reason) finishReason = choice.finish_reason;
    const delta = choice.delta ?? choice.message;
    if (delta?.content) {
      content += delta.content;
      onText?.(content);
    }
    for (const [position, piece] of (delta?.tool_calls ?? []).entries()) {
      const index = piece.index ?? position;
      const call = calls.get(index) ?? { id: "", name: "", arguments: "" };
      if (piece.id) call.id = piece.id;
      if (piece.function?.name) call.name += piece.function.name;
      if (piece.function?.arguments) call.arguments += piece.function.arguments;
      calls.set(index, call);
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk();
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop()!;
    lines.forEach(handle);
  }
  handle(buffer + decoder.decode());

  const toolCalls = [...calls.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, call]) => ({ ...call, id: call.id || `tool_${index}` }));
  return { content, toolCalls, ...(finishReason && { finishReason }), ...(usage && { usage }) };
}

async function httpError(response: Response): Promise<LlmError> {
  const text = await response.text().catch(() => "");
  let detail = text;
  try {
    const body = JSON.parse(text) as { error?: string | { message?: string }; message?: string; detail?: unknown };
    const message = typeof body.error === "string" ? body.error : (body.error?.message ?? body.message);
    if (typeof message === "string") detail = message;
  } catch {
    // Not JSON; the raw text is the detail.
  }
  detail = detail.trim().slice(0, 300);
  const message = detail ? `${response.status}: ${detail}` : `The server answered ${response.status}.`;
  if (response.status === 401 || response.status === 403) return new LlmError("auth", message, response.status);
  if (response.status === 404) return new LlmError("not-found", message, response.status);
  if (/context|too long|too many tokens|maximum.*tokens/i.test(detail) && response.status < 500) {
    return new LlmError("context", message, response.status);
  }
  if (response.status >= 400 && response.status < 500) return new LlmError("bad-request", message, response.status);
  return new LlmError("server", message, response.status);
}

function asLlmError(cause: unknown, signal: AbortSignal | undefined): LlmError {
  if (cause instanceof LlmError) return cause;
  if (signal?.aborted || (cause instanceof DOMException && cause.name === "AbortError")) {
    return new LlmError("aborted", "Stopped.");
  }
  if (cause instanceof SyntaxError) return new LlmError("server", "The server's answer wasn't valid JSON.");
  return new LlmError("network", cause instanceof Error ? cause.message : String(cause));
}
