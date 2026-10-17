<script setup lang="ts">
import WikiSwitcher from "./WikiSwitcher.vue";
</script>

<template>
  <header class="global-bar">
    <RouterLink class="brand" :to="{ name: 'home' }">OC Wiki</RouterLink>
    <WikiSwitcher />
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
}

.brand:hover {
  text-decoration: none;
}
</style>
