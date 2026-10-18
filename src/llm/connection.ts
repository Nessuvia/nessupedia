import type { ModelSettings } from "@/db/types";
import { LlmError, type LlmClient, type ModelInfo, type ToolDefinition } from "./LlmClient";
import { providerById } from "./providers";
import { parseTextToolCalls } from "./textToolCalls";

export interface ConnectionReport {
  models: ModelInfo[];
  model?: string;
  contextLength?: number;
  tools?: boolean;
  error?: { kind: LlmError["kind"]; message: string; help: string };
}

const PROBE_TOOL: ToolDefinition = {
  name: "read_page",
  description: "Read a wiki page by its title.",
  parameters: { type: "object", properties: { title: { type: "string" } }, required: ["title"] },
};

// Checks the server answers, then finds the model, its context size, and whether it calls tools when offered one.
export async function testConnection(client: LlmClient, settings: ModelSettings, signal?: AbortSignal): Promise<ConnectionReport> {
  let models: ModelInfo[];
  try {
    models = await client.listModels(settings, signal);
  } catch (cause) {
    return { models: [], error: describe(cause, settings) };
  }

  const model = settings.model.trim() || models[0]?.id;
  const checked = { ...settings, model: model ?? "" };
  const contextLength = await client.contextLength(checked, models, signal);
  const report: ConnectionReport = { models, ...(model && { model }), ...(contextLength && { contextLength }) };

  try {
    const result = await client.chat(checked, {
      messages: [{ role: "user", content: 'Use the read_page tool to read the page titled "Mira". Reply with only the tool call.' }],
      tools: [PROBE_TOOL],
      temperature: 0,
      maxTokens: 200,
      signal,
    });
    const native = result.toolCalls.some((call) => call.name === PROBE_TOOL.name);
    report.tools = native || parseTextToolCalls(result.content, [PROBE_TOOL.name]).length > 0;
  } catch (cause) {
    // A server that refuses the tools field outright can still write; it just runs on auto-context.
    if (cause instanceof LlmError && cause.kind === "bad-request") report.tools = false;
    else report.error = describe(cause, checked);
  }
  return report;
}

function describe(cause: unknown, settings: ModelSettings): NonNullable<ConnectionReport["error"]> {
  const error = cause instanceof LlmError ? cause : new LlmError("network", String(cause));
  return { kind: error.kind, message: error.message, help: connectionHelp(error, settings) };
}

export function connectionHelp(error: LlmError, settings: ModelSettings, pageProtocol = globalThis.location?.protocol): string {
  const provider = providerById(settings.provider);
  switch (error.kind) {
    case "network": {
      const url = settings.baseUrl.trim();
      if (!url) return "Enter the server's URL first.";
      if (pageProtocol === "https:" && url.startsWith("http:") && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(url)) {
        return "This page is served over HTTPS, and browsers block it from calling a plain HTTP server other than localhost. Use HTTPS for the server, or open the app from localhost.";
      }
      return provider.local
        ? `Check that ${provider.label} is running and the URL is right, including the port and /v1. If it is, the server may be blocking requests from the browser (CORS); ${provider.label} allows them by default, so a proxy in between is the usual cause.`
        : "Check the URL and your internet connection. If both are fine, the server may not accept requests from a browser (CORS).";
    }
    case "auth":
      return "The server turned down the API key. Check it's copied in full and still active.";
    case "not-found":
      return "The server answered, but not as an OpenAI-compatible API. The URL usually ends in /v1.";
    case "timeout":
      return "The server took too long to answer. A large model may still be loading.";
    case "aborted":
      return "The test was stopped.";
    default:
      return "The server answered with an error. The message above has its details.";
  }
}
