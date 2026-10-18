<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Continuity } from "@/db/types";
import { continuityNameError, findContinuity } from "@/markdown/versions";
import { continuityService } from "@/services";
import AppDialog from "./AppDialog.vue";

// Adds a continuity, or edits one when given. Renaming one renames its versions too.
const props = defineProps<{ wikiId: string; continuities: Continuity[]; continuity?: Continuity; versionCount?: number }>();
const open = defineModel<boolean>("open", { required: true });

const name = ref("");
const description = ref("");
const busy = ref(false);
const error = ref("");

watch(
  open,
  (isOpen) => {
    if (!isOpen) return;
    name.value = props.continuity?.name ?? "";
    description.value = props.continuity?.description ?? "";
    error.value = "";
  },
  { immediate: true },
);

const problem = computed(() => {
  if (!name.value.trim()) return undefined;
  const clash = findContinuity(props.continuities, name.value);
  if (clash && clash.id !== props.continuity?.id) return `A continuity named "${clash.name}" already exists.`;
  return continuityNameError(name.value);
});
const renaming = computed(() => !!props.continuity && name.value.trim() !== props.continuity.name);

async function save() {
  if (!name.value.trim() || problem.value || busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    if (!props.continuity) {
      await continuityService.create(props.wikiId, name.value, description.value);
    } else {
      if (renaming.value) await continuityService.rename(props.wikiId, props.continuity.id, name.value);
      await continuityService.describe(props.wikiId, props.continuity.id, description.value);
    }
    open.value = false;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AppDialog v-model:open="open" :title="continuity ? `Edit ${continuity.name}` : 'Add a continuity'">
    <form @submit.prevent="save">
      <label class="label" for="continuity-name">Name</label>
      <input id="continuity-name" v-model="name" class="text-input" type="text" placeholder="e.g. Noir AU" autocomplete="off" autofocus />
      <p v-if="problem" class="form-error" role="alert">{{ problem }}</p>
      <p v-else-if="renaming && versionCount" class="note">
        Its {{ versionCount }} {{ versionCount === 1 ? "version is" : "versions are" }} renamed to match, and links to them follow.
      </p>

      <label class="label description" for="continuity-description">What changes across it</label>
      <textarea id="continuity-description" v-model="description" class="text-input" rows="3" placeholder="e.g. Set in 1940s Harrow City; magic is outlawed." />
      <p class="note">Shown on every version's banner.</p>

      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <div class="dialog-actions">
        <button class="button secondary" type="button" @click="open = false">Cancel</button>
        <button class="button" type="submit" :disabled="!name.trim() || !!problem || busy">{{ continuity ? "Save" : "Add continuity" }}</button>
      </div>
    </form>
  </AppDialog>
</template>

<style scoped>
.label {
  display: block;
  margin-bottom: 0.35rem;
  font-weight: 600;
}

.description {
  margin-top: 1rem;
}

textarea {
  resize: vertical;
}

.note {
  margin: 0.35rem 0 0;
  color: var(--color-muted);
  font-size: 0.85rem;
}
</style>
