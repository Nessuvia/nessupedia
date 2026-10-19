<script setup lang="ts">
import { ref, useId, watch } from "vue";
import { useLiveQuery } from "@/composables/useLiveQuery";
import type { Page } from "@/db/types";
import { modelSettingsService, templateService } from "@/services";
import { useRunsStore } from "@/stores/runs";
import AppDialog from "./AppDialog.vue";
import DraftForm, { type DraftInput } from "./DraftForm.vue";

const props = defineProps<{ page: Page }>();
const open = defineModel<boolean>("open", { required: true });

const runs = useRunsStore();
const id = useId();
const templates = useLiveQuery((wikiId) => templateService.list(wikiId), () => props.page.wikiId);
const configured = useLiveQuery(() => modelSettingsService.configured());

const draft = ref<DraftInput>({ notes: "", mode: "strict", rules: "" });
const templateId = ref("");
const starting = ref(false);
const error = ref("");

watch(open, (isOpen) => {
  if (!isOpen) return;
  templateId.value = props.page.templateId ?? "";
  error.value = "";
});

async function start() {
  starting.value = true;
  error.value = "";
  try {
    await runs.start({
      wikiId: props.page.wikiId,
      kind: "draft",
      pageId: props.page.id,
      pageTitle: props.page.title,
      mode: draft.value.mode,
      notes: draft.value.notes,
      rules: draft.value.rules,
      ...(templateId.value && { templateId: templateId.value }),
    });
    draft.value = { notes: "", mode: draft.value.mode, rules: "" };
    open.value = false;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    starting.value = false;
  }
}
</script>

<template>
  <AppDialog v-model:open="open" :title="`Draft ${page.title} from notes`" class="draft-dialog">
    <form @submit.prevent="start">
      <p v-if="configured === false" class="form-error" role="alert">
        The Assistant needs a model first.
        <RouterLink :to="{ name: 'wiki-settings', params: { wikiId: page.wikiId }, hash: '#settings-model' }" @click="open = false">
          Set one up in settings
        </RouterLink>.
      </p>
      <label class="label" :for="`${id}-template`">Sections</label>
      <select :id="`${id}-template`" v-model="templateId" class="text-input template">
        <option value="">Let the Assistant plan them</option>
        <option v-for="template in templates" :key="template.id" :value="template.id">From the {{ template.name }} template</option>
      </select>
      <p class="hint">Each section is proposed for review. Accepting one replaces the section with the same heading.</p>
      <DraftForm v-model="draft" />
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <div class="dialog-actions">
        <button class="button secondary" type="button" @click="open = false">Cancel</button>
        <button class="button" type="submit" :disabled="starting || configured === false">Start draft</button>
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

.template {
  width: auto;
}

.hint {
  margin: 0.35rem 0 1rem;
  color: var(--color-muted);
  font-size: 0.85rem;
}
</style>
