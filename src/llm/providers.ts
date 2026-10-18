import type { ModelSettings, ProviderId } from "@/db/types";

export interface Provider {
  id: ProviderId;
  label: string;
  baseUrl: string;
  local: boolean;
}

export const PROVIDERS: Provider[] = [
  { id: "koboldcpp", label: "koboldcpp", baseUrl: "http://localhost:5001/v1", local: true },
  { id: "llama.cpp", label: "llama.cpp", baseUrl: "http://localhost:8080/v1", local: true },
  { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", local: false },
  { id: "nanogpt", label: "NanoGPT", baseUrl: "https://nano-gpt.com/api/v1", local: false },
  { id: "openai", label: "OpenAI-compatible", baseUrl: "", local: false },
];

export function providerById(id: ProviderId): Provider {
  return PROVIDERS.find((provider) => provider.id === id) ?? PROVIDERS.at(-1)!;
}

export function defaultModelSettings(provider: ProviderId = "koboldcpp"): ModelSettings {
  return {
    id: "model",
    provider,
    baseUrl: providerById(provider).baseUrl,
    model: "",
    contextLength: 8192,
    replyTokens: 1024,
    tools: true,
  };
}

export function apiUrl(baseUrl: string, path: string): string {
  return `${baseUrl.trim().replace(/\/+$/, "")}${path}`;
}

// llama.cpp and koboldcpp serve their own endpoints beside the OpenAI-compatible ones, at the server root.
export function serverUrl(baseUrl: string, path: string): string {
  return `${baseUrl.trim().replace(/\/+$/, "").replace(/\/v1$/, "")}${path}`;
}
