<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { titleKey } from "@/markdown/wikilinks";

// Names as removable chips. Enter, a comma, or leaving the field adds the typed name; Backspace in an
// empty field removes the last one. Names that fail `check` stay, marked, so they can be fixed.
const props = defineProps<{ label: string; suggestions?: string[]; check?: (name: string) => string | undefined }>();
const names = defineModel<string[]>({ required: true });

const id = useId();
const draft = ref("");

const problems = computed(() => names.value.map((name) => props.check?.(name)));
const firstProblem = computed(() => problems.value.find(Boolean));
const offered = computed(() => {
  const taken = new Set(names.value.map(titleKey));
  return (props.suggestions ?? []).filter((name) => !taken.has(titleKey(name)));
});

function commit() {
  const name = draft.value.replace(/,$/, "").trim();
  draft.value = "";
  if (name && !names.value.some((existing) => titleKey(existing) === titleKey(name))) names.value = [...names.value, name];
}

function remove(index: number) {
  names.value = names.value.filter((_, at) => at !== index);
}

function onInput() {
  if (draft.value.endsWith(",")) commit();
}

function onBackspace() {
  if (!draft.value && names.value.length > 0) remove(names.value.length - 1);
}

defineExpose({ commit });
</script>

<template>
  <div class="list-input">
    <label class="label" :for="id">{{ label }}</label>
    <div class="box">
      <span v-for="(name, index) in names" :key="`${index}:${name}`" class="chip" :class="{ invalid: problems[index] }">
        {{ name }}
        <button type="button" :aria-label="`Remove ${name}`" @click="remove(index)">×</button>
      </span>
      <input
        :id="id"
        v-model="draft"
        type="text"
        autocomplete="off"
        :list="offered.length ? `${id}-suggestions` : undefined"
        @input="onInput"
        @keydown.enter.prevent="commit"
        @keydown.backspace="onBackspace"
        @blur="commit"
      />
      <datalist v-if="offered.length" :id="`${id}-suggestions`">
        <option v-for="name in offered" :key="name" :value="name" />
      </datalist>
    </div>
    <p v-if="firstProblem" class="form-error" role="alert">{{ firstProblem }}</p>
  </div>
</template>

<style scoped>
.label {
  display: block;
  margin-bottom: 0.35rem;
  font-weight: 600;
}

.box {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-surface);
}

.box:focus-within {
  outline: 2px solid var(--color-link);
  outline-offset: -1px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.1rem 0.2rem 0.1rem 0.5rem;
  border-radius: 999px;
  background: var(--color-page);
  font-size: 0.9rem;
}

.chip.invalid {
  outline: 1px solid var(--color-danger);
  color: var(--color-danger);
}

.chip button {
  padding: 0 0.3rem;
  border: 0;
  border-radius: 999px;
  background: none;
  color: inherit;
  font: inherit;
  line-height: 1.2;
  cursor: pointer;
}

.chip button:hover {
  background: var(--color-border);
}

input {
  flex: 1;
  min-width: 8rem;
  padding: 0.2rem;
  border: 0;
  background: none;
  font: inherit;
  outline: none;
}
</style>
