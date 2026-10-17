<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import SiteSidebar from "@/components/SiteSidebar.vue";
import TopBar from "@/components/TopBar.vue";
import { useMediaQuery } from "@/composables/useMediaQuery";
import { useStoredRef } from "@/composables/useStoredRef";
import { useWikiStore } from "@/stores/wiki";

const props = defineProps<{ wikiId: string }>();

const store = useWikiStore();
const { wikis, currentWiki } = storeToRefs(store);
const route = useRoute();

// Wide screens keep the sidebar inline with a remembered preference; narrow screens use a drawer that starts closed.
const narrow = useMediaQuery("(max-width: 48rem)");
const pinnedOpen = useStoredRef("oc-wiki:sidebar-open", true);
const drawerOpen = ref(false);
const sidebarOpen = computed({
  get: () => (narrow.value ? drawerOpen.value : pinnedOpen.value),
  set: (open) => (narrow.value ? (drawerOpen.value = open) : (pinnedOpen.value = open)),
});

watch(
  () => route.fullPath,
  () => (drawerOpen.value = false),
);

watch(
  () => props.wikiId,
  (id) => (store.currentWikiId = id),
  { immediate: true },
);
</script>

<template>
  <div class="wiki-layout">
    <TopBar v-model:sidebar-open="sidebarOpen" />
    <div v-if="currentWiki" class="wiki-body">
      <div v-if="narrow && sidebarOpen" class="backdrop" @click="sidebarOpen = false" />
      <SiteSidebar v-if="sidebarOpen" id="site-sidebar" :class="{ drawer: narrow }" :wiki-id="wikiId" />
      <main class="wiki-main">
        <RouterView />
      </main>
    </div>
    <main v-else-if="wikis" class="wiki-missing">
      <h1>Wiki not found</h1>
      <p>This wiki doesn't exist or was deleted. <RouterLink :to="{ name: 'home' }">Go to your wikis</RouterLink>.</p>
    </main>
  </div>
</template>

<style scoped>
.wiki-layout {
  min-height: 100vh;
}

.wiki-body {
  display: flex;
  gap: 1.5rem;
  max-width: 80rem;
  margin: 0 auto;
  padding: 1.5rem;
}

.wiki-main {
  flex: 1;
  min-width: 0;
}

.wiki-missing {
  max-width: 40rem;
  margin: 3rem auto;
  padding: 0 1.5rem;
}

.backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
  background: rgb(0 0 0 / 30%);
}

@media (max-width: 48rem) {
  .wiki-body {
    padding: 1rem 0.75rem;
  }
}
</style>
