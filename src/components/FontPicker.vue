<script setup lang="ts">
import { computed, ref } from "vue";
import type { WikiFont } from "@/db/types";
import { appearanceService } from "@/services";
import type { FontRole, FontsourceFont } from "@/services/AppearanceService";

const props = defineProps<{ wikiId: string; role: FontRole; label: string; current?: WikiFont }>();

const MATCH_LIMIT = 8;
const fonts = ref<FontsourceFont[]>();
const query = ref("");
const picking = ref(false);
const busy = ref(false);
const error = ref("");

const matches = computed(() => {
  const wanted = query.value.trim().toLowerCase();
  if (!fonts.value || !wanted) return [];
  return fonts.value.filter((font) => font.family.toLowerCase().includes(wanted)).slice(0, MATCH_LIMIT);
});

async function open() {
  picking.value = true;
  error.value = "";
  try {
    fonts.value = await appearanceService.listFonts();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
}

async function choose(fontId: string | undefined) {
  busy.value = true;
  error.value = "";
  try {
    await appearanceService.setFont(props.wikiId, props.role, fontId);
    picking.value = false;
    query.value = "";
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="font-picker">
    <div class="row">
      <span class="label">{{ label }}</span>
      <span class="current">{{ current?.family ?? "System fonts" }}</span>
      <button v-if="!picking" type="button" class="button secondary" :disabled="busy" @click="open">Change</button>
      <button v-if="current && !picking" type="button" class="button secondary" :disabled="busy" @click="choose(undefined)">
        Use system fonts
      </button>
    </div>
    <div v-if="picking" class="search">
      <input
        v-model="query"
        class="text-input"
        type="search"
        :aria-label="`Search fonts for the ${label.toLowerCase()}`"
        :placeholder="fonts ? 'Search Fontsource fonts' : 'Loading fonts…'"
        :disabled="!fonts || busy"
      />
      <ul v-if="matches.length" class="matches">
        <li v-for="font in matches" :key="font.id">
          <button type="button" :disabled="busy" @click="choose(font.id)">
            {{ font.family }} <span class="category">{{ font.category }}</span>
          </button>
        </li>
      </ul>
      <p v-else-if="fonts && query.trim()" class="hint">No fonts match.</p>
      <div class="search-actions">
        <span v-if="busy" role="status">Downloading…</span>
        <button type="button" class="button secondary" :disabled="busy" @click="picking = false">Cancel</button>
      </div>
    </div>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.font-picker {
  margin-bottom: 1rem;
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
}

.label {
  min-width: 6rem;
  font-weight: 600;
}

.current {
  font-family: var(--font-heading);
}

.search {
  max-width: 28rem;
  margin-top: 0.5rem;
}

.matches {
  margin: 0.25rem 0 0;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  list-style: none;
}

.matches button {
  display: flex;
  justify-content: space-between;
  width: 100%;
  padding: 0.4rem 0.75rem;
  border: 0;
  background: none;
  color: var(--color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.matches button:hover {
  background: var(--color-page);
}

.category,
.hint {
  color: var(--color-muted);
  font-size: 0.8rem;
}

.search-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 1rem;
  margin-top: 0.5rem;
}
</style>
