<script setup lang="ts">
import { useLiveQuery } from "@/composables/useLiveQuery";
import type { Page } from "@/db/types";
import { titleParam } from "@/router/params";
import { relationshipService } from "@/services";
import { RELATIONSHIP_TEMPLATE_ID } from "@/templates";
import PageContent from "./PageContent.vue";

// The generated Relationships tab: a section per relationship page naming this character, led by the
// other character and filled with the pair page's lead. On a version's tab, pairs and characters with a
// version in the same continuity show that version.
const props = defineProps<{ wikiId: string; character: Page; continuity?: string }>();

const relationships = useLiveQuery(
  ([page, continuity]) => relationshipService.of(page, continuity),
  () => [props.character, props.continuity] as const,
);
</script>

<template>
  <div class="relationships">
    <p v-if="relationships?.length === 0" class="empty">No relationship pages name {{ character.title }} yet.</p>
    <section v-for="{ pair, pairTarget, other, lead } in relationships" :key="`${pair.id}:${other.title}`" class="relationship">
      <h2>
        <RouterLink
          v-if="other.exists"
          class="wikilink"
          :to="{ name: 'page', params: { title: titleParam(other.target) } }"
        >
          {{ other.title }}
        </RouterLink>
        <RouterLink v-else class="wikilink new" :to="{ name: 'new-page', query: { title: other.title } }">
          {{ other.title }}
        </RouterLink>
      </h2>
      <PageContent v-if="lead" :wiki-id="wikiId" :markdown="lead" :continuity="continuity" />
      <p v-else class="empty">{{ pair.title }} has no summary yet.</p>
      <RouterLink class="read-more" :to="{ name: 'page', params: { title: titleParam(pairTarget) } }">
        Read more: {{ pair.title }}
      </RouterLink>
    </section>
    <RouterLink
      v-if="!continuity"
      class="button add"
      :to="{ name: 'new-page', query: { template: RELATIONSHIP_TEMPLATE_ID, with: character.title } }"
    >
      Add relationship
    </RouterLink>
  </div>
</template>

<style scoped>
.relationship + .relationship {
  margin-top: 1.5rem;
}

.empty {
  color: var(--color-muted);
}

.read-more {
  font-size: 0.9rem;
}

.add {
  margin-top: 1.5rem;
}

.add:hover {
  text-decoration: none;
}
</style>
