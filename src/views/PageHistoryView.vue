<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, nextTick, ref, watch, watchEffect } from "vue";
import { useRoute, useRouter } from "vue-router";
import DiffView from "@/components/DiffView.vue";
import { useLiveQuery } from "@/composables/useLiveQuery";
import type { ChangeEntry } from "@/db/types";
import { titleParam } from "@/router/params";
import { cardSource } from "@/cards/cardFile";
import { cardService, changeLog, pageService } from "@/services";
import { rebuildVersions, sourceBefore } from "@/services/ChangeLog";
import { useWikiStore } from "@/stores/wiki";
import { diffRows, diffStats } from "@/utils/diffRows";
import { relativeTime } from "@/utils/relativeTime";

const props = defineProps<{ wikiId: string; title: string }>();

const KIND_LABELS: Record<ChangeEntry["kind"], string> = {
  create: "Created",
  edit: "Edited",
  rename: "Renamed",
  delete: "Deleted",
  restore: "Restored",
};

const route = useRoute();
const router = useRouter();
const { currentWiki } = storeToRefs(useWikiStore());

// A title with no page may belong to a deleted one, whose history stays until a new page takes the title.
const history = useLiveQuery(
  async ([wikiId, title]) => {
    const page = await pageService.getByTitle(wikiId, title);
    const deletion = page ? undefined : await changeLog.deletedPage(wikiId, title);
    const pageId = page?.id ?? deletion?.pageId;
    if (!pageId) return { page, deletion, pageId, entries: [], cardEntries: [] };
    const card = await cardService.get(pageId);
    return {
      page,
      deletion,
      pageId,
      entries: await changeLog.listForPage(pageId),
      cardEntries: await changeLog.listForPage(pageId, "card"),
      card: card && cardSource(card.card, card.avatar),
    };
  },
  () => [props.wikiId, props.title] as const,
);
const page = computed(() => history.value?.page);
const entries = computed(() => history.value?.entries);
const shownTitle = computed(() => page.value?.title ?? history.value?.deletion?.pageTitle ?? props.title);

// The page's text and its card each have their own chain of diffs, shown together newest first.
function chain(list: ChangeEntry[], current: string) {
  const versions = rebuildVersions(list, current);
  // A deletion holds the final source. It only needs its own button once pruning has removed the entry before it.
  return list.map((entry, index) => {
    const previous = list[index + 1];
    const version =
      entry.kind !== "delete"
        ? versions.get(entry.id!)
        : index === 0 && !(previous && versions.has(previous.id!))
          ? sourceBefore(entry, "")
          : undefined;
    const rows = diffRows(entry.diff);
    return { entry, rows, stats: diffStats(rows), version: version !== current ? version : undefined };
  });
}

const shown = computed(() => {
  if (!history.value) return undefined;
  return [...chain(history.value.entries, page.value?.body ?? ""), ...chain(history.value.cardEntries, history.value.card ?? "")].sort(
    (a, b) => b.entry.id! - a.entry.id!,
  );
});

const restoring = ref<number>();
const restoreError = ref("");

async function restore(entry: ChangeEntry, version: string) {
  restoring.value = entry.id;
  restoreError.value = "";
  try {
    const when = new Date(entry.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    if (entry.subject === "card") {
      await cardService.restore(history.value!.pageId!, version, entry.kind === "delete" ? "Restored the card as it was when removed" : `Restored the card from ${when}`);
      return;
    }
    const summary = entry.kind === "delete" ? "Restored the page as it was when deleted" : `Restored the version from ${when}`;
    const restored = await pageService.restore(history.value!.pageId!, version, { summary });
    await router.push({ name: "page", params: { title: titleParam(restored.title) } });
  } catch (cause) {
    restoreError.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    restoring.value = undefined;
  }
}

// A link from the feed opens its entry; otherwise the newest one starts open.
const openId = computed(() => {
  const match = /^#change-(\d+)$/.exec(route.hash);
  return match ? Number(match[1]) : shown.value?.[0]?.entry.id;
});

watch([entries, () => route.hash], async () => {
  if (!entries.value || !route.hash) return;
  await nextTick();
  document.getElementById(route.hash.slice(1))?.scrollIntoView({ block: "start" });
});

watchEffect(() => {
  document.title = [`History of ${shownTitle.value}`, currentWiki.value?.name].filter(Boolean).join(" | ");
});
</script>

<template>
  <article class="content-card">
    <h1>{{ shownTitle }}</h1>
    <p class="page-subtitle">
      History
      <template v-if="page">
        ·
        <RouterLink :to="{ name: 'page', params: { title: titleParam(page.title) } }">Back to the page</RouterLink>
      </template>
    </p>

    <p v-if="history?.deletion" class="deleted" role="status">
      This page was deleted {{ relativeTime(history.deletion.at) }}. Restore any earlier version to bring it back.
    </p>
    <p v-if="restoreError" class="form-error" role="alert">{{ restoreError }}</p>

    <p v-if="history && !history.pageId" class="empty">There's no page titled {{ title }}, and none was deleted under that title.</p>
    <ol v-else-if="shown" class="history">
      <li v-for="{ entry, rows, stats, version } in shown" :id="`change-${entry.id}`" :key="entry.id">
        <details :open="entry.id === openId">
          <summary>
            <span class="what">
              {{ KIND_LABELS[entry.kind] }}<template v-if="entry.author === 'llm'"> by Assistant</template>
            </span>
            <span v-if="entry.subject === 'card'" class="minor">card</span>
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
            <button
              v-if="version !== undefined"
              class="button secondary restore"
              type="button"
              :disabled="restoring !== undefined"
              @click="restore(entry, version)"
            >
              {{
                restoring === entry.id
                  ? "Restoring…"
                  : entry.subject === "card"
                    ? entry.kind === "delete" ? "Restore the card as it was when removed" : "Restore this card"
                    : entry.kind === "delete" ? "Restore as it was when deleted" : "Restore this version"
              }}
            </button>
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

.restore {
  margin-top: 0.6rem;
}

.deleted {
  padding: 0.6rem 0.8rem;
  border-left: 4px solid var(--color-danger);
  background: var(--color-page);
}

.change:empty {
  display: none;
}
</style>
