<script setup lang="ts">
import { ref, useTemplateRef } from "vue";
import { useAssetUrl } from "@/composables/useAssetUrl";
import type { ImageSlot } from "@/db/types";
import { appearanceService } from "@/services";
import { IMAGE_SLOTS } from "@/services/AppearanceService";

const props = defineProps<{ wikiId: string; slot: ImageSlot; path?: string; hint: string }>();

const info = IMAGE_SLOTS[props.slot];
const preview = useAssetUrl(() => [props.wikiId, props.path]);
const input = useTemplateRef("input");
const dragging = ref(false);
const busy = ref(false);
const error = ref("");

async function set(file: Blob | undefined) {
  busy.value = true;
  error.value = "";
  try {
    await appearanceService.setImage(props.wikiId, props.slot, file);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}

function onDrop(event: DragEvent) {
  dragging.value = false;
  const file = event.dataTransfer?.files[0];
  if (file) void set(file);
}

function onPick(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files?.[0]) void set(input.files[0]);
  input.value = "";
}
</script>

<template>
  <div class="image-slot">
    <div
      class="drop"
      :class="{ dragging, filled: !!preview }"
      :style="{ aspectRatio: `${info.width} / ${info.height}` }"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <img v-if="preview" :src="preview" :alt="`${info.label} preview`" />
      <span v-else>Drop an image here</span>
    </div>
    <div class="details">
      <strong>{{ info.label }}</strong>
      <span class="size">{{ info.width }} × {{ info.height }}</span>
      <p class="hint">{{ hint }}</p>
      <div class="actions">
        <button type="button" class="button secondary" :disabled="busy" @click="input?.click()">Upload</button>
        <input ref="input" type="file" accept="image/*" hidden @change="onPick" />
        <button v-if="path" type="button" class="button secondary" :disabled="busy" @click="set(undefined)">Remove</button>
        <span v-if="busy" role="status">Saving…</span>
      </div>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    </div>
  </div>
</template>

<style scoped>
.image-slot {
  display: grid;
  grid-template-columns: minmax(0, 16rem) minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
  margin-bottom: 1.25rem;
}

.drop {
  display: flex;
  align-items: center;
  justify-content: center;
  max-height: 10rem;
  overflow: hidden;
  border: 2px dashed var(--color-border);
  border-radius: 6px;
  background: var(--color-page);
  color: var(--color-muted);
  font-size: 0.8rem;
  text-align: center;
}

.drop.filled {
  border-style: solid;
}

.drop.dragging {
  border-color: var(--accent);
}

.drop img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.size {
  margin-left: 0.5rem;
  color: var(--color-muted);
  font-size: 0.85rem;
}

.hint {
  margin: 0.25rem 0 0.5rem;
  color: var(--color-muted);
  font-size: 0.85rem;
}

.actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

@media (max-width: 40rem) {
  .image-slot {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
