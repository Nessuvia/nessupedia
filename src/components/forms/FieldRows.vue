<script setup lang="ts">
import MarkdownEditor from "@/components/MarkdownEditor.vue";
import type { Field } from "@/markdown/fields";
import { keyOf } from "@/utils/keys";

// Label and value rows shared by the infobox and pressure forms; edits the given array in place.
const props = defineProps<{ fields: Field[]; wikiId: string; labelPlaceholder: string; autofocus?: boolean }>();
const emit = defineEmits<{ submit: []; cancel: [] }>();

const remove = (field: Field) => props.fields.splice(props.fields.indexOf(field), 1);
</script>

<template>
  <div class="field-rows">
    <div v-for="(field, index) in fields" :key="keyOf(field)" class="field-row">
      <input v-model="field.label" class="text-input label" type="text" :placeholder="labelPlaceholder" :aria-label="`Label ${index + 1}`" />
      <MarkdownEditor
        v-model="field.value"
        compact
        class="value"
        :label="field.label || `Value ${index + 1}`"
        :wiki-id="wikiId"
        :autofocus="autofocus && index === 0"
        @submit="emit('submit')"
        @cancel="emit('cancel')"
      />
      <button type="button" class="remove" :aria-label="`Remove ${field.label || 'row'}`" title="Remove" @click="remove(field)">×</button>
    </div>
  </div>
</template>

<style scoped>
.field-rows {
  display: grid;
  gap: 0.4rem;
}

.field-row {
  display: grid;
  grid-template-columns: minmax(7rem, 12rem) minmax(0, 1fr) auto;
  align-items: start;
  gap: 0.4rem;
}

.label {
  padding: 0.3rem 0.45rem;
  font-weight: 600;
}

.remove {
  width: 1.8rem;
  height: 1.8rem;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-surface);
  color: var(--color-muted);
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
}

.remove:hover {
  color: var(--color-danger);
}

@media (max-width: 40rem) {
  .field-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .value {
    grid-column: 1;
  }
}
</style>
