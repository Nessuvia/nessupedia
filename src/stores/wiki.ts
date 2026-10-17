import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { useLiveQuery } from "@/composables/useLiveQuery";
import { useStoredRef } from "@/composables/useStoredRef";
import { db } from "@/db/database";
import type { Wiki } from "@/db/types";
import { pageService, wikiService } from "@/services";

export const MAIN_PAGE_TITLE = "Main Page";

export function mainPageBody(wikiName: string): string {
  return `Welcome to **${wikiName}**. Start with a character like [[Main Character]] or a place like [[Home Town]].\n`;
}

export const useWikiStore = defineStore("wiki", () => {
  const wikis = useLiveQuery(() => wikiService.list());
  const currentWikiId = ref<string>();
  const lastWikiId = useStoredRef<string | null>("oc-wiki:last-wiki", null);
  const currentWiki = computed(() => wikis.value?.find((wiki) => wiki.id === currentWikiId.value));

  watch(currentWiki, (wiki) => {
    if (wiki) lastWikiId.value = wiki.id;
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
