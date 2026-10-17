<script setup lang="ts">
import { onMounted, reactive, useTemplateRef, watch } from "vue";
import { joinDirective, splitDirective } from "@/markdown/directiveSource";
import { emptyTab, parseInfobox, serializeInfobox } from "@/markdown/fields";
import { keyOf } from "@/utils/keys";
import InfoboxTabFields from "./InfoboxTabFields.vue";

defineProps<{ wikiId: string }>();
const emit = defineEmits<{ submit: []; cancel: [] }>();
const source = defineModel<string>({ required: true });

const parts = splitDirective(source.value, "infobox");
const data = reactive(parseInfobox(parts.inner));

watch(data, () => (source.value = joinDirective({ ...parts, inner: serializeInfobox(data) })), { deep: true });

const titleInput = useTemplateRef("title");
onMounted(() => titleInput.value?.focus());

function addTab() {
  data.tabs.push(emptyTab(data.tabs.length === 0 ? "Default" : ""));
}

function removeTab(index: number) {
  data.tabs.splice(index, 1);
}
</script>

<template>
  <div class="infobox-form">
    <label class="title">
      <span>Infobox title</span>
      <input ref="title" v-model="data.title" class="text-input" type="text" placeholder="Usually the full name" />
    </label>

    <section class="section" aria-label="Shown under every tab">
      <p v-if="data.tabs.length > 0" class="section-note">Shown under every tab</p>
      <InfoboxTabFields :tab="data.shared" :wiki-id="wikiId" @submit="emit('submit')" @cancel="emit('cancel')" />
    </section>

    <section v-for="(tab, index) in data.tabs" :key="keyOf(tab)" class="section tab" :aria-label="`Tab ${tab.label || index + 1}`">
      <div class="tab-header">
        <input v-model="tab.label" class="text-input" type="text" placeholder="Tab name, like Young or Adult" :aria-label="`Tab ${index + 1} name`" />
        <button type="button" class="button secondary small" @click="removeTab(index)">Remove tab</button>
      </div>
      <InfoboxTabFields :tab="tab" :wiki-id="wikiId" @submit="emit('submit')" @cancel="emit('cancel')" />
    </section>

    <button type="button" class="button secondary small" @click="addTab">Add tab</button>
  </div>
</template>

<style scoped>
.infobox-form {
  display: grid;
  gap: 0.75rem;
  justify-items: start;
}

.infobox-form > * {
  justify-self: stretch;
}

.infobox-form > .button {
  justify-self: start;
}

.title {
  display: grid;
  gap: 0.25rem;
  font-weight: 600;
}

.section {
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-page);
}

.section-note {
  margin: 0 0 0.5rem;
  color: var(--color-muted);
  font-size: 0.85rem;
  font-weight: 600;
}

.tab-header {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.6rem;
}

.tab-header .text-input {
  font-weight: 700;
}

.small {
  padding: 0.25rem 0.7rem;
  font-size: 0.85rem;
  white-space: nowrap;
}
</style>
