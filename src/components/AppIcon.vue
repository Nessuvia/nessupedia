<script setup lang="ts">
const PATHS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  pages: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  history: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM12 7v5l3 3",
  add: "M12 5v14M5 12h14",
  documents: "M4 6h6l2 2h8v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  settings: "M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  chevron: "M15 6l-6 6 6 6",
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
