import type { ModelSettings, ProviderId } from "@/db/types";

export interface Provider {
  id: ProviderId;
  label: string;
  baseUrl: string;
  local: boolean;
  // Counts tokens with the loaded model, so no tokenizer download is needed.
  exactTokens: boolean;
  // How to let the browser in, for local servers that refuse it by default.
  cors?: string;
}

export const PROVIDERS: Provider[] = [
  { id: "koboldcpp", label: "koboldcpp", baseUrl: "http://localhost:5001/v1", local: true, exactTokens: true },
  { id: "llama.cpp", label: "llama.cpp", baseUrl: "http://localhost:8080/v1", local: true, exactTokens: true },
  {
    id: "ollama",
    label: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    local: true,
    exactTokens: false,
    cors: "Ollama only allows pages served from localhost, so set the OLLAMA_ORIGINS environment variable to this app's address and restart Ollama.",
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    baseUrl: "http://localhost:1234/v1",
    local: true,
    exactTokens: false,
    cors: "LM Studio refuses them until Enable CORS is turned on in its server settings.",
  },
  { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", local: false, exactTokens: false },
  { id: "nanogpt", label: "NanoGPT", baseUrl: "https://nano-gpt.com/api/v1", local: false, exactTokens: false },
  { id: "openai", label: "OpenAI-compatible", baseUrl: "", local: false, exactTokens: false },
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

// Local servers serve their own endpoints beside the OpenAI-compatible ones, at the server root.
export function serverUrl(baseUrl: string, path: string): string {
  return `${baseUrl.trim().replace(/\/+$/, "").replace(/\/v1$/, "")}${path}`;
}
