<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, onBeforeUnmount, ref, useTemplateRef, watch, watchEffect } from "vue";
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from "vue-router";
import MarkdownEditor from "@/components/MarkdownEditor.vue";
import PageContent from "@/components/PageContent.vue";
import { useLiveQuery } from "@/composables/useLiveQuery";
import { pageService } from "@/services";
import { useWikiStore } from "@/stores/wiki";

const props = defineProps<{ wikiId: string; title: string }>();

const router = useRouter();
const { currentWiki } = storeToRefs(useWikiStore());
const editor = useTemplateRef("editor");

const page = useLiveQuery(
  async ([wikiId, title]) => (await pageService.getByTitle(wikiId, title)) ?? null,
  () => [props.wikiId, props.title] as const,
);

// The draft loads once per page, so live updates to the stored page never overwrite typing.
const loadedId = ref<string>();
const base = ref("");
const draft = ref("");
const summary = ref("");
const minor = ref(false);
const saving = ref(false);
const error = ref("");

watch(page, (found) => {
  if (!found || found.id === loadedId.value) return;
  loadedId.value = found.id;
  base.value = found.body;
  draft.value = found.body;
  summary.value = "";
  minor.value = false;
});

const dirty = computed(() => loadedId.value !== undefined && draft.value !== base.value);

async function save() {
  if (!page.value || !dirty.value || saving.value) return;
  saving.value = true;
  error.value = "";
  try {
    const saved = await pageService.save(page.value.id, draft.value, { minor: minor.value, summary: summary.value.trim() });
    base.value = saved.body;
    await router.push({ name: "page", params: { wikiId: props.wikiId, title: saved.title } });
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    saving.value = false;
  }
}

const confirmDiscard = () => !dirty.value || window.confirm("Discard your unsaved changes?");
onBeforeRouteLeave(confirmDiscard);
onBeforeRouteUpdate(confirmDiscard);

const warnBeforeUnload = (event: BeforeUnloadEvent) => {
  if (dirty.value) event.preventDefault();
};
window.addEventListener("beforeunload", warnBeforeUnload);
onBeforeUnmount(() => window.removeEventListener("beforeunload", warnBeforeUnload));

watchEffect(() => {
  document.title = [`Editing ${page.value?.title ?? props.title}`, currentWiki.value?.name].filter(Boolean).join(" | ");
});
</script>

<template>
  <article class="content-card editor-card" @keydown.ctrl.s.prevent="save" @keydown.meta.s.prevent="save">
    <header class="editor-header">
      <h1>Editing {{ page?.title ?? title }}</h1>
    </header>

    <div v-if="page === null" class="missing">
      <p>This page doesn't exist yet.</p>
      <RouterLink :to="{ name: 'new-page', params: { wikiId }, query: { title } }">Create this page</RouterLink>
    </div>

    <template v-else-if="loadedId">
      <div class="panes">
        <section class="pane" aria-labelledby="source-heading">
          <h2 id="source-heading" class="pane-label">Markdown</h2>
          <MarkdownEditor ref="editor" v-model="draft" class="source" label="Page source" :wiki-id="wikiId" @submit="save" />
        </section>
        <section class="pane" aria-labelledby="preview-heading">
          <h2 id="preview-heading" class="pane-label">Preview</h2>
          <div class="preview">
            <PageContent :wiki-id="wikiId" :markdown="draft" preview @locate="editor?.focusAt($event)" />
          </div>
        </section>
      </div>

      <form class="save-bar" @submit.prevent="save">
        <label class="summary">
          <span>Summary</span>
          <input v-model="summary" type="text" placeholder="Briefly describe your changes" maxlength="200" />
        </label>
        <label class="minor">
          <input v-model="minor" type="checkbox" />
          Minor edit
        </label>
        <div class="actions">
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <RouterLink :to="{ name: 'page', params: { wikiId, title: page?.title ?? title } }">Cancel</RouterLink>
          <button type="submit" :disabled="!dirty || saving">{{ saving ? "Saving…" : "Save" }}</button>
        </div>
      </form>
    </template>
  </article>
</template>

<style scoped>
.editor-header h1 {
  margin: 0.25rem 0 1rem;
}

.panes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.pane-label {
  margin: 0 0 0.35rem;
  border: 0;
  color: var(--color-muted);
  font-family: var(--font-body);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.source,
.preview {
  height: max(24rem, calc(100vh - 22rem));
}

.preview {
  overflow-y: auto;
  padding: 0 1rem;
  border: 1px dashed var(--color-border);
}

.save-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1.5rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);
}

.summary {
  display: flex;
  flex: 1 1 20rem;
  align-items: center;
  gap: 0.5rem;
}

.summary span {
  font-weight: 600;
}

.summary input {
  flex: 1;
  min-width: 0;
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font: inherit;
}

.minor {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.actions {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-left: auto;
}

.error {
  margin: 0;
  color: var(--color-link-new);
}

button {
  padding: 0.5rem 1.25rem;
  border: 0;
  border-radius: 4px;
  background: var(--color-header);
  color: var(--color-header-text);
  font: inherit;
  cursor: pointer;
}

button:disabled {
  opacity: 0.6;
  cursor: default;
}

.missing p {
  color: var(--color-muted);
}

@media (max-width: 64rem) {
  .panes {
    grid-template-columns: minmax(0, 1fr);
  }

  .source {
    height: 50vh;
  }

  .preview {
    height: auto;
    max-height: 60vh;
  }
}
</style>
