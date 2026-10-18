import type { WikiDatabase } from "@/db/database";
import { tokenizerFileUrl, type CatalogTokenizer } from "@/llm/tokenizerCatalog";

export interface LoadedTokenizer {
  count(text: string): number;
}

type Fetch = typeof globalThis.fetch;
type LoadLibrary = () => Promise<{ Tokenizer: new (json: object, config: object) => { encode(text: string, options?: object): { ids: number[] } } }>;

// Downloads tokenizers into IndexedDB and loads them on demand; the library and each tokenizer load once per session.
export class TokenizerService {
  private readonly loaded = new Map<string, Promise<LoadedTokenizer | undefined>>();

  constructor(
    private readonly db: WikiDatabase,
    private readonly fetch: Fetch = (...args) => globalThis.fetch(...args),
    private readonly loadLibrary: LoadLibrary = () => import("@huggingface/tokenizers"),
  ) {}

  async downloadedIds(): Promise<string[]> {
    return (await this.db.tokenizers.toCollection().primaryKeys()) as string[];
  }

  async download(entry: CatalogTokenizer, onProgress?: (fraction: number | undefined) => void, signal?: AbortSignal): Promise<void> {
    const config = await (await this.get(tokenizerFileUrl(entry, "tokenizer_config.json"), signal)).blob();
    const data = await readWithProgress(await this.get(tokenizerFileUrl(entry, "tokenizer.json"), signal), onProgress);
    await this.db.tokenizers.put({ id: entry.id, family: entry.label, source: entry.repo, data, config, downloadedAt: Date.now() });
    this.loaded.delete(entry.id);
  }

  async remove(id: string): Promise<void> {
    await this.db.tokenizers.delete(id);
    this.loaded.delete(id);
  }

  load(id: string): Promise<LoadedTokenizer | undefined> {
    let loading = this.loaded.get(id);
    if (!loading) {
      loading = this.build(id).catch(() => undefined);
      this.loaded.set(id, loading);
    }
    return loading;
  }

  private async build(id: string): Promise<LoadedTokenizer | undefined> {
    const record = await this.db.tokenizers.get(id);
    if (!record) {
      this.loaded.delete(id);
      return undefined;
    }
    const [{ Tokenizer }, json, config] = await Promise.all([this.loadLibrary(), record.data.text(), record.config.text()]);
    const tokenizer = new Tokenizer(JSON.parse(json), JSON.parse(config));
    return { count: (text) => tokenizer.encode(text, { add_special_tokens: false }).ids.length };
  }

  private async get(url: string, signal?: AbortSignal): Promise<Response> {
    const response = await this.fetch(url, { signal });
    if (!response.ok) throw new Error(`Downloading ${url} failed (${response.status}).`);
    return response;
  }
}

async function readWithProgress(response: Response, onProgress?: (fraction: number | undefined) => void): Promise<Blob> {
  const total = Number(response.headers.get("content-length")) || undefined;
  if (!response.body || !onProgress) return response.blob();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(total ? Math.min(1, received / total) : undefined);
  }
  return new Blob(chunks as BlobPart[], { type: "application/json" });
}
