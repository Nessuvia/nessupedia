<script setup lang="ts">
import WikiSwitcher from "./WikiSwitcher.vue";

const sidebarOpen = defineModel<boolean>("sidebarOpen", { required: true });
</script>

<template>
  <header class="top-bar">
    <button
      class="sidebar-toggle"
      type="button"
      :aria-expanded="sidebarOpen"
      aria-controls="site-sidebar"
      :aria-label="sidebarOpen ? 'Hide sidebar' : 'Show sidebar'"
      @click="sidebarOpen = !sidebarOpen"
    >
      ☰
    </button>
    <WikiSwitcher />
  </header>
</template>

<style scoped>
.top-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
  background: var(--color-header);
  color: var(--color-header-text);
}

.sidebar-toggle {
  padding: 0.25rem 0.5rem;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-size: 1.25rem;
  cursor: pointer;
}

.sidebar-toggle:hover {
  background: var(--color-header-hover);
}
</style>
