<script setup lang="ts">
import { useLiveQuery } from "@/composables/useLiveQuery";
import { linkIndexer, pageService } from "@/services";

const props = defineProps<{ wikiId: string; title: string }>();

// Existing pages list their backlinks; missing pages list the red links that point at their title.
const linkingPages = useLiveQuery(
  async ([wikiId, title]) => {
    const page = await pageService.getByTitle(wikiId, title);
    const links = page ? await linkIndexer.backlinks(page.id) : await linkIndexer.redLinksTo(wikiId, title);
    const sourceIds = [...new Set(links.map((link) => link.fromPageId))].filter((id) => id !== page?.id);
    const sources = await Promise.all(sourceIds.map((id) => pageService.get(id)));
    return sources
      .filter((source) => source !== undefined)
      .map((source) => source.title)
      .sort((a, b) => a.localeCompare(b));
  },
  () => [props.wikiId, props.title] as const,
);
</script>

<template>
  <section class="rail-module" aria-labelledby="rail-backlinks">
    <h2 id="rail-backlinks">What links here</h2>
    <ul v-if="linkingPages?.length">
      <li v-for="linkingTitle in linkingPages" :key="linkingTitle">
        <RouterLink :to="{ name: 'page', params: { wikiId, title: linkingTitle } }">{{ linkingTitle }}</RouterLink>
      </li>
    </ul>
    <p v-else-if="linkingPages" class="empty">No pages link here yet.</p>
  </section>
</template>

<style scoped>
ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

li + li {
  margin-top: 0.35rem;
}

.empty {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.8rem;
}
</style>
