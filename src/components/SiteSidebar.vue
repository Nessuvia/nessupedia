<script setup lang="ts">
import { computed } from "vue";
import { useLiveQuery } from "@/composables/useLiveQuery";
import type { ChangeEntry } from "@/db/types";
import { changeLog, pageService } from "@/services";
import { relativeTime } from "@/utils/relativeTime";

const props = defineProps<{ wikiId: string }>();

const RECENT_LIMIT = 8;
const KIND_LABELS: Record<ChangeEntry["kind"], string> = {
  create: "created",
  edit: "edited",
  rename: "renamed",
  delete: "deleted",
};

const pages = useLiveQuery((wikiId) => pageService.listForWiki(wikiId), () => props.wikiId);
const recent = useLiveQuery((wikiId) => changeLog.list(wikiId, { limit: RECENT_LIMIT }), () => props.wikiId);
const titlesById = computed(() => new Map(pages.value?.map((page) => [page.id, page.title])));
</script>

<template>
  <aside class="sidebar">
    <section aria-labelledby="sidebar-pages">
      <h2 id="sidebar-pages">Pages</h2>
      <ul v-if="pages?.length">
        <li v-for="page in pages" :key="page.id">
          <RouterLink :to="{ name: 'page', params: { wikiId, title: page.title } }">{{ page.title }}</RouterLink>
        </li>
      </ul>
      <p v-else-if="pages" class="empty">No pages yet.</p>
    </section>

    <section aria-labelledby="sidebar-recent">
      <h2 id="sidebar-recent">Recent changes</h2>
      <ul v-if="recent?.length" class="recent">
        <li v-for="entry in recent" :key="entry.id">
          <RouterLink
            v-if="titlesById.has(entry.pageId)"
            :to="{ name: 'page', params: { wikiId, title: titlesById.get(entry.pageId) } }"
          >
            {{ entry.pageTitle }}
          </RouterLink>
          <span v-else class="gone">{{ entry.pageTitle }}</span>
          <span class="meta">
            {{ KIND_LABELS[entry.kind] }}
            <template v-if="entry.author === 'llm'">by Assistant</template>
            · <time :datetime="new Date(entry.at).toISOString()">{{ relativeTime(entry.at) }}</time>
          </span>
        </li>
      </ul>
      <p v-else-if="recent" class="empty">No changes yet.</p>
    </section>
  </aside>
</template>

<style scoped>
.sidebar {
  flex: 0 0 14rem;
  align-self: flex-start;
  font-size: 0.9rem;
}

section + section {
  margin-top: 1.5rem;
}

h2 {
  margin: 0 0 0.5rem;
  border: 0;
  font-size: 1rem;
}

ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

li + li {
  margin-top: 0.3rem;
}

a.router-link-active {
  color: var(--color-text);
  font-weight: 600;
}

.recent li {
  display: flex;
  flex-direction: column;
}

.meta,
.empty {
  color: var(--color-muted);
  font-size: 0.8rem;
}

.empty {
  margin: 0;
}

.gone {
  color: var(--color-muted);
  text-decoration: line-through;
}

.sidebar.drawer {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 30;
  align-self: stretch;
  width: min(18rem, 85vw);
  padding: 1rem 1.25rem;
  overflow-y: auto;
  background: var(--color-surface);
  box-shadow: 4px 0 16px rgb(0 0 0 / 20%);
}
</style>
