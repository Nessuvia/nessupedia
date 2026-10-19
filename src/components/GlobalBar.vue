<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useLiveQuery } from "@/composables/useLiveQuery";
import { reviewService } from "@/services";
import { useRunsStore } from "@/stores/runs";
import { useWikiStore } from "@/stores/wiki";
import SearchBox from "./SearchBox.vue";
import WikiSwitcher from "./WikiSwitcher.vue";

const { currentWiki } = storeToRefs(useWikiStore());
const { panelOpen } = storeToRefs(useRunsStore());
const recent = useLiveQuery(async (wikiId) => (wikiId ? reviewService.list(wikiId) : []), () => currentWiki.value?.id ?? "");
const running = computed(() => recent.value?.some((run) => run.status === "running") ?? false);
const version = __APP_VERSION__;
</script>

<template>
  <header class="global-bar">
    <RouterLink class="brand" :to="{ name: 'home' }">OC Wiki</RouterLink>
    <WikiSwitcher />
    <SearchBox v-if="currentWiki" :wiki-id="currentWiki.id" />
    <span class="version">Last updated: {{ version }}</span>
    <button v-if="currentWiki" class="assistant-toggle" type="button" :aria-pressed="panelOpen" @click="panelOpen = !panelOpen">
      Assistant
      <span v-if="running" class="running-dot" aria-label="(running)" />
    </button>
  </header>
</template>

<style scoped>
.global-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  height: var(--global-bar-height);
  padding: 0 1rem;
  --color-header-text: #ffffff;
  background: var(--color-bar);
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

.version {
  margin-left: auto;
  opacity: 0.7;
  font-size: 0.75rem;
  white-space: nowrap;
}

.assistant-toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.75rem;
  border: 1px solid currentcolor;
  border-radius: 4px;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.assistant-toggle[aria-pressed="true"] {
  background: rgb(255 255 255 / 15%);
}

.running-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: #6ee7a8;
}

@media (max-width: 48rem) {
  .global-bar {
    gap: 0.5rem;
    padding: 0 0.5rem;
  }

  .brand,
  .version {
    display: none;
  }

  .assistant-toggle {
    margin-left: auto;
  }
}
</style>
