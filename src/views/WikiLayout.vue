<script setup lang="ts">
import { storeToRefs } from "pinia";
import { onBeforeUnmount, watch, watchEffect } from "vue";
import { useRoute } from "vue-router";
import GlobalBar from "@/components/GlobalBar.vue";
import InstallBanner from "@/components/InstallBanner.vue";
import LeftRail from "@/components/LeftRail.vue";
import RightRail from "@/components/RightRail.vue";
import RunPanel from "@/components/RunPanel.vue";
import WikiHeader from "@/components/WikiHeader.vue";
import { useWikiStore } from "@/stores/wiki";
import { DEFAULT_ACCENT, isHexColor, textOn } from "@/utils/color";

const props = defineProps<{ wikiId: string }>();

const store = useWikiStore();
const { wikis, currentWiki } = storeToRefs(store);
const route = useRoute();

watch(
  () => props.wikiId,
  (id) => (store.currentWikiId = id),
  { immediate: true },
);

// The accent goes on the root so the theme's derived colors, and dialogs outside the layout, follow it.
const root = document.documentElement.style;
watchEffect(() => {
  const chosen = currentWiki.value?.appearance?.accent;
  const accent = isHexColor(chosen) ? chosen : DEFAULT_ACCENT;
  root.setProperty("--accent", accent);
  root.setProperty("--accent-text", textOn(accent));
});
onBeforeUnmount(() => {
  root.removeProperty("--accent");
  root.removeProperty("--accent-text");
});
</script>

<template>
  <GlobalBar />
  <div v-if="currentWiki" class="wiki-layout">
    <LeftRail class="left" :wiki-id="wikiId" />
    <div class="wiki-content">
      <InstallBanner />
      <WikiHeader :wiki="currentWiki" />
      <div class="columns wiki-card" :class="{ wide: route.meta.wide }">
        <main class="main">
          <RouterView />
        </main>
        <RightRail v-if="!route.meta.wide" class="right" :wiki-id="wikiId">
          <RouterView name="rail" />
        </RightRail>
      </div>
    </div>
    <RunPanel :wiki-id="wikiId" />
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
  gap: 2rem;
  padding: 1.5rem 2rem 2.5rem;
  border-radius: 0 0 var(--radius) var(--radius);
  background: var(--color-surface);
  box-shadow: 0 2px 12px rgb(0 0 0 / 8%);
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

  .columns {
    padding: 1rem 1rem 1.5rem;
  }
}
</style>
