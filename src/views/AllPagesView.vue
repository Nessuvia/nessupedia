<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, watchEffect } from "vue";
import { useLiveQuery } from "@/composables/useLiveQuery";
import type { Page } from "@/db/types";
import { pageService } from "@/services";
import { useWikiStore } from "@/stores/wiki";

const props = defineProps<{ wikiId: string }>();

const { currentWiki } = storeToRefs(useWikiStore());
const pages = useLiveQuery((wikiId) => pageService.listForWiki(wikiId), () => props.wikiId);

const groups = computed(() => {
  const byLetter = new Map<string, Page[]>();
  for (const page of pages.value ?? []) {
    const first = page.title.charAt(0).toLocaleUpperCase();
    const letter = /\p{L}/u.test(first) ? first : "#";
    byLetter.set(letter, [...(byLetter.get(letter) ?? []), page]);
  }
  return [...byLetter];
});

watchEffect(() => {
  document.title = ["All pages", currentWiki.value?.name].filter(Boolean).join(" | ");
});
</script>

<template>
  <article class="content-card">
    <h1>All pages</h1>
    <p v-if="pages?.length === 0" class="empty">This wiki has no pages yet.</p>
    <section v-for="[letter, group] in groups" :key="letter" :aria-labelledby="`letter-${letter}`">
      <h2 :id="`letter-${letter}`">{{ letter }}</h2>
      <ul>
        <li v-for="page in group" :key="page.id">
          <RouterLink :to="{ name: 'page', params: { wikiId, title: page.title } }">{{ page.title }}</RouterLink>
        </li>
      </ul>
    </section>
  </article>
</template>

<style scoped>
h2 {
  font-size: 1.2rem;
}

ul {
  columns: 14rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

li {
  padding: 0.15rem 0;
  break-inside: avoid;
}

.empty {
  color: var(--color-muted);
}
</style>
