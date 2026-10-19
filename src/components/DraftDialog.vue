<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import { useLiveQuery } from "@/composables/useLiveQuery";
import type { Page } from "@/db/types";
import { bodySections } from "@/markdown/sections";
import { modelSettingsService, templateService } from "@/services";
import { useRunsStore } from "@/stores/runs";
import AppDialog from "./AppDialog.vue";
import DraftForm, { type DraftInput } from "./DraftForm.vue";

// Draft from notes rewrites the sections it plans; Fill template writes only the sections that hold nothing but hints.
const props = defineProps<{ page: Page; kind: "draft" | "fill-template" }>();
const open = defineModel<boolean>("open", { required: true });

const runs = useRunsStore();
const id = useId();
const templates = useLiveQuery((wikiId) => templateService.list(wikiId), () => props.page.wikiId);
const configured = useLiveQuery(() => modelSettingsService.configured());
const filling = computed(() => props.kind === "fill-template");
const emptySections = computed(() => bodySections(props.page.body).filter((section) => section.empty).map((section) => section.heading));

const draft = ref<DraftInput>({ notes: "", mode: "strict", rules: "" });
const templateId = ref("");
const starting = ref(false);
const error = ref("");

watch(open, (isOpen) => {
  if (!isOpen) return;
  templateId.value = props.page.templateId ?? "";
  error.value = "";
});

const canStart = computed(() => !starting.value && configured.value !== false && (!filling.value || emptySections.value.length > 0));

async function start() {
  if (!canStart.value) return;
  starting.value = true;
  error.value = "";
  try {
    await runs.start({
      wikiId: props.page.wikiId,
      kind: props.kind,
      pageId: props.page.id,
      pageTitle: props.page.title,
      mode: draft.value.mode,
      notes: draft.value.notes,
      rules: draft.value.rules,
      ...(!filling.value && templateId.value && { templateId: templateId.value }),
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
  <AppDialog v-model:open="open" :title="filling ? `Fill ${page.title}'s empty sections` : `Draft ${page.title} from notes`">
    <form @submit.prevent="start">
      <p v-if="configured === false" class="form-error" role="alert">
        The Assistant needs a model first.
        <RouterLink :to="{ name: 'wiki-settings', params: { wikiId: page.wikiId }, hash: '#settings-model' }" @click="open = false">
          Set one up in settings
        </RouterLink>.
      </p>
      <template v-if="filling">
        <p v-if="emptySections.length" class="hint">Fills {{ emptySections.join(", ") }}, following each section's hints.</p>
        <p v-else class="form-error">Every section on this page already has text. Fill template writes only sections that are empty or hold hints.</p>
      </template>
      <template v-else>
        <label class="label" :for="`${id}-template`">Sections</label>
        <select :id="`${id}-template`" v-model="templateId" class="text-input template">
          <option value="">Let the Assistant plan them</option>
          <option v-for="template in templates" :key="template.id" :value="template.id">From the {{ template.name }} template</option>
        </select>
        <p class="hint">Each section is proposed for review. Accepting one replaces the section with the same heading.</p>
      </template>
      <DraftForm
        v-model="draft"
        :notes-label="filling ? 'Instructions' : 'Notes'"
        :notes-placeholder="filling ? 'Optional: what to focus on, facts to use, the tone you want.' : undefined"
      />
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <div class="dialog-actions">
        <button class="button secondary" type="button" @click="open = false">Cancel</button>
        <button class="button" type="submit" :disabled="!canStart">{{ filling ? "Start filling" : "Start draft" }}</button>
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

.form-error {
  margin: 0 0 1rem;
}
</style>
