import { db } from "@/db/database";
import { ChangeLog } from "./ChangeLog";
import { LinkIndexer } from "./LinkIndexer";
import { PageService } from "./PageService";
import { SearchService } from "./SearchService";
import { WikiService } from "./WikiService";

export const changeLog = new ChangeLog(db);
export const linkIndexer = new LinkIndexer(db);
export const pageService = new PageService(db, linkIndexer, changeLog);
export const searchService = new SearchService(db);
export const wikiService = new WikiService(db);
