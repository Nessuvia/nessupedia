<script setup lang="ts">
const PATHS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  pages: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  history: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM12 7v5l3 3",
} as const;

export type IconName = keyof typeof PATHS;

defineProps<{ name: IconName }>();
</script>

<template>
  <svg
    class="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="PATHS[name]" />
  </svg>
</template>

<style scoped>
.icon {
  width: 1.4rem;
  height: 1.4rem;
}
</style>
