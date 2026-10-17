<script setup lang="ts">
import { useRoute } from "vue-router";
import { useLiveQuery } from "@/composables/useLiveQuery";
import { changeLog } from "@/services";
import ChangeList from "./ChangeList.vue";

const props = defineProps<{ wikiId: string }>();

const RECENT_LIMIT = 6;
const route = useRoute();
const recent = useLiveQuery((wikiId) => changeLog.list(wikiId, { limit: RECENT_LIMIT }), () => props.wikiId);
</script>

<template>
  <aside class="right-rail">
    <slot />
    <section v-if="route.name !== 'recent-changes'" class="rail-module" aria-labelledby="rail-recent">
      <h2 id="rail-recent">Recent changes</h2>
      <ChangeList v-if="recent?.length" :wiki-id="wikiId" :entries="recent" />
      <p v-else-if="recent" class="empty">No changes yet.</p>
      <RouterLink class="more" :to="{ name: 'recent-changes', params: { wikiId } }">See all changes</RouterLink>
    </section>
  </aside>
</template>

<style scoped>
.right-rail {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  font-size: 0.9rem;
}

.rail-module {
  padding: 1rem 1.25rem;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}

.rail-module h2 {
  margin: 0 0 0.75rem;
  border: 0;
  font-size: 1rem;
  font-weight: 600;
}

.empty {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.8rem;
}

.more {
  display: inline-block;
  margin-top: 0.75rem;
  font-size: 0.8rem;
}
</style>
