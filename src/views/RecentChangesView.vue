<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, watchEffect } from "vue";
import { useRoute, useRouter, type LocationQueryRaw } from "vue-router";
import ChangeList from "@/components/ChangeList.vue";
import { useLiveQuery } from "@/composables/useLiveQuery";
import type { ChangeEntry } from "@/db/types";
import { changeLog, pageService } from "@/services";
import { useWikiStore } from "@/stores/wiki";

const props = defineProps<{ wikiId: string }>();

const route = useRoute();
const router = useRouter();
const { currentWiki } = storeToRefs(useWikiStore());

// Filters live in the URL, so the back button and shared links keep them.
const queryText = (key: string) => (typeof route.query[key] === "string" ? (route.query[key] as string) : "");
const page = computed(() => queryText("page"));
const author = computed(() => (["human", "llm"].includes(queryText("author")) ? (queryText("author") as ChangeEntry["author"]) : undefined));
const includeMinor = computed(() => queryText("minor") === "1");
const filtered = computed(() => !!(page.value.trim() || author.value || includeMinor.value));

function setFilter(changes: LocationQueryRaw) {
  const query = { ...route.query, ...changes };
  for (const [key, value] of Object.entries(query)) if (value === "" || value === undefined || value === null) delete query[key];
  void router.replace({ query });
}

const entries = useLiveQuery(
  ([wikiId, filter]) => changeLog.list(wikiId, { ...filter, limit: 200 }),
  () => [props.wikiId, { page: page.value, author: author.value, includeMinor: includeMinor.value }] as const,
);
const pageTitles = useLiveQuery(async (wikiId) => (await pageService.listForWiki(wikiId)).map(({ title }) => title), () => props.wikiId);

watchEffect(() => {
  document.title = ["Recent changes", currentWiki.value?.name].filter(Boolean).join(" | ");
});
</script>

<template>
  <article class="content-card">
    <h1>Recent changes</h1>
    <form class="filters" role="search" aria-label="Filter changes" @submit.prevent>
      <label class="filter">
        Page
        <input
          class="text-input"
          type="search"
          list="change-pages"
          placeholder="Any page"
          :value="page"
          @input="setFilter({ page: ($event.target as HTMLInputElement).value })"
        />
      </label>
      <datalist id="change-pages">
        <option v-for="title in pageTitles" :key="title" :value="title" />
      </datalist>
      <label class="filter">
        By
        <select class="text-input" :value="author ?? ''" @change="setFilter({ author: ($event.target as HTMLSelectElement).value })">
          <option value="">Anyone</option>
          <option value="human">You</option>
          <option value="llm">Assistant</option>
        </select>
      </label>
      <label class="check">
        <input type="checkbox" :checked="includeMinor" @change="setFilter({ minor: ($event.target as HTMLInputElement).checked ? '1' : '' })" />
        Show minor edits
      </label>
      <button v-if="filtered" class="link-button" type="button" @click="setFilter({ page: '', author: '', minor: '' })">Clear</button>
    </form>
    <ChangeList v-if="entries?.length" :wiki-id="wikiId" :entries="entries" detailed />
    <p v-else-if="entries" class="empty">{{ filtered ? "No changes match these filters." : "No changes yet." }}</p>
  </article>
</template>

<style scoped>
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1.25rem;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--color-border);
}

.filter {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 600;
}

.filter .text-input {
  width: auto;
  font-weight: normal;
}

.filter input {
  min-width: 12rem;
}

.check {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.link-button {
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-link);
  font: inherit;
  cursor: pointer;
}

.empty {
  color: var(--color-muted);
}
</style>
