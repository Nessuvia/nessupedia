<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useWikiStore } from "@/stores/wiki";
import SearchBox from "./SearchBox.vue";
import WikiSwitcher from "./WikiSwitcher.vue";

const { currentWiki } = storeToRefs(useWikiStore());
</script>

<template>
  <header class="global-bar">
    <RouterLink class="brand" :to="{ name: 'home' }">OC Wiki</RouterLink>
    <WikiSwitcher />
    <SearchBox v-if="currentWiki" :wiki-id="currentWiki.id" />
  </header>
</template>

<style scoped>
.global-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  height: var(--global-bar-height);
  padding: 0 1rem;
  background: var(--color-header);
  color: var(--color-header-text);
  font-size: 0.9rem;
}

.brand {
  color: inherit;
  font-family: var(--font-heading);
  font-size: 1.1rem;
  white-space: nowrap;
}

.brand:hover {
  text-decoration: none;
}

@media (max-width: 48rem) {
  .global-bar {
    gap: 0.5rem;
    padding: 0 0.5rem;
  }

  .brand {
    display: none;
  }
}
</style>
