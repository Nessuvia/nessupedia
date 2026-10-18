<script setup lang="ts">
import { storeToRefs } from "pinia";
import { watchEffect } from "vue";
import PageIndex from "@/components/PageIndex.vue";
import { useLiveQuery } from "@/composables/useLiveQuery";
import { categoryService } from "@/services";
import { useWikiStore } from "@/stores/wiki";

const props = defineProps<{ wikiId: string; name: string }>();

const { currentWiki } = storeToRefs(useWikiStore());
const pages = useLiveQuery(([wikiId, name]) => categoryService.pagesIn(wikiId, name), () => [props.wikiId, props.name] as const);

watchEffect(() => {
  document.title = [`Category: ${props.name}`, currentWiki.value?.name].filter(Boolean).join(" | ");
});
</script>

<template>
  <article class="content-card">
    <p class="kind"><RouterLink :to="{ name: 'categories', params: { wikiId } }">Category</RouterLink></p>
    <h1>{{ name }}</h1>
    <template v-if="pages">
      <p class="count">
        {{ pages.length === 0 ? "No pages are in this category." : `${pages.length} ${pages.length === 1 ? "page" : "pages"} in this category.` }}
      </p>
      <PageIndex :wiki-id="wikiId" :pages="pages" />
    </template>
  </article>
</template>

<style scoped>
.kind {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

h1 {
  margin-top: 0.25rem;
}

.count {
  color: var(--color-muted);
}
</style>
