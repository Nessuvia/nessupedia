<script setup lang="ts">
import { useStoredRef } from "@/composables/useStoredRef";
import type { TocEntry } from "@/markdown/toc";

defineProps<{ entries: TocEntry[] }>();

const hidden = useStoredRef("oc-wiki:toc-hidden", false);
</script>

<template>
  <nav class="toc" aria-labelledby="toc-heading">
    <div class="toc-header">
      <h2 id="toc-heading">Contents</h2>
      <button type="button" :aria-expanded="!hidden" aria-controls="toc-list" @click="hidden = !hidden">
        [{{ hidden ? "show" : "hide" }}]
      </button>
    </div>
    <ol v-show="!hidden" id="toc-list">
      <li v-for="entry in entries" :key="entry.id" :style="{ paddingLeft: `${entry.level * 1.25}rem` }">
        <a :href="`#${entry.id}`">
          <span class="number">{{ entry.number }}</span>
          {{ entry.text }}
        </a>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.toc {
  display: inline-block;
  min-width: 14rem;
  max-width: 100%;
  margin: 0.5rem 0 1rem;
  padding: 0.6rem 1rem 0.75rem;
  border: 1px solid var(--color-border);
  background: var(--color-page);
  font-size: 0.9rem;
}

.toc-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}

.toc h2 {
  margin: 0;
  border: 0;
  font-family: var(--font-body);
  font-size: 0.95rem;
  font-weight: 700;
}

.toc button {
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-link);
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}

ol {
  margin: 0.5rem 0 0;
  padding: 0;
  list-style: none;
}

li {
  padding-top: 0.2rem;
}

a {
  color: var(--color-text);
}

.number {
  margin-right: 0.35rem;
  color: var(--color-muted);
}
</style>
