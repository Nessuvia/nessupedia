<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useDismiss } from "@/composables/useDismiss";
import { titleParam } from "@/router/params";
import { searchService } from "@/services";
import type { SearchHit } from "@/services/SearchService";
import { highlightParts } from "@/utils/highlight";

const props = defineProps<{ wikiId: string }>();

const route = useRoute();
const router = useRouter();

const query = ref("");
const hits = ref<SearchHit[]>([]);
const open = ref(false);
const active = ref(-1);
useDismiss(open, useTemplateRef("root"));

let latest = 0;
watch([query, () => props.wikiId], async ([text, wikiId]) => {
  const request = ++latest;
  const found = text.trim() ? await searchService.suggest(wikiId, text) : [];
  if (request !== latest) return;
  hits.value = found;
  active.value = -1;
});

watch(
  () => route.fullPath,
  () => {
    if (route.name !== "search") query.value = "";
  },
);

const showList = computed(() => open.value && hits.value.length > 0);
const optionId = (index: number) => `search-option-${index}`;

// Arrow keys cycle through the suggestions and back to the typed text (-1).
function move(step: number) {
  if (hits.value.length === 0) return;
  open.value = true;
  const states = hits.value.length + 1;
  active.value = ((((active.value + 1 + step) % states) + states) % states) - 1;
}

function openHit(hit: SearchHit) {
  open.value = false;
  void router.push({ name: "page", params: { wikiId: props.wikiId, title: titleParam(hit.title) } });
}

function submit() {
  const hit = hits.value[active.value];
  if (showList.value && hit) return openHit(hit);
  const text = query.value.trim();
  if (!text) return;
  open.value = false;
  void router.push({ name: "search", params: { wikiId: props.wikiId }, query: { q: text } });
}
</script>

<template>
  <form ref="root" class="search-box" role="search" @submit.prevent="submit">
    <input
      v-model="query"
      type="search"
      role="combobox"
      placeholder="Search"
      aria-label="Search this wiki"
      aria-autocomplete="list"
      aria-controls="search-suggestions"
      :aria-expanded="showList"
      :aria-activedescendant="showList && active >= 0 ? optionId(active) : undefined"
      autocomplete="off"
      @focus="open = true"
      @input="open = true"
      @keydown.down.prevent="move(1)"
      @keydown.up.prevent="move(-1)"
    />
    <ul v-show="showList" id="search-suggestions" role="listbox" aria-label="Suggestions">
      <li
        v-for="(hit, index) in hits"
        :id="optionId(index)"
        :key="hit.pageId"
        role="option"
        :aria-selected="index === active"
        @pointerdown.prevent="openHit(hit)"
        @pointermove="active = index"
      >
        <span class="title">
          <template v-for="(part, partIndex) in highlightParts(hit.title, query)" :key="partIndex">
            <mark v-if="part.match">{{ part.text }}</mark>
            <template v-else>{{ part.text }}</template>
          </template>
        </span>
        <span v-if="hit.alias" class="alias">via {{ hit.alias }}</span>
      </li>
    </ul>
  </form>
</template>

<style scoped>
.search-box {
  position: relative;
  flex: 0 1 22rem;
  min-width: 0;
  margin-left: auto;
}

input {
  width: 100%;
  padding: 0.35rem 0.75rem;
  border: 1px solid transparent;
  border-radius: 4px;
  background: var(--color-header-hover);
  color: inherit;
  font: inherit;
}

input::placeholder {
  color: inherit;
  opacity: 0.75;
}

input:focus {
  border-color: var(--color-header-text);
  outline: none;
}

ul {
  position: absolute;
  top: calc(100% + 0.25rem);
  right: 0;
  left: 0;
  z-index: 10;
  margin: 0;
  padding: 0.25rem 0;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-surface);
  box-shadow: 0 4px 12px rgb(0 0 0 / 15%);
  color: var(--color-text);
  list-style: none;
}

li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.4rem 0.75rem;
  cursor: pointer;
}

li[aria-selected="true"] {
  background: var(--color-page);
}

mark {
  background: none;
  color: inherit;
  font-weight: 700;
}

.alias {
  color: var(--color-muted);
  font-size: 0.8rem;
  white-space: nowrap;
}
</style>
