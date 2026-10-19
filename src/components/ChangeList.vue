<script setup lang="ts">
import { computed } from "vue";
import { useLiveQuery } from "@/composables/useLiveQuery";
import type { ChangeEntry } from "@/db/types";
import { titleParam } from "@/router/params";
import { pageService } from "@/services";
import { relativeTime } from "@/utils/relativeTime";

const props = defineProps<{ wikiId: string; entries: ChangeEntry[]; detailed?: boolean }>();

const KIND_LABELS: Record<ChangeEntry["kind"], string> = {
  create: "created",
  edit: "edited",
  rename: "renamed",
  delete: "deleted",
  restore: "restored",
};

const SUMMARIZED = new Set<ChangeEntry["kind"]>(["edit", "rename", "restore"]);
const DIFFED = new Set<ChangeEntry["kind"]>(["create", "edit", "restore"]);

const pages = useLiveQuery((wikiId) => pageService.listForWiki(wikiId), () => props.wikiId);
const titlesById = computed(() => new Map(pages.value?.map((page) => [page.id, page.title])));
</script>

<template>
  <ul class="change-list" :class="{ detailed }">
    <li v-for="entry in entries" :key="entry.id">
      <RouterLink
        v-if="titlesById.has(entry.pageId)"
        class="title"
        :to="{ name: 'page', params: { title: titleParam(titlesById.get(entry.pageId)!) } }"
      >
        {{ entry.pageTitle }}
      </RouterLink>
      <span v-else class="title gone">{{ entry.pageTitle }}</span>
      <span class="meta">
        {{ KIND_LABELS[entry.kind] }}
        <template v-if="entry.author === 'llm'">by Assistant</template>
        <template v-if="detailed && entry.minor">(minor)</template>
        · <time :datetime="new Date(entry.at).toISOString()">{{ relativeTime(entry.at) }}</time>
        <template v-if="detailed && DIFFED.has(entry.kind) && titlesById.has(entry.pageId)">
          ·
          <RouterLink
            :to="{
              name: 'page-history',
              params: { title: titleParam(titlesById.get(entry.pageId)!) },
              hash: `#change-${entry.id}`,
            }"
          >
            View changes
          </RouterLink>
        </template>
        <template v-else-if="detailed && entry.kind === 'delete' && !titlesById.has(entry.pageId)">
          ·
          <RouterLink :to="{ name: 'page-history', params: { title: titleParam(entry.pageTitle) } }">History</RouterLink>
        </template>
      </span>
      <span v-if="detailed && entry.summary && SUMMARIZED.has(entry.kind)" class="summary">{{ entry.summary }}</span>
    </li>
  </ul>
</template>

<style scoped>
.change-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

li {
  display: flex;
  flex-direction: column;
}

li + li {
  margin-top: 0.5rem;
}

.detailed li {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 0.75rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--color-border);
}

.detailed li + li {
  margin-top: 0;
}

.meta {
  color: var(--color-muted);
  font-size: 0.8rem;
}

.summary {
  flex-basis: 100%;
  font-size: 0.9rem;
}

.gone {
  color: var(--color-muted);
  text-decoration: line-through;
}
</style>
