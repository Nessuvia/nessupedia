<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, watchEffect } from "vue";
import { useRouter } from "vue-router";
import { useLiveQuery } from "@/composables/useLiveQuery";
import { headingId, parseMarkdown, renderMarkdown } from "@/markdown/pipeline";
import { pageService } from "@/services";
import { useWikiStore } from "@/stores/wiki";

const props = defineProps<{ wikiId: string; title: string }>();

const router = useRouter();
const { currentWiki } = storeToRefs(useWikiStore());

const page = useLiveQuery(
  async ([wikiId, title]) => (await pageService.getByTitle(wikiId, title)) ?? null,
  () => [props.wikiId, props.title] as const,
);

const html = computed(() => {
  if (!page.value) return "";
  return renderMarkdown(parseMarkdown(page.value.body).tree, {
    pageHref: (title, heading) =>
      router.resolve({ name: "page", params: { wikiId: props.wikiId, title }, hash: heading && `#${headingId(heading)}` }).href,
  });
});

watchEffect(() => {
  document.title = [page.value?.title ?? props.title, currentWiki.value?.name].filter(Boolean).join(" | ");
});
</script>

<template>
  <article class="content-card">
    <header class="page-header">
      <h1 class="page-title">{{ page?.title ?? title }}</h1>
    </header>
    <div v-if="page" class="page-body" v-html="html" />
    <p v-else-if="page === null" class="missing">This page doesn't exist yet.</p>
  </article>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid var(--color-border);
}

.page-title {
  margin: 0.25rem 0 0.5rem;
  border: 0;
}

.missing {
  color: var(--color-muted);
}
</style>
