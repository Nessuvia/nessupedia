<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, ref, watchEffect } from "vue";
import FontPicker from "@/components/FontPicker.vue";
import { appearanceService } from "@/services";
import { useWikiStore } from "@/stores/wiki";
import { ACCENT_PALETTE, DEFAULT_ACCENT } from "@/utils/color";

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

.credit {
  margin: 1rem 0 0;
  color: var(--color-muted);
  font-size: 0.8rem;
}
</style>
