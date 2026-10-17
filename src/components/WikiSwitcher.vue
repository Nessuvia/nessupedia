<script setup lang="ts">
import { storeToRefs } from "pinia";
import { ref, useTemplateRef } from "vue";
import { useDismiss } from "@/composables/useDismiss";
import { useWikiStore } from "@/stores/wiki";

const { wikis, currentWiki } = storeToRefs(useWikiStore());
const open = ref(false);
useDismiss(open, useTemplateRef("root"));
</script>

<template>
  <div ref="root" class="wiki-switcher">
    <button class="current" type="button" :aria-expanded="open" aria-controls="wiki-list" @click="open = !open">
      {{ currentWiki?.name ?? "OC Wiki" }}
      <span class="caret" aria-hidden="true">▾</span>
    </button>
    <nav v-if="open" id="wiki-list" class="menu" aria-label="Wikis">
      <ul>
        <li v-for="wiki in wikis" :key="wiki.id">
          <RouterLink
            :to="{ name: 'wiki', params: { wikiId: wiki.id } }"
            :aria-current="wiki.id === currentWiki?.id ? 'true' : undefined"
          >
            {{ wiki.name }}
          </RouterLink>
        </li>
      </ul>
      <RouterLink class="create" :to="{ name: 'new-wiki' }">+ Create wiki</RouterLink>
    </nav>
  </div>
</template>

<style scoped>
.wiki-switcher {
  position: relative;
}

.current {
  padding: 0.2rem 0.5rem;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.current:hover {
  background: var(--color-header-hover);
}

.caret {
  font-size: 0.75rem;
  opacity: 0.8;
}

.menu {
  position: absolute;
  top: calc(100% + 0.25rem);
  left: 0;
  z-index: 10;
  min-width: 14rem;
  padding: 0.25rem 0;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-surface);
  box-shadow: 0 4px 12px rgb(0 0 0 / 15%);
}

.menu ul {
  margin: 0;
  padding: 0;
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

.menu a[aria-current] {
  font-weight: 600;
}

.menu .create {
  border-top: 1px solid var(--color-border);
  color: var(--color-link);
}
</style>
