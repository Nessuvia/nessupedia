<script setup lang="ts">
import { computed } from "vue";
import { useLiveQuery } from "@/composables/useLiveQuery";
import { orderTabs, subpageName, tabTitle, topTitle } from "@/markdown/subpages";
import { titleKey } from "@/markdown/wikilinks";
import { titleParam } from "@/router/params";
import { pageService } from "@/services";

// The tab bar of the page a title sits under: Overview, then that page's direct subpages.
// It shows only once the page has a subpage.
const props = defineProps<{ wikiId: string; title: string }>();

const tabs = useLiveQuery(
  async ([wikiId, top]) => {
    const page = await pageService.getByTitle(wikiId, top);
    const subpages = orderTabs(await pageService.directSubpages(wikiId, page?.title ?? top), page?.frontmatter);
    if (subpages.length === 0) return [];
    return [
      { label: "Overview", title: page?.title ?? top, exists: !!page },
      ...subpages.map((subpage) => ({ label: subpageName(subpage.title), title: subpage.title, exists: true })),
    ];
  },
  () => [props.wikiId, topTitle(props.title)] as const,
);

const current = computed(() => titleKey(tabTitle(props.title)));
</script>

<template>
  <nav v-if="tabs?.length" class="tab-bar" aria-label="Page tabs">
    <RouterLink
      v-for="tab in tabs"
      :key="tab.title"
      class="tab"
      :class="{ selected: titleKey(tab.title) === current, new: !tab.exists }"
      :aria-current="titleKey(tab.title) === current ? 'page' : undefined"
      :to="{ name: 'page', params: { wikiId, title: titleParam(tab.title) } }"
    >
      {{ tab.label }}
    </RouterLink>
  </nav>
</template>

<style scoped>
.tab-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin: 0.75rem 0 1rem;
  border-bottom: 2px solid var(--color-header);
}

.tab {
  margin-bottom: -2px;
  padding: 0.4rem 0.9rem;
  border: 1px solid var(--color-border);
  border-bottom: 0;
  border-radius: 4px 4px 0 0;
  background: var(--color-page);
  color: var(--color-link);
  font-size: 0.9rem;
  font-weight: 600;
}

.tab:hover {
  text-decoration: none;
  background: var(--color-surface);
}

.tab.selected {
  border-color: var(--color-header);
  background: var(--color-header);
  color: var(--color-header-text);
}

.tab.new {
  color: var(--color-link-new);
}
</style>
