<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, ref, watch, watchEffect } from "vue";
import { useRouter } from "vue-router";
import SplitPanes from "@/components/SplitPanes.vue";
import { useLeaveGuard } from "@/composables/useLeaveGuard";
import { useLiveQuery } from "@/composables/useLiveQuery";
import { templateService } from "@/services";
import { useWikiStore } from "@/stores/wiki";
import { isBundled } from "@/templates";

const props = defineProps<{ wikiId: string; templateId: string }>();

const router = useRouter();
const { currentWiki } = storeToRefs(useWikiStore());

const template = useLiveQuery(
  async (id) => {
    const found = await templateService.get(id);
    return found && !isBundled(found) && found.wikiId === props.wikiId ? found : null;
  },
  () => props.templateId,
);

// Loads once, like the page editor, so a rename elsewhere doesn't reset the draft.
const loadedId = ref<string>();
const base = ref("");
const draft = ref("");
const saving = ref(false);
const error = ref("");

watch(template, (found) => {
  if (!found || found.id === loadedId.value) return;
  loadedId.value = found.id;
  base.value = found.body;
  draft.value = found.body;
});

const dirty = computed(() => loadedId.value !== undefined && draft.value !== base.value);
useLeaveGuard(dirty);

async function save() {
  if (!template.value || !dirty.value || saving.value) return;
  saving.value = true;
  error.value = "";
  try {
    const saved = await templateService.save(template.value.id, draft.value);
    base.value = saved.body;
    await router.push({ name: "templates" });
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    saving.value = false;
  }
}

watchEffect(() => {
  document.title = [`Editing template ${template.value?.name ?? ""}`.trim(), currentWiki.value?.name].filter(Boolean).join(" | ");
});
</script>

<template>
  <article class="content-card" @keydown.ctrl.s.prevent="save" @keydown.meta.s.prevent="save">
    <h1>Editing template {{ template?.name }}</h1>

    <div v-if="template === null">
      <p class="note">This template doesn't exist, or it's bundled with the app. Duplicate a bundled template to change it.</p>
      <RouterLink :to="{ name: 'templates' }">Back to templates</RouterLink>
    </div>

    <template v-else-if="loadedId">
      <p class="note">
        <code v-pre>{{title}}</code> becomes the new page's title. <code>&lt;!-- Hints --&gt;</code> show in the editor but not on the page.
        Frontmatter <code>description</code> shows on the template's card, and <code>optional</code> lists sections that start unchecked.
      </p>
      <SplitPanes v-model="draft" :wiki-id="wikiId" label="Template source" @submit="save" />
      <form class="save-bar" @submit.prevent="save">
        <div class="actions">
          <p v-if="error" class="form-error" role="alert">{{ error }}</p>
          <RouterLink :to="{ name: 'templates' }">Cancel</RouterLink>
          <button class="button" type="submit" :disabled="!dirty || saving">{{ saving ? "Saving…" : "Save" }}</button>
        </div>
      </form>
    </template>
  </article>
</template>

<style scoped>
h1 {
  margin: 0.25rem 0 0.75rem;
}

.note {
  margin: 0 0 1rem;
  color: var(--color-muted);
  font-size: 0.9rem;
}
</style>
