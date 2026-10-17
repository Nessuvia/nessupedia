<script setup lang="ts">
import { ref, watchEffect } from "vue";
import { assetService } from "@/services";

const props = defineProps<{ wikiId: string; path: string }>();

const url = ref<string>();
const missing = ref(false);
watchEffect(async () => {
  const found = await assetService.objectUrl(props.wikiId, props.path);
  url.value = found;
  missing.value = !found;
});
</script>

<template>
  <img v-if="url" class="asset-thumb" :src="url" alt="" />
  <span v-else class="asset-thumb missing">{{ missing ? "?" : "" }}</span>
</template>

<style scoped>
.asset-thumb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-page);
  object-fit: cover;
  color: var(--color-muted);
}
</style>
