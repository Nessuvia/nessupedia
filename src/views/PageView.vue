<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, watch, watchEffect } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppIcon from "@/components/AppIcon.vue";
import PageContent from "@/components/PageContent.vue";
import { useLiveQuery } from "@/composables/useLiveQuery";
import { titleKey } from "@/markdown/wikilinks";
import { pageService } from "@/services";
import { useWikiStore } from "@/stores/wiki";

const props = defineProps<{ wikiId: string; title: string }>();

const route = useRoute();
const router = useRouter();
const { currentWiki } = storeToRefs(useWikiStore());

const page = useLiveQuery(
  async ([wikiId, title]) => (await pageService.getByTitle(wikiId, title)) ?? null,
  () => [props.wikiId, props.title] as const,
);

const redirectedFrom = computed(() => {
  void route.fullPath;
  const from: unknown = window.history.state?.redirectedFrom;
  return typeof from === "string" ? from : undefined;
});

watch(page, (found) => {
  if (!found || found.title === props.title) return;
  const viaAlias = found.titleKey !== titleKey(props.title);
  void router.replace({
    name: "page",
    params: { wikiId: props.wikiId, title: found.title },
    hash: route.hash,
    ...(viaAlias && { state: { redirectedFrom: props.title } }),
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
      <div v-if="page" class="page-actions">
        <RouterLink class="page-action" :to="{ name: 'edit-page', params: { wikiId, title: page.title } }">
          <AppIcon name="edit" />
          Edit
        </RouterLink>
      </div>
    </header>
    <p v-if="redirectedFrom && page" class="redirect-note">(Redirected from {{ redirectedFrom }})</p>
    <PageContent v-if="page" :wiki-id="wikiId" :markdown="page.body" />
    <div v-else-if="page === null" class="missing">
      <p>This page doesn't exist yet.</p>
      <RouterLink class="create-button" :to="{ name: 'new-page', params: { wikiId }, query: { title } }">
        Create this page
      </RouterLink>
    </div>
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

.page-actions {
  display: flex;
  gap: 1rem;
  padding-bottom: 0.75rem;
}

.page-action {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.page-action .icon {
  width: 1rem;
  height: 1rem;
}

.redirect-note {
  margin: 0.25rem 0 0;
  color: var(--color-muted);
  font-size: 0.85rem;
}

.missing p {
  color: var(--color-muted);
}

.create-button {
  display: inline-block;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  background: var(--color-header);
  color: var(--color-header-text);
}

.create-button:hover {
  text-decoration: none;
}
</style>
