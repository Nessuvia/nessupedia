<script setup lang="ts">
import { ref, useTemplateRef } from "vue";
import { useDismiss } from "@/composables/useDismiss";
import { useLiveQuery } from "@/composables/useLiveQuery";
import type { Wiki } from "@/db/types";
import { pageService } from "@/services";
import { MAIN_PAGE_TITLE } from "@/stores/wiki";

const props = defineProps<{ wiki: Wiki }>();

const pageCount = useLiveQuery((wikiId) => pageService.countForWiki(wikiId), () => props.wiki.id);
const exploreOpen = ref(false);
useDismiss(exploreOpen, useTemplateRef("explore"));
</script>

<template>
  <div class="wiki-header">
    <div class="identity">
      <RouterLink class="wiki-name" :to="{ name: 'page', params: { wikiId: wiki.id, title: MAIN_PAGE_TITLE } }">
        {{ wiki.name }}
      </RouterLink>
      <nav aria-label="Wiki navigation">
        <div ref="explore" class="explore">
          <button type="button" :aria-expanded="exploreOpen" aria-controls="explore-menu" @click="exploreOpen = !exploreOpen">
            Explore <span class="caret" aria-hidden="true">▾</span>
          </button>
          <ul v-if="exploreOpen" id="explore-menu" class="menu">
            <li>
              <RouterLink :to="{ name: 'page', params: { wikiId: wiki.id, title: MAIN_PAGE_TITLE } }">Main Page</RouterLink>
            </li>
            <li><RouterLink :to="{ name: 'all-pages', params: { wikiId: wiki.id } }">All pages</RouterLink></li>
            <li><RouterLink :to="{ name: 'categories', params: { wikiId: wiki.id } }">Categories</RouterLink></li>
            <li><RouterLink :to="{ name: 'recent-changes', params: { wikiId: wiki.id } }">Recent changes</RouterLink></li>
            <li><RouterLink :to="{ name: 'new-page', params: { wikiId: wiki.id } }">New page</RouterLink></li>
            <li><RouterLink :to="{ name: 'wiki-settings', params: { wikiId: wiki.id } }">Wiki settings</RouterLink></li>
          </ul>
        </div>
      </nav>
    </div>
    <RouterLink v-if="pageCount !== undefined" class="page-count" :to="{ name: 'all-pages', params: { wikiId: wiki.id } }">
      <strong>{{ pageCount.toLocaleString() }}</strong> {{ pageCount === 1 ? "page" : "pages" }}
    </RouterLink>
  </div>
</template>

<style scoped>
.wiki-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.identity {
  min-width: 0;
}

.wiki-name {
  display: block;
  color: var(--color-text);
  font-family: var(--font-heading);
  font-size: 2rem;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.wiki-name:hover {
  text-decoration: none;
}

.explore {
  position: relative;
}

.explore button {
  padding: 0.2rem 0;
  border: 0;
  background: none;
  color: var(--color-link);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  cursor: pointer;
}

.caret {
  font-size: 0.7rem;
}

.menu {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 10;
  min-width: 12rem;
  margin: 0;
  padding: 0.25rem 0;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-surface);
  box-shadow: 0 4px 12px rgb(0 0 0 / 15%);
  list-style: none;
}

.menu a {
  display: block;
  padding: 0.4rem 0.9rem;
  color: var(--color-text);
}

.menu a:hover {
  background: var(--color-page);
  text-decoration: none;
}

.page-count {
  flex-shrink: 0;
  color: var(--color-muted);
  font-size: 0.8rem;
  text-transform: uppercase;
}

.page-count strong {
  color: var(--color-text);
  font-size: 1.1rem;
}
</style>
