<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, ref, useTemplateRef, watchEffect } from "vue";
import FontPicker from "@/components/FontPicker.vue";
import ImageSlotInput from "@/components/ImageSlotInput.vue";
import type { ImageSlot } from "@/db/types";
import { appearanceService } from "@/services";
import { IMAGE_SLOTS } from "@/services/AppearanceService";
import { useWikiStore } from "@/stores/wiki";
import { buildAssetsPack } from "@/utils/assetsPack";
import { ACCENT_PALETTE, DEFAULT_ACCENT } from "@/utils/color";
import { downloadFile } from "@/utils/download";

const props = defineProps<{ wikiId: string }>();

const { currentWiki } = storeToRefs(useWikiStore());
const appearance = computed(() => currentWiki.value?.appearance);
const accent = computed(() => appearance.value?.accent ?? DEFAULT_ACCENT);
const accentError = ref("");

async function setAccent(color: string) {
  accentError.value = "";
  try {
    await appearanceService.setAccent(props.wikiId, color);
  } catch (cause) {
    accentError.value = cause instanceof Error ? cause.message : String(cause);
  }
}

const IMAGE_HINTS: Record<ImageSlot, string> = {
  banner: "The band behind the wiki's name at the top of every page.",
  background: "Fixed behind the whole wiki while pages scroll.",
  wordmark: "A logo shown in place of the wiki's name, at half size. Use a transparent background.",
  icon: "Shown beside the wiki's name and in the wiki switcher.",
};

const packInput = useTemplateRef("packInput");
const packBusy = ref(false);
const packError = ref("");
const packFilled = ref("");

async function downloadPack() {
  packBusy.value = true;
  packError.value = "";
  try {
    downloadFile(await buildAssetsPack(), "Wiki_Assets_Pack.zip", "application/zip");
  } finally {
    packBusy.value = false;
  }
}

async function importPack(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  packBusy.value = true;
  packError.value = "";
  packFilled.value = "";
  try {
    const filled = await appearanceService.importPack(props.wikiId, new Uint8Array(await file.arrayBuffer()));
    packFilled.value = `Set the ${filled.map((slot) => IMAGE_SLOTS[slot].label.toLowerCase()).join(", ")}.`;
  } catch (cause) {
    packError.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    packBusy.value = false;
  }
}

watchEffect(() => {
  document.title = ["Appearance", currentWiki.value?.name].filter(Boolean).join(" | ");
});
</script>

<template>
  <article class="content-card">
    <h1>Appearance</h1>

    <section aria-labelledby="appearance-accent">
      <h2 id="appearance-accent">Accent color</h2>
      <p class="hint">Colors the header, buttons, tabs, and box headers. Light and dark mode both use it.</p>
      <div class="swatches" role="group" aria-label="Accent color">
        <button
          v-for="color in ACCENT_PALETTE"
          :key="color"
          type="button"
          class="swatch"
          :style="{ background: color }"
          :aria-label="color"
          :aria-pressed="accent === color"
          @click="setAccent(color)"
        />
        <label class="custom">
          <input type="color" :value="accent" @change="setAccent(($event.target as HTMLInputElement).value)" />
          Any color
        </label>
      </div>
      <p v-if="accentError" class="form-error" role="alert">{{ accentError }}</p>
    </section>

    <section aria-labelledby="appearance-fonts">
      <h2 id="appearance-fonts">Fonts</h2>
      <p class="hint">
        Fonts are small, usually 50 to 150 KB, and download once from Fontsource. After that they're stored in this wiki and
        work offline.
      </p>
      <FontPicker :wiki-id="wikiId" role="heading" label="Headings" :current="appearance?.fonts?.heading" />
      <FontPicker :wiki-id="wikiId" role="body" label="Body text" :current="appearance?.fonts?.body" />
      <p class="credit">Fonts by <a href="https://fontsource.org" target="_blank" rel="noopener">Fontsource</a>.</p>
    </section>

    <section aria-labelledby="appearance-images">
      <h2 id="appearance-images">Images</h2>
      <p class="hint">
        Drop or upload each image, or download the Wiki Assets Pack, replace its placeholders with your art, and import it
        back. Images are scaled and stored like page images.
      </p>
      <div class="pack">
        <button type="button" class="button secondary" :disabled="packBusy" @click="downloadPack">Download Wiki Assets Pack</button>
        <button type="button" class="button secondary" :disabled="packBusy" @click="packInput?.click()">Import pack</button>
        <input ref="packInput" type="file" accept=".zip,application/zip" hidden @change="importPack" />
        <span v-if="packBusy" role="status">Working…</span>
      </div>
      <p v-if="packError" class="form-error" role="alert">{{ packError }}</p>
      <p v-else-if="packFilled" class="saved" role="status">{{ packFilled }}</p>
      <ImageSlotInput
        v-for="(hint, slot) in IMAGE_HINTS"
        :key="slot"
        :wiki-id="wikiId"
        :slot="slot"
        :path="appearance?.images?.[slot]"
        :hint="hint"
      />
    </section>
  </article>
</template>

<style scoped>
section + section {
  margin-top: 2rem;
}

h2 {
  font-size: 1.3rem;
}

.hint {
  max-width: 40rem;
  margin: 0.35rem 0 1rem;
  color: var(--color-muted);
  font-size: 0.9rem;
}

.swatches {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
}

.swatch {
  width: 2.25rem;
  height: 2.25rem;
  border: 2px solid var(--color-border);
  border-radius: 50%;
  cursor: pointer;
}

.swatch[aria-pressed="true"] {
  outline: 3px solid var(--color-text);
  outline-offset: 2px;
}

.custom {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-left: 0.5rem;
  font-size: 0.9rem;
  cursor: pointer;
}

.custom input {
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}

.pack {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}

.pack + .form-error,
.saved {
  margin: -0.75rem 0 1.25rem;
}

.saved {
  color: var(--color-success);
}

.credit {
  margin: 1rem 0 0;
  color: var(--color-muted);
  font-size: 0.8rem;
}
</style>
