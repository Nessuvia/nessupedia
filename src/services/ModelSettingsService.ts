import type { WikiDatabase } from "@/db/database";
import type { ModelSettings } from "@/db/types";
import { defaultModelSettings } from "@/llm/providers";

// One app-wide model setup, shared by every wiki. The API key is stored as typed: a client-only app has nowhere safer to keep it.
export class ModelSettingsService {
  constructor(private readonly db: WikiDatabase) {}

  async get(): Promise<ModelSettings> {
    return { ...defaultModelSettings(), ...(await this.db.settings.get("model")) };
  }

  async configured(): Promise<boolean> {
    const settings = await this.db.settings.get("model");
    return !!settings?.baseUrl.trim();
  }

  async save(settings: Omit<ModelSettings, "id">): Promise<ModelSettings> {
    const record: ModelSettings = {
      ...settings,
      id: "model",
      baseUrl: settings.baseUrl.trim(),
      model: settings.model.trim(),
      contextLength: Math.max(512, Math.floor(settings.contextLength)),
      replyTokens: Math.max(64, Math.floor(settings.replyTokens)),
    };
    if (!record.apiKey?.trim()) delete record.apiKey;
    if (!record.tokenizerId) delete record.tokenizerId;
    await this.db.settings.put(record);
    return record;
  }
}
