<script setup lang="ts">
import { computed } from "vue";
import { useLiveQuery } from "@/composables/useLiveQuery";
import { orderTabs, subpageName, tabTitle, titleSegments, topTitle } from "@/markdown/subpages";
import { RELATIONSHIPS_TAB, titleKey } from "@/markdown/wikilinks";
import { titleParam } from "@/router/params";
import { versionOf } from "@/markdown/versions";
import { pageService, relationshipService, wikiService } from "@/services";

// The tab bar of the page a title sits under: Overview, Relationships when it has any, then its direct
// subpages. A version has only Overview and Relationships, the latter when its main page has any.
// It shows once there's a tab besides Overview.
const props = defineProps<{ wikiId: string; title: string }>();

const bar = useLiveQuery(
  async ([wikiId, top, title]) => {
    const continuities = (await wikiService.get(wikiId))?.continuities ?? [];
    const segments = titleSegments(title);
    const onRelationships = segments.length > 1 && titleKey(segments.at(-1)!) === titleKey(RELATIONSHIPS_TAB);

    const versionTitle = segments.slice(0, 2).join("/");
    const version = versionOf(versionTitle, continuities);
    if (version) {
      const main = await pageService.getByTitle(wikiId, version.main);
      if (!main || (await relationshipService.count(main)) === 0) return undefined;
      return {
        current: onRelationships ? `${versionTitle}/${RELATIONSHIPS_TAB}` : versionTitle,
        tabs: [
          { label: "Overview", title: versionTitle, exists: true },
          { label: RELATIONSHIPS_TAB, title: `${versionTitle}/${RELATIONSHIPS_TAB}`, exists: true },
        ],
      };
    }

    const page = await pageService.getByTitle(wikiId, top);
    const topName = page?.title ?? top;
    // Versions show in the version switcher rather than as tabs.
    const subpages = orderTabs(
      (await pageService.directSubpages(wikiId, topName)).filter((subpage) => !versionOf(subpage.title, continuities)),
      page?.frontmatter,
    );
    const hasRelationships = page ? (await relationshipService.count(page)) > 0 : false;
    if (subpages.length === 0 && !hasRelationships) return undefined;
    return {
      current: tabTitle(title),
      tabs: [
        { label: "Overview", title: topName, exists: !!page },
        ...(hasRelationships ? [{ label: RELATIONSHIPS_TAB, title: `${topName}/${RELATIONSHIPS_TAB}`, exists: true }] : []),
        ...subpages.map((subpage) => ({ label: subpageName(subpage.title), title: subpage.title, exists: true })),
      ],
    };
  },
  () => [props.wikiId, topTitle(props.title), props.title] as const,
);

const tabs = computed(() => bar.value?.tabs);
const current = computed(() => titleKey(bar.value?.current ?? ""));
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
