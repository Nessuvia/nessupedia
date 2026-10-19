<script setup lang="ts">
import { useId } from "vue";
import type { AssumptionMode } from "@/db/types";

export interface DraftInput {
  notes: string;
  mode: AssumptionMode;
  rules: string;
}

// The notes box, assumption mode, and one-off rules that every drafting action asks for.
defineProps<{ notesLabel?: string; notesPlaceholder?: string }>();
const draft = defineModel<DraftInput>({ required: true });

const id = useId();

const MODES: { value: AssumptionMode; label: string; description: string }[] = [
  { value: "strict", label: "Strict", description: "Uses only what you've written. Gaps become questions for you." },
  { value: "guided", label: "Guided", description: "Fills a gap when one of your rules covers it." },
  { value: "liberal", label: "Liberal", description: "Invents freely. Everything it writes is tagged Idea." },
];
</script>

<template>
  <div class="draft-form">
    <label class="field-label" :for="`${id}-notes`">{{ notesLabel ?? "Notes" }}</label>
    <textarea
      :id="`${id}-notes`"
      v-model="draft.notes"
      class="text-input notes"
      rows="7"
      :placeholder="notesPlaceholder ?? 'Anything you know: facts, fragments, scenes, how they talk.'"
    />

    <fieldset class="modes">
      <legend class="field-label">When something's missing</legend>
      <label v-for="option in MODES" :key="option.value" class="mode">
        <input v-model="draft.mode" type="radio" :name="`${id}-mode`" :value="option.value" />
        <span>
          <strong>{{ option.label }}</strong>
          <span class="mode-description">{{ option.description }}</span>
        </span>
      </label>
    </fieldset>

    <label class="field-label" :for="`${id}-rules`">Rules for this draft</label>
    <textarea
      :id="`${id}-rules`"
      v-model="draft.rules"
      class="text-input"
      rows="2"
      placeholder="Optional, such as &quot;assume she's left-handed&quot;. Your wiki's Assistant rules apply too."
    />
  </div>
</template>

<style scoped>
.draft-form {
  display: flex;
  flex-direction: column;
}

.field-label {
  display: block;
  margin: 0 0 0.35rem;
  font-weight: 600;
}

textarea {
  width: 100%;
  resize: vertical;
}

.notes {
  margin-bottom: 1rem;
}

.modes {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin: 0 0 1rem;
  padding: 0;
  border: 0;
}

.mode {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  cursor: pointer;
}

.mode input {
  margin-top: 0.3rem;
}

.mode-description {
  display: block;
  color: var(--color-muted);
  font-size: 0.85rem;
}
</style>
