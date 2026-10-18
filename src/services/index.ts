import { db } from "@/db/database";
import { ArchiveService } from "./ArchiveService";
import { AssetService } from "./AssetService";
import { CategoryService } from "./CategoryService";
import { ChangeLog } from "./ChangeLog";
import { ContinuityService } from "./ContinuityService";
import { encodeImage } from "./imageEncoder";
import { LinkIndexer } from "./LinkIndexer";
import { PageService } from "./PageService";
import { RelationshipService } from "./RelationshipService";
import { SearchService } from "./SearchService";
import { StorageService } from "./StorageService";
import { TemplateService } from "./TemplateService";
import { WikiService } from "./WikiService";

export const assetService = new AssetService(db, encodeImage);
export const categoryService = new CategoryService(db);
export const changeLog = new ChangeLog(db);
export const linkIndexer = new LinkIndexer(db);
export const archiveService = new ArchiveService(db, linkIndexer);
export const pageService = new PageService(db, linkIndexer, changeLog);
export const relationshipService = new RelationshipService(db, linkIndexer);
export const continuityService = new ContinuityService(db, pageService);
export const searchService = new SearchService(db);
export const storageService = new StorageService(globalThis.navigator?.storage);
export const templateService = new TemplateService(db);
export const wikiService = new WikiService(db);

// Every save records a change, so the first one asks the browser to keep the data. The timeout runs it outside the transaction.
db.changes.hook("creating", () => {
  setTimeout(() => storageService.requestOnce().catch(() => {}));
});
