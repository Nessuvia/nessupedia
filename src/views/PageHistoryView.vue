<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, nextTick, watch, watchEffect } from "vue";
import { useRoute } from "vue-router";
import DiffView from "@/components/DiffView.vue";
import { useLiveQuery } from "@/composables/useLiveQuery";
import type { ChangeEntry } from "@/db/types";
import { titleParam } from "@/router/params";
import { changeLog, pageService } from "@/services";
import { useWikiStore } from "@/stores/wiki";
import { diffRows, diffStats } from "@/utils/diffRows";
import { relativeTime } from "@/utils/relativeTime";

const props = defineProps<{ wikiId: string; title: string }>();

const KIND_LABELS: Record<ChangeEntry["kind"], string> = {
  create: "Created",
  edit: "Edited",
  rename: "Renamed",
  delete: "Deleted",
};

const route = useRoute();
const { currentWiki } = storeToRefs(useWikiStore());

const page = useLiveQuery(
  async ([wikiId, title]) => (await pageService.getByTitle(wikiId, title)) ?? null,
  () => [props.wikiId, props.title] as const,
);
const entries = useLiveQuery((pageId) => (pageId ? changeLog.listForPage(pageId) : []), () => page.value?.id);

const shown = computed(() =>
  entries.value?.map((entry) => {
    const rows = diffRows(entry.diff);
    return { entry, rows, stats: diffStats(rows) };
  }),
);

// A link from the feed opens its entry; otherwise the newest one starts open.
const openId = computed(() => {
  const match = /^#change-(\d+)$/.exec(route.hash);
  return match ? Number(match[1]) : entries.value?.[0]?.id;
});

watch([entries, () => route.hash], async () => {
  if (!entries.value || !route.hash) return;
  await nextTick();
  document.getElementById(route.hash.slice(1))?.scrollIntoView({ block: "start" });
});

watchEffect(() => {
  document.title = [`History of ${page.value?.title ?? props.title}`, currentWiki.value?.name].filter(Boolean).join(" | ");
});
</script>

<template>
  <article class="content-card">
    <h1>{{ page?.title ?? title }}</h1>
    <p class="page-subtitle">
      History
      <template v-if="page">
        ·
        <RouterLink :to="{ name: 'page', params: { wikiId, title: titleParam(page.title) } }">Back to the page</RouterLink>
      </template>
    </p>

    <p v-if="page === null" class="empty">There's no page titled {{ title }}.</p>
    <ol v-else-if="shown" class="history">
      <li v-for="{ entry, rows, stats } in shown" :id="`change-${entry.id}`" :key="entry.id">
        <details :open="entry.id === openId">
          <summary>
            <span class="what">
              {{ KIND_LABELS[entry.kind] }}<template v-if="entry.author === 'llm'"> by Assistant</template>
            </span>
            <time :datetime="new Date(entry.at).toISOString()" :title="new Date(entry.at).toLocaleString()">
              {{ relativeTime(entry.at) }}
            </time>
            <span v-if="entry.minor" class="minor">minor</span>
            <span v-if="stats.added || stats.removed" class="stats">
              <span class="added">+{{ stats.added }}</span>
              <span class="removed">−{{ stats.removed }}</span>
            </span>
            <span v-if="entry.summary" class="summary">{{ entry.summary }}</span>
          </summary>
          <div class="change">
            <DiffView v-if="entry.kind !== 'rename'" :diff="entry.diff" :rows="rows" />
          </div>
        </details>
      </li>
    </ol>
  </article>
</template>

<style scoped>
.page-subtitle {
  margin: -0.5rem 0 1.5rem;
  color: var(--color-muted);
}

.empty {
  color: var(--color-muted);
}

.history {
  margin: 0;
  padding: 0;
  list-style: none;
}

.history li {
  border-bottom: 1px solid var(--color-border);
}

summary {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 0.75rem;
  padding: 0.6rem 0;
  cursor: pointer;
}

.what {
  font-weight: 600;
}

time,
.minor {
  color: var(--color-muted);
  font-size: 0.85rem;
}

.minor {
  padding: 0 0.35rem;
  border: 1px solid var(--color-border);
  border-radius: 3px;
}

.stats {
  display: inline-flex;
  gap: 0.4rem;
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}

.stats .added {
  color: var(--color-success);
}

.stats .removed {
  color: var(--color-danger);
}

.summary {
  flex-basis: 100%;
  font-size: 0.9rem;
}

.change {
  padding-bottom: 0.75rem;
}

.change:empty {
  display: none;
}
</style>
