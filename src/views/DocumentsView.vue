<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, ref, watchEffect } from "vue";
import AssetThumb from "@/components/forms/AssetThumb.vue";
import { useLiveQuery } from "@/composables/useLiveQuery";
import type { Asset, Card, Page } from "@/db/types";
import { titleParam } from "@/router/params";
import { assetService, cardService, pageService } from "@/services";
import { useWikiStore } from "@/stores/wiki";
import { downloadFile } from "@/utils/download";
import { relativeTime } from "@/utils/relativeTime";

const props = defineProps<{ wikiId: string }>();

const { currentWiki } = storeToRefs(useWikiStore());

const FILTERS = [
  { id: "all", label: "All" },
  { id: "cards", label: "Cards" },
  { id: "images", label: "Images" },
] as const;
const filter = ref<(typeof FILTERS)[number]["id"]>("all");

const stored = useLiveQuery(
  async (wikiId) => {
    const [pages, cards, assets] = await Promise.all([pageService.listForWiki(wikiId), cardService.listForWiki(wikiId), assetService.listForWiki(wikiId)]);
    return { pages, cards, assets };
  },
  () => props.wikiId,
);

interface CardRow {
  kind: "card";
  card: Card;
  page: Page;
}

interface ImageRow {
  kind: "image";
  asset: Asset;
  usedOn: Page[];
}

// Wiki appearance images and fonts belong to settings, so they're only listed when a page uses them too.
const rows = computed((): (CardRow | ImageRow)[] => {
  if (!stored.value) return [];
  const { pages, cards, assets } = stored.value;
  const byId = new Map(pages.map((page) => [page.id, page]));
  const appearance = new Set([
    ...Object.values(currentWiki.value?.appearance?.images ?? {}),
    ...Object.values(currentWiki.value?.appearance?.fonts ?? {}).flatMap((font) => font?.files.map((file) => file.path) ?? []),
  ]);

  const cardRows = cards
    .flatMap((card): CardRow[] => (byId.has(card.pageId) ? [{ kind: "card", card, page: byId.get(card.pageId)! }] : []))
    .sort((a, b) => a.page.title.localeCompare(b.page.title));
  const imageRows = assets.flatMap((asset): ImageRow[] => {
    const name = asset.path.slice("assets/".length);
    const usedOn = pages.filter((page) => page.body.includes(name) || cards.some((card) => card.pageId === page.id && card.avatar === asset.path));
    return !usedOn.length && appearance.has(asset.path) ? [] : [{ kind: "image", asset, usedOn }];
  });
  return [...(filter.value === "images" ? [] : cardRows), ...(filter.value === "cards" ? [] : imageRows)];
});

const error = ref("");

async function downloadCard(card: Card) {
  error.value = "";
  try {
    const { data, fileName, type } = await cardService.download(card.pageId);
    downloadFile(data, fileName, type);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
}

function downloadImage(asset: Asset) {
  downloadFile(asset.blob, asset.path.slice("assets/".length), asset.mime);
}

watchEffect(() => {
  document.title = ["Wiki Documents", currentWiki.value?.name].filter(Boolean).join(" | ");
});
</script>

<template>
  <article class="content-card">
    <h1>Wiki Documents</h1>
    <div class="filters" role="group" aria-label="Show">
      <button
        v-for="option in FILTERS"
        :key="option.id"
        type="button"
        class="filter"
        :aria-pressed="filter === option.id"
        @click="filter = option.id"
      >
        {{ option.label }}
      </button>
    </div>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>

    <p v-if="stored && rows.length === 0" class="empty">
      {{ filter === "cards" ? "No page has a character card yet." : filter === "images" ? "This wiki has no images yet." : "This wiki has no cards or images yet." }}
    </p>
    <ul v-else class="documents">
      <li v-for="row in rows" :key="row.kind === 'card' ? `card:${row.card.pageId}` : row.asset.id" class="document">
        <template v-if="row.kind === 'card'">
          <AssetThumb v-if="row.card.avatar" :wiki-id="wikiId" :path="row.card.avatar" />
          <span v-else class="placeholder">Card</span>
          <div class="info">
            <RouterLink class="name" :to="{ name: 'page-card', params: { title: titleParam(row.page.title) } }">
              {{ row.card.card.data.nickname || row.card.card.data.name }}
            </RouterLink>
            <span class="meta">
              Card ·
              <RouterLink :to="{ name: 'page', params: { title: titleParam(row.page.title) } }">{{ row.page.title }}</RouterLink>
              · {{ relativeTime(row.card.updatedAt) }}
            </span>
          </div>
          <button class="button secondary" type="button" @click="downloadCard(row.card)">Download</button>
        </template>
        <template v-else>
          <AssetThumb :wiki-id="wikiId" :path="row.asset.path" />
          <div class="info">
            <span class="name">{{ row.asset.path.slice("assets/".length) }}</span>
            <span class="meta">
              Image<template v-if="row.asset.width"> · {{ row.asset.width }}×{{ row.asset.height }}</template> ·
              <template v-if="row.usedOn.length">
                <template v-for="(page, index) in row.usedOn" :key="page.id">
                  <RouterLink :to="{ name: 'page', params: { title: titleParam(page.title) } }">{{ page.title }}</RouterLink>
                  <template v-if="index < row.usedOn.length - 1">, </template>
                </template>
              </template>
              <template v-else>not used on a page</template>
            </span>
          </div>
          <button class="button secondary" type="button" @click="downloadImage(row.asset)">Download</button>
        </template>
      </li>
    </ul>
  </article>
</template>

<style scoped>
.filters {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.filter {
  padding: 0.3rem 0.8rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}

.filter[aria-pressed="true"] {
  border-color: var(--color-header);
  background: var(--color-header);
  color: var(--color-header-text);
}

.empty,
.meta {
  color: var(--color-muted);
}

.documents {
  margin: 0;
  padding: 0;
  list-style: none;
}

.document {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--color-border);
}

.info {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.name {
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  font-size: 0.8rem;
}

.placeholder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-page);
  color: var(--color-muted);
  font-size: 0.7rem;
}
</style>
