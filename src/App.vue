<script setup lang="ts">
import { computed } from "vue";
import { parseMarkdown, renderMarkdown } from "@/markdown/pipeline";

const welcome = `# Welcome

This wiki is empty. Start with a page like [[Main Character]] or a place like [[Home Town]].`;

const html = computed(() => renderMarkdown(parseMarkdown(welcome).tree, { pageExists: () => false }));
</script>

<template>
  <header class="top-bar">
    <span class="wiki-name">OC Wiki</span>
  </header>
  <main class="page" v-html="html" />
</template>

<style scoped>
.top-bar {
  background: var(--color-header);
  color: var(--color-header-text);
  padding: 0.75rem 1.5rem;
}

.wiki-name {
  font-family: var(--font-heading);
  font-size: 1.25rem;
}

.page {
  max-width: 60rem;
  margin: 1.5rem auto;
  padding: 1rem 2rem 2rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}
</style>
