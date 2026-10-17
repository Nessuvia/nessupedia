<script setup lang="ts">
import { reactive, watch } from "vue";
import { joinDirective, splitDirective } from "@/markdown/directiveSource";
import { parseFields, PRESSURE_FIELDS, serializeFields } from "@/markdown/fields";
import FieldRows from "./FieldRows.vue";

defineProps<{ wikiId: string }>();
const emit = defineEmits<{ submit: []; cancel: [] }>();
const source = defineModel<string>({ required: true });

const parts = splitDirective(source.value, "pressure");
const parsed = parseFields(parts.inner);
const fields = reactive(parsed.length > 0 ? parsed : PRESSURE_FIELDS.map((label) => ({ label, value: "" })));

watch(fields, () => (source.value = joinDirective({ ...parts, inner: serializeFields(fields) })), { deep: true });
</script>

<template>
  <div class="pressure-form">
    <p class="form-title">Pressure profile</p>
    <FieldRows :fields="fields" :wiki-id="wikiId" label-placeholder="Field" autofocus @submit="emit('submit')" @cancel="emit('cancel')" />
    <button type="button" class="button secondary add" @click="fields.push({ label: '', value: '' })">Add field</button>
  </div>
</template>

<style scoped>
.form-title {
  margin: 0 0 0.5rem;
  font-family: var(--font-heading);
  font-size: 1.1rem;
}

.add {
  margin-top: 0.5rem;
  padding: 0.3rem 0.8rem;
}
</style>
