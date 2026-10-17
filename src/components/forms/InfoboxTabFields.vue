<script setup lang="ts">
import { ref } from "vue";
import type { InfoboxTab } from "@/markdown/fields";
import { assetService } from "@/services";
import { keyOf } from "@/utils/keys";
import AssetThumb from "./AssetThumb.vue";
import FieldRows from "./FieldRows.vue";

// Images and groups of one infobox tab; edits the given tab in place.
const props = defineProps<{ tab: InfoboxTab; wikiId: string }>();
const emit = defineEmits<{ submit: []; cancel: [] }>();

const status = ref("");

async function addImages(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = "";
  status.value = "Adding…";
  try {
    for (const file of files) {
      const asset = await assetService.addImage(props.wikiId, file, file.name);
      props.tab.images.push({ path: asset.path, caption: "" });
    }
    status.value = "";
  } catch (cause) {
    status.value = cause instanceof Error ? cause.message : String(cause);
  }
}

const removeAt = <T,>(list: T[], item: T) => list.splice(list.indexOf(item), 1);

function addGroup() {
  props.tab.groups.push({ label: "", fields: [{ label: "", value: "" }] });
}
</script>

<template>
  <div class="tab-fields">
    <div class="images">
      <div v-for="image in tab.images" :key="keyOf(image)" class="image-row">
        <AssetThumb :wiki-id="wikiId" :path="image.path" />
        <input v-model="image.caption" class="text-input" type="text" placeholder="Caption" :aria-label="`Caption for ${image.path}`" />
        <button type="button" class="remove" :aria-label="`Remove image ${image.path}`" title="Remove" @click="removeAt(tab.images, image)">×</button>
      </div>
      <label class="button secondary small">
        Add image
        <input type="file" accept="image/*" multiple hidden @change="addImages" />
      </label>
      <span v-if="status" class="status" role="status">{{ status }}</span>
    </div>

    <fieldset v-for="(group, index) in tab.groups" :key="keyOf(group)" class="group">
      <legend class="sr-only">Group {{ index + 1 }}</legend>
      <div class="group-header">
        <input v-model="group.label" class="text-input group-label" type="text" placeholder="Group name, like Biographical" :aria-label="`Group ${index + 1} name`" />
        <button type="button" class="remove" :aria-label="`Remove group ${group.label || index + 1}`" title="Remove group" @click="removeAt(tab.groups, group)">×</button>
      </div>
      <FieldRows :fields="group.fields" :wiki-id="wikiId" label-placeholder="Label" @submit="emit('submit')" @cancel="emit('cancel')" />
      <button type="button" class="button secondary small" @click="group.fields.push({ label: '', value: '' })">Add row</button>
    </fieldset>
    <button type="button" class="button secondary small" @click="addGroup">Add group</button>
  </div>
</template>

<style scoped>
.tab-fields {
  display: grid;
  gap: 0.6rem;
  justify-items: start;
}

.tab-fields > * {
  justify-self: stretch;
}

.tab-fields > .button {
  justify-self: start;
}

.images {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.image-row {
  display: flex;
  flex: 1 1 100%;
  align-items: center;
  gap: 0.5rem;
}

.group {
  display: grid;
  gap: 0.4rem;
  justify-items: start;
  margin: 0;
  padding: 0.6rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.group > * {
  justify-self: stretch;
}

.group > .button {
  justify-self: start;
}

.group-header {
  display: flex;
  gap: 0.4rem;
}

.group-label {
  padding: 0.3rem 0.45rem;
  font-weight: 700;
}

.small {
  padding: 0.25rem 0.7rem;
  font-size: 0.85rem;
}

.status {
  color: var(--color-muted);
  font-size: 0.85rem;
}

.remove {
  flex: none;
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

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
</style>
