// Tokenizers the app can download, from Hugging Face repositories that need no login. Nothing here ships with the app.
export interface CatalogTokenizer {
  id: string;
  label: string;
  repo: string;
  // Matched against the model name; finetunes often drop the base name, so the setting stays pickable by hand.
  names: RegExp;
  // OpenRouter's architecture.tokenizer values that this tokenizer stands in for.
  families: string[];
}

export const TOKENIZER_CATALOG: CatalogTokenizer[] = [
  { id: "gemma-4", label: "Gemma 4", repo: "google/gemma-4-31b-it", names: /gemma[-_ ]?4/i, families: ["Gemini"] },
  { id: "gemma-3", label: "Gemma 3", repo: "unsloth/gemma-3-27b-it", names: /gemma[-_ ]?3|gemma/i, families: [] },
  { id: "llama-3", label: "Llama 3", repo: "unsloth/Llama-3.3-70B-Instruct", names: /llama[-_ ]?3|hermes[-_ ]?3/i, families: ["Llama3"] },
  {
    id: "mistral-tekken",
    label: "Mistral (Tekken)",
    repo: "mistralai/Mistral-Nemo-Instruct-2407",
    names: /nemo|mistral[-_ ]?(small|medium|large)|magistral|ministral|devstral|pixtral|mistral/i,
    families: ["Mistral"],
  },
  { id: "qwen-3", label: "Qwen 3", repo: "Qwen/Qwen3-8B", names: /qwen[-_ ]?3|qwq/i, families: ["Qwen3"] },
  { id: "qwen-2.5", label: "Qwen 2.5", repo: "Qwen/Qwen2.5-7B-Instruct", names: /qwen/i, families: ["Qwen"] },
  { id: "deepseek-v3", label: "DeepSeek V3", repo: "deepseek-ai/DeepSeek-V3", names: /deepseek/i, families: ["DeepSeek"] },
  { id: "glm-4", label: "GLM 4", repo: "zai-org/GLM-4.6", names: /glm[-_ ]?4/i, families: [] },
  { id: "phi-4", label: "Phi 4", repo: "unsloth/phi-4", names: /phi[-_ ]?4/i, families: [] },
  { id: "gpt-o200k", label: "GPT-4o and later", repo: "Xenova/gpt-4o", names: /gpt-?4o|gpt-?4\.1|gpt-?5|gpt-oss|\bo[134](-|$)/i, families: ["GPT"] },
];

export function catalogEntry(id: string | undefined): CatalogTokenizer | undefined {
  return TOKENIZER_CATALOG.find((entry) => entry.id === id);
}

export function suggestTokenizer(model: string, family?: string): CatalogTokenizer | undefined {
  const name = model.split("/").pop() ?? model;
  return (
    TOKENIZER_CATALOG.find((entry) => entry.names.test(name)) ??
    (family ? TOKENIZER_CATALOG.find((entry) => entry.families.includes(family)) : undefined)
  );
}

export function tokenizerFileUrl(entry: CatalogTokenizer, file: "tokenizer.json" | "tokenizer_config.json"): string {
  return `https://huggingface.co/${entry.repo}/resolve/main/${file}`;
}
