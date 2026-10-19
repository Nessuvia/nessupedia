<script setup lang="ts">
import { storeToRefs } from "pinia";
import { watchEffect } from "vue";
import { useLiveQuery } from "@/composables/useLiveQuery";
import { titleSegments } from "@/markdown/subpages";
import { titleParam } from "@/router/params";
import { continuityService } from "@/services";
import { useWikiStore } from "@/stores/wiki";

const props = defineProps<{ wikiId: string; name: string }>();

const { currentWiki } = storeToRefs(useWikiStore());
const continuity = useLiveQuery(
  async ([wikiId, name]) => (await continuityService.get(wikiId, name)) ?? null,
  () => [props.wikiId, props.name] as const,
);
const versions = useLiveQuery(([wikiId, name]) => continuityService.versions(wikiId, name), () => [props.wikiId, props.name] as const);

watchEffect(() => {
  document.title = [`Continuity: ${continuity.value?.name ?? props.name}`, currentWiki.value?.name].filter(Boolean).join(" | ");
});
</script>

<template>
  <article class="content-card">
    <p class="kind"><RouterLink :to="{ name: 'wiki-settings' }">Continuity</RouterLink></p>
    <h1>{{ continuity?.name ?? name }}</h1>
    <p v-if="continuity === null" class="empty">There's no continuity by this name. Add one in wiki settings.</p>
    <template v-else-if="continuity">
      <p v-if="continuity.description" class="description">{{ continuity.description }}</p>
      <h2>Versions</h2>
      <p v-if="versions?.length === 0" class="empty">No pages have a version in {{ continuity.name }} yet.</p>
      <ul v-else>
        <li v-for="version in versions" :key="version.id">
          <RouterLink :to="{ name: 'page', params: { title: titleParam(version.title) } }">{{ titleSegments(version.title)[0] }}</RouterLink>
        </li>
      </ul>
    </template>
  </article>
</template>

<style scoped>
.kind {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

h1 {
  margin-top: 0.25rem;
}

h2 {
  font-size: 1.2rem;
}

.description {
  max-width: 40rem;
}

.empty {
  color: var(--color-muted);
}

ul {
  columns: 14rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

li {
  padding: 0.15rem 0;
  break-inside: avoid;
}
</style>
