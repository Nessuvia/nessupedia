import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { useLiveQuery } from "@/composables/useLiveQuery";
import { useStoredRef } from "@/composables/useStoredRef";
import { db } from "@/db/database";
import type { Wiki } from "@/db/types";
import { changeLog, pageService, wikiService } from "@/services";
import { MAIN_PAGE_TITLE } from "@/services/WikiService";

export { MAIN_PAGE_TITLE };

export function mainPageBody(wikiName: string): string {
  return `Welcome to **${wikiName}**. Start with a character like [[Main Character]] or a place like [[Home Town]].\n`;
}

export const useWikiStore = defineStore("wiki", () => {
  const wikis = useLiveQuery(() => wikiService.list());
  const currentWikiId = ref<string>();
  const lastWikiId = useStoredRef<string | null>("oc-wiki:last-wiki", null);
  const currentWiki = computed(() => wikis.value?.find((wiki) => wiki.id === currentWikiId.value));

  // Old history is pruned the first time a wiki opens in a session.
  const pruned = new Set<string>();
  watch(currentWiki, (wiki) => {
    if (!wiki) return;
    lastWikiId.value = wiki.id;
    // Settings prune themselves when the setting changes, so later updates to the wiki don't count.
    if (pruned.has(wiki.id)) return;
    pruned.add(wiki.id);
    if (wiki.historyDays) changeLog.prune(wiki.id, wiki.historyDays).catch((error) => console.error(error));
  });

  function createWiki(name: string): Promise<Wiki> {
    return db.transaction("rw", db.tables, async () => {
      const wiki = await wikiService.create(name);
      await pageService.create({ wikiId: wiki.id, title: MAIN_PAGE_TITLE, body: mainPageBody(wiki.name) });
      return wiki;
    });
  }

  return { wikis, currentWikiId, currentWiki, lastWikiId, createWiki };
});
