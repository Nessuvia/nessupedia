<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useLiveQuery } from "@/composables/useLiveQuery";
import type { Continuity } from "@/db/types";
import { subpageName, titleSegments, topTitle } from "@/markdown/subpages";
import { versionOf } from "@/markdown/versions";
import { RELATIONSHIPS_TAB, titleKey } from "@/markdown/wikilinks";
import { titleParam } from "@/router/params";
import { pageService } from "@/services";

// Switches between a page's main canon and its versions, staying on the Relationships tab when on it.
// It shows once the page has a version.
const props = defineProps<{ wikiId: string; title: string; continuities: Continuity[] }>();

const router = useRouter();

const options = useLiveQuery(
  async ([wikiId, top, continuities]) => {
    const versions = (await pageService.directSubpages(wikiId, top)).filter((page) => versionOf(page.title, continuities));
    if (versions.length === 0) return [];
    const main = (await pageService.getByTitle(wikiId, top))?.title ?? top;
    return [{ label: "Main canon", title: main }, ...versions.map((page) => ({ label: subpageName(page.title), title: page.title }))];
  },
  () => [props.wikiId, topTitle(props.title), props.continuities] as const,
);

const onRelationships = computed(() => titleKey(titleSegments(props.title).at(-1)!) === titleKey(RELATIONSHIPS_TAB));
const base = computed(() => (onRelationships.value ? titleSegments(props.title).slice(0, -1).join("/") : props.title));
const current = computed(() => options.value?.find((option) => titleKey(option.title) === titleKey(base.value))?.title ?? "");

function go(title: string) {
  const target = onRelationships.value ? `${title}/${RELATIONSHIPS_TAB}` : title;
  void router.push({ name: "page", params: { title: titleParam(target) } });
}
</script>

<template>
  <label v-if="options?.length" class="version-switcher">
    <span class="visually-hidden">Version</span>
    <select :value="current" @change="go(($event.target as HTMLSelectElement).value)">
      <option v-for="option in options" :key="option.title" :value="option.title">{{ option.label }}</option>
    </select>
  </label>
</template>

<style scoped>
.version-switcher {
  position: relative;
  display: inline-flex;
}

/* A caret drawn from two borders, since the native one is hidden. */
.version-switcher::after {
  position: absolute;
  top: 50%;
  right: 0.75rem;
  width: 0.35rem;
  height: 0.35rem;
  border-right: 2px solid currentcolor;
  border-bottom: 2px solid currentcolor;
  color: var(--color-header);
  content: "";
  pointer-events: none;
  transform: translateY(-70%) rotate(45deg);
}

select {
  padding: 0.3rem 2rem 0.3rem 0.85rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  appearance: none;
  background: var(--color-page);
  color: var(--color-text);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}

select:hover,
select:focus-visible {
  border-color: var(--color-header);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
