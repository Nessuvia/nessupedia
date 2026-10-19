<script setup lang="ts">
import { useRoute } from "vue-router";
import { useLiveQuery } from "@/composables/useLiveQuery";
import { useStoredRef } from "@/composables/useStoredRef";
import { changeLog } from "@/services";
import AppIcon from "./AppIcon.vue";
import ChangeList from "./ChangeList.vue";

const props = defineProps<{ wikiId: string }>();

const RECENT_LIMIT = 6;
const route = useRoute();
const recent = useLiveQuery((wikiId) => changeLog.list(wikiId, { limit: RECENT_LIMIT }), () => props.wikiId);
const collapsed = useStoredRef("rightRailCollapsed", false);
</script>

<template>
  <aside class="right-rail" :class="{ collapsed }">
    <button
      class="toggle"
      type="button"
      :aria-expanded="!collapsed"
      :aria-label="collapsed ? 'Show sidebar' : 'Hide sidebar'"
      @click="collapsed = !collapsed"
    >
      <AppIcon name="chevron" />
    </button>
    <div class="rail-body">
      <slot />
      <section v-if="route.name !== 'recent-changes'" class="rail-module" aria-labelledby="rail-recent">
        <h2 id="rail-recent">Recent changes</h2>
        <ChangeList v-if="recent?.length" :wiki-id="wikiId" :entries="recent" />
        <p v-else-if="recent" class="empty">No changes yet.</p>
        <RouterLink class="more" :to="{ name: 'recent-changes' }">See all changes</RouterLink>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.right-rail {
  width: 18rem;
  overflow-x: clip;
  font-size: 0.9rem;
  transition: width 0.25s ease;
}

.right-rail.collapsed {
  width: 1.75rem;
}

.rail-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 18rem;
  transition:
    opacity 0.25s ease,
    visibility 0.25s;
}

.collapsed .rail-body {
  visibility: hidden;
  opacity: 0;
}

.toggle {
  display: flex;
  margin-bottom: 0.5rem;
  padding: 0.15rem;
  border: none;
  border-radius: 4px;
  background: none;
  color: var(--color-muted);
  cursor: pointer;
}

.toggle:hover {
  background: var(--color-page);
  color: var(--color-text);
}

.toggle .icon {
  transform: rotate(180deg);
  transition: transform 0.25s ease;
}

.collapsed .toggle .icon {
  transform: none;
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

@media (max-width: 64rem) {
  .right-rail,
  .rail-body {
    width: auto;
  }

  .toggle {
    display: none;
  }

  .collapsed .rail-body {
    visibility: visible;
    opacity: 1;
  }
}
</style>
