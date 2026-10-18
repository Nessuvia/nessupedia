<script setup lang="ts">
import { storeToRefs } from "pinia";
import { ref, watch, watchEffect } from "vue";
import { useRouter } from "vue-router";
import { useLiveQuery } from "@/composables/useLiveQuery";
import { titleParam } from "@/router/params";
import { pageService, searchService } from "@/services";
import { titleError } from "@/markdown/wikilinks";
import { useWikiStore } from "@/stores/wiki";
import { highlightParts } from "@/utils/highlight";

const props = defineProps<{ wikiId: string; query: string }>();

const router = useRouter();
const { currentWiki } = storeToRefs(useWikiStore());

const draft = ref("");
watch(
  () => props.query,
  (query) => (draft.value = query),
  { immediate: true },
);

const results = useLiveQuery(
  async ([wikiId, query]) => {
    if (!query.trim()) return { hits: [], exact: true };
    const [hits, exact] = await Promise.all([searchService.search(wikiId, query), pageService.getByTitle(wikiId, query)]);
    return { hits, exact: exact !== undefined || titleError(query) !== undefined };
  },
  () => [props.wikiId, props.query] as const,
);

function submit() {
  void router.push({ name: "search", params: { wikiId: props.wikiId }, query: { q: draft.value.trim() } });
}

watchEffect(() => {
  const label = props.query.trim() ? `Search results for "${props.query.trim()}"` : "Search";
  document.title = [label, currentWiki.value?.name].filter(Boolean).join(" | ");
});
</script>

<template>
  <article class="content-card">
    <h1>Search</h1>
    <form class="search-form" role="search" @submit.prevent="submit">
      <input v-model="draft" type="search" aria-label="Search this wiki" placeholder="Search this wiki" />
      <button type="submit">Search</button>
    </form>

    <template v-if="results && query.trim()">
      <p v-if="!results.exact" class="create">
        There is no page titled "{{ query.trim() }}".
        <RouterLink :to="{ name: 'new-page', params: { wikiId }, query: { title: query.trim() } }">
          Create page "{{ query.trim() }}"
        </RouterLink>
      </p>
      <p class="count">
        {{ results.hits.length === 0 ? "No results" : `${results.hits.length} ${results.hits.length === 1 ? "result" : "results"}` }}
        for "{{ query.trim() }}"
      </p>
      <ol class="results">
        <li v-for="hit in results.hits" :key="hit.pageId">
          <RouterLink class="result-title" :to="{ name: 'page', params: { wikiId, title: titleParam(hit.title) } }">
            <template v-for="(part, index) in highlightParts(hit.title, query)" :key="index">
              <mark v-if="part.match">{{ part.text }}</mark>
              <template v-else>{{ part.text }}</template>
            </template>
          </RouterLink>
          <span v-if="hit.alias" class="alias">via {{ hit.alias }}</span>
          <p v-if="hit.snippet" class="snippet">
            <template v-for="(part, index) in highlightParts(hit.snippet, query)" :key="index">
              <mark v-if="part.match">{{ part.text }}</mark>
              <template v-else>{{ part.text }}</template>
            </template>
          </p>
        </li>
      </ol>
    </template>
  </article>
</template>

<style scoped>
.search-form {
  display: flex;
  gap: 0.5rem;
  max-width: 36rem;
}

.search-form input {
  flex: 1;
  min-width: 0;
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font: inherit;
}

.search-form button {
  padding: 0.45rem 1rem;
  border: 0;
  border-radius: 4px;
  background: var(--color-header);
  color: var(--color-header-text);
  font: inherit;
  cursor: pointer;
}

.create {
  margin: 1.25rem 0 0;
}

.count {
  color: var(--color-muted);
  font-size: 0.85rem;
}

.results {
  margin: 0;
  padding: 0;
  list-style: none;
}

.results li {
  padding: 0.6rem 0;
  border-bottom: 1px solid var(--color-border);
}

.result-title {
  font-size: 1.05rem;
}

.alias {
  margin-left: 0.5rem;
  color: var(--color-muted);
  font-size: 0.8rem;
}

.snippet {
  margin: 0.25rem 0 0;
  font-size: 0.9rem;
}

mark {
  background: var(--color-highlight);
  color: inherit;
}

.result-title mark {
  background: none;
  font-weight: 700;
}
</style>
