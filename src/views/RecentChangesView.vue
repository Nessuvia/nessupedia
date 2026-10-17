<script setup lang="ts">
import { storeToRefs } from "pinia";
import { watchEffect } from "vue";
import ChangeList from "@/components/ChangeList.vue";
import { useLiveQuery } from "@/composables/useLiveQuery";
import { changeLog } from "@/services";
import { useWikiStore } from "@/stores/wiki";

const props = defineProps<{ wikiId: string }>();

const { currentWiki } = storeToRefs(useWikiStore());
const entries = useLiveQuery((wikiId) => changeLog.list(wikiId, { limit: 200 }), () => props.wikiId);

watchEffect(() => {
  document.title = ["Recent changes", currentWiki.value?.name].filter(Boolean).join(" | ");
});
</script>

<template>
  <article class="content-card">
    <h1>Recent changes</h1>
    <ChangeList v-if="entries?.length" :wiki-id="wikiId" :entries="entries" detailed />
    <p v-else-if="entries" class="empty">No changes yet.</p>
  </article>
</template>

<style scoped>
.empty {
  color: var(--color-muted);
}
</style>
