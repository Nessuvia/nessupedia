<script setup lang="ts">
import { computed } from "vue";
import type { RouteLocationRaw } from "vue-router";
import { titleParam } from "@/router/params";
import { MAIN_PAGE_TITLE } from "@/stores/wiki";
import AppIcon, { type IconName } from "./AppIcon.vue";

const props = defineProps<{ wikiId: string }>();

const items = computed((): { label: string; icon: IconName; to: RouteLocationRaw; bottom?: boolean }[] => [
  { label: "Home", icon: "home", to: { name: "page", params: { wikiId: props.wikiId, title: titleParam(MAIN_PAGE_TITLE) } } },
  { label: "All pages", icon: "pages", to: { name: "all-pages", params: { wikiId: props.wikiId } } },
  { label: "Changes", icon: "history", to: { name: "recent-changes", params: { wikiId: props.wikiId } } },
  { label: "New page", icon: "add", to: { name: "new-page", params: { wikiId: props.wikiId } } },
  { label: "Settings", icon: "settings", to: { name: "wiki-settings", params: { wikiId: props.wikiId } }, bottom: true },
]);
</script>

<template>
  <nav class="left-rail" aria-label="Wiki tools">
    <RouterLink v-for="item in items" :key="item.label" class="item" :class="{ bottom: item.bottom }" :to="item.to">
      <AppIcon :name="item.icon" />
      <span>{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.left-rail {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  height: calc(100vh - var(--global-bar-height));
  padding: 0.75rem 0;
  border-right: 1px solid var(--color-border);
  background: var(--color-surface);
}

.item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  width: calc(var(--rail-width) - 0.5rem);
  padding: 0.5rem 0;
  border-radius: 4px;
  color: var(--color-muted);
  font-size: 0.65rem;
  text-align: center;
}

.item.bottom {
  margin-top: auto;
}

.item:hover {
  background: var(--color-page);
  color: var(--color-text);
  text-decoration: none;
}

.item.router-link-active {
  color: var(--color-link);
}
</style>
