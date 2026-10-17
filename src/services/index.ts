import { db } from "@/db/database";
import { AssetService } from "./AssetService";
import { ChangeLog } from "./ChangeLog";
import { encodeImage } from "./imageEncoder";
import { LinkIndexer } from "./LinkIndexer";
import { PageService } from "./PageService";
import { SearchService } from "./SearchService";
import { WikiService } from "./WikiService";

export const assetService = new AssetService(db, encodeImage);
export const changeLog = new ChangeLog(db);
export const linkIndexer = new LinkIndexer(db);
export const pageService = new PageService(db, linkIndexer, changeLog);
export const searchService = new SearchService(db);
export const wikiService = new WikiService(db);
