<script setup lang="ts">
import { storeToRefs } from "pinia";
import { watch } from "vue";
import { useRoute } from "vue-router";
import GlobalBar from "@/components/GlobalBar.vue";
import LeftRail from "@/components/LeftRail.vue";
import RightRail from "@/components/RightRail.vue";
import WikiHeader from "@/components/WikiHeader.vue";
import { useWikiStore } from "@/stores/wiki";

const props = defineProps<{ wikiId: string }>();

const store = useWikiStore();
const { wikis, currentWiki } = storeToRefs(store);
const route = useRoute();

watch(
  () => props.wikiId,
  (id) => (store.currentWikiId = id),
  { immediate: true },
);
</script>

<template>
  <GlobalBar />
  <div v-if="currentWiki" class="wiki-layout">
    <LeftRail class="left" :wiki-id="wikiId" />
    <div class="wiki-content">
      <WikiHeader :wiki="currentWiki" />
      <div class="columns" :class="{ wide: route.meta.wide }">
        <main class="main">
          <RouterView />
        </main>
        <RightRail v-if="!route.meta.wide" class="right" :wiki-id="wikiId">
          <RouterView name="rail" />
        </RightRail>
      </div>
    </div>
  </div>
  <main v-else-if="wikis" class="wiki-missing content-card">
    <h1>Wiki not found</h1>
    <p>This wiki doesn't exist or was deleted. <RouterLink :to="{ name: 'home' }">Go to your wikis</RouterLink>.</p>
  </main>
</template>

<style scoped>
.wiki-layout {
  display: grid;
  grid-template-columns: var(--rail-width) minmax(0, 1fr);
}

.wiki-content {
  width: 100%;
  max-width: 82rem;
  margin: 0 auto;
  padding: 1.5rem;
}

.columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 18rem;
  align-items: start;
  gap: 1.5rem;
}

.columns.wide {
  grid-template-columns: minmax(0, 1fr);
}

.wiki-missing {
  max-width: 40rem;
  margin: 3rem auto;
}

@media (max-width: 64rem) {
  .columns {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 48rem) {
  .wiki-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .left {
    display: none;
  }

  .wiki-content {
    padding: 1rem 0.75rem;
  }
}
</style>
