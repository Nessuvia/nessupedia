<script setup lang="ts">
import { storeToRefs } from "pinia";
import { watchEffect } from "vue";
import PageIndex from "@/components/PageIndex.vue";
import { useLiveQuery } from "@/composables/useLiveQuery";
import { pageService } from "@/services";
import { useWikiStore } from "@/stores/wiki";

const props = defineProps<{ wikiId: string }>();

const { currentWiki } = storeToRefs(useWikiStore());
const pages = useLiveQuery((wikiId) => pageService.listForWiki(wikiId), () => props.wikiId);

watchEffect(() => {
  document.title = ["All pages", currentWiki.value?.name].filter(Boolean).join(" | ");
});
</script>

<template>
  <article class="content-card">
    <h1>All pages</h1>
    <p v-if="pages?.length === 0" class="empty">This wiki has no pages yet.</p>
    <PageIndex v-if="pages" :wiki-id="wikiId" :pages="pages" />
  </article>
</template>

<style scoped>
.empty {
  color: var(--color-muted);
}
</style>
