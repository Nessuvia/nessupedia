<script setup lang="ts">
import { useAssetUrl } from "@/composables/useAssetUrl";
import type { Wiki } from "@/db/types";

const props = defineProps<{ wiki: Wiki }>();
const url = useAssetUrl(() => [props.wiki.id, props.wiki.appearance?.images?.icon]);
</script>

<template>
  <img v-if="url" class="wiki-icon" :src="url" alt="" />
</template>

<style scoped>
.wiki-icon {
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 4px;
  object-fit: cover;
  vertical-align: -0.25rem;
}
</style>
