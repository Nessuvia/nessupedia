<script setup lang="ts">
import { ref, useTemplateRef } from "vue";
import { useColorMode } from "@/composables/useColorMode";
import { useDismiss } from "@/composables/useDismiss";
import { useLiveQuery } from "@/composables/useLiveQuery";
import type { Wiki } from "@/db/types";
import { pageService } from "@/services";
import { titleParam } from "@/router/params";
import { MAIN_PAGE_TITLE } from "@/stores/wiki";
import AppIcon from "./AppIcon.vue";

const props = defineProps<{ wiki: Wiki }>();

const pageCount = useLiveQuery((wikiId) => pageService.countForWiki(wikiId), () => props.wiki.id);
const exploreOpen = ref(false);
useDismiss(exploreOpen, useTemplateRef("explore"));
const { mode, toggle } = useColorMode();
</script>

<template>
  <div class="wiki-header">
    <div class="identity">
      <RouterLink class="wiki-name" :to="{ name: 'page', params: { wikiId: wiki.id, title: titleParam(MAIN_PAGE_TITLE) } }">
        {{ wiki.name }}
      </RouterLink>
      <nav aria-label="Wiki navigation">
        <div ref="explore" class="explore">
          <button type="button" :aria-expanded="exploreOpen" aria-controls="explore-menu" @click="exploreOpen = !exploreOpen">
            Explore <span class="caret" aria-hidden="true">▾</span>
          </button>
          <ul v-if="exploreOpen" id="explore-menu" class="menu">
            <li>
              <RouterLink :to="{ name: 'page', params: { wikiId: wiki.id, title: titleParam(MAIN_PAGE_TITLE) } }">Main Page</RouterLink>
            </li>
            <li><RouterLink :to="{ name: 'all-pages', params: { wikiId: wiki.id } }">All pages</RouterLink></li>
            <li><RouterLink :to="{ name: 'categories', params: { wikiId: wiki.id } }">Categories</RouterLink></li>
            <li><RouterLink :to="{ name: 'recent-changes', params: { wikiId: wiki.id } }">Recent changes</RouterLink></li>
            <li><RouterLink :to="{ name: 'templates', params: { wikiId: wiki.id } }">Templates</RouterLink></li>
            <li><RouterLink :to="{ name: 'new-page', params: { wikiId: wiki.id } }">New page</RouterLink></li>
            <li><RouterLink :to="{ name: 'wiki-settings', params: { wikiId: wiki.id } }">Wiki settings</RouterLink></li>
          </ul>
        </div>
      </nav>
    </div>
    <div class="tools">
      <RouterLink v-if="pageCount !== undefined" class="page-count" :to="{ name: 'all-pages', params: { wikiId: wiki.id } }">
        <strong>{{ pageCount.toLocaleString() }}</strong> {{ pageCount === 1 ? "page" : "pages" }}
      </RouterLink>
      <button
        type="button"
        class="mode-toggle"
        :aria-label="mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
        :title="mode === 'dark' ? 'Light mode' : 'Dark mode'"
        @click="toggle"
      >
        <AppIcon :name="mode === 'dark' ? 'sun' : 'moon'" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.wiki-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  min-height: 9rem;
  padding: 2rem 2rem 0.75rem;
  border-radius: var(--radius) var(--radius) 0 0;
  background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #000000));
  color: var(--accent-text);
}

.identity {
  min-width: 0;
}

.wiki-name {
  display: block;
  color: inherit;
  font-family: var(--font-heading);
  font-size: 2rem;
  font-weight: 600;
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
  color: inherit;
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

.tools {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.75rem;
}

.page-count {
  color: inherit;
  font-size: 0.8rem;
  text-transform: uppercase;
}

.page-count strong {
  font-size: 1.1rem;
}

.mode-toggle {
  display: flex;
  padding: 0.3rem;
  border: 1px solid currentcolor;
  border-radius: 6px;
  background: none;
  color: inherit;
  cursor: pointer;
}

.mode-toggle .icon {
  width: 1.1rem;
  height: 1.1rem;
}

@media (max-width: 48rem) {
  .wiki-header {
    min-height: 6rem;
    padding: 1.25rem 1rem 0.5rem;
  }

  .wiki-name {
    font-size: 1.5rem;
  }
}
</style>
