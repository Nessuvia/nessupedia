import { db } from "@/db/database";
import { AutoContext } from "@/llm/AutoContext";
import { LlmClient } from "@/llm/LlmClient";
import { RunOrchestrator } from "@/llm/RunOrchestrator";
import { TokenCounter } from "@/llm/TokenCounter";
import { WikiTools } from "@/llm/tools";
import { AppearanceService } from "./AppearanceService";
import { ArchiveService } from "./ArchiveService";
import { AssetService } from "./AssetService";
import { CardService } from "./CardService";
import { CategoryService } from "./CategoryService";
import { ChangeLog } from "./ChangeLog";
import { ContinuityService } from "./ContinuityService";
import { encodeImage } from "./imageEncoder";
import { LinkIndexer } from "./LinkIndexer";
import { LinkSuggester } from "./LinkSuggester";
import { ModelSettingsService } from "./ModelSettingsService";
import { PageService } from "./PageService";
import { RelationshipService } from "./RelationshipService";
import { ReviewService } from "./ReviewService";
import { SearchService } from "./SearchService";
import { StorageService } from "./StorageService";
import { TemplateService } from "./TemplateService";
import { TokenizerService } from "./TokenizerService";
import { VaultImporter } from "./VaultImporter";
import { WikiService } from "./WikiService";
import { workerZipper } from "./zipper";

export const assetService = new AssetService(db, encodeImage);
export const appearanceService = new AppearanceService(db, assetService);
export const autoContext = new AutoContext(db);
export const categoryService = new CategoryService(db);
export const changeLog = new ChangeLog(db);
export const cardService = new CardService(db, assetService, changeLog);
export const linkIndexer = new LinkIndexer(db);
export const archiveService = new ArchiveService(db, linkIndexer, workerZipper);
export const llmClient = new LlmClient();
export const modelSettingsService = new ModelSettingsService(db);
export const tokenizerService = new TokenizerService(db);
export const tokenCounter = new TokenCounter(llmClient, tokenizerService);
export const pageService = new PageService(db, linkIndexer, changeLog);
export const relationshipService = new RelationshipService(db, linkIndexer);
export const continuityService = new ContinuityService(db, pageService);
export const searchService = new SearchService(db);
export const storageService = new StorageService(globalThis.navigator?.storage);
export const templateService = new TemplateService(db);
export const wikiService = new WikiService(db);
export const vaultImporter = new VaultImporter(db, linkIndexer, assetService, wikiService, workerZipper);
export const wikiTools = new WikiTools(db, linkIndexer, searchService, relationshipService);
export const runOrchestrator = new RunOrchestrator({
  db,
  client: llmClient,
  counter: tokenCounter,
  autoContext,
  tools: wikiTools,
  templates: templateService,
  settings: () => modelSettingsService.get(),
});

export const reviewService = new ReviewService(db, pageService, runOrchestrator);
export const linkSuggester = new LinkSuggester(db, pageService, llmClient, tokenCounter, () => modelSettingsService.get());

runOrchestrator.recover().catch(() => {});

// Every save records a change, so the first one asks the browser to keep the data. The timeout runs it outside the transaction.
db.changes.hook("creating", () => {
  setTimeout(() => storageService.requestOnce().catch(() => {}));
});
