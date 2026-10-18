<script setup lang="ts">
import { useTemplateRef } from "vue";
import MarkdownEditor from "./MarkdownEditor.vue";
import PageContent from "./PageContent.vue";

// Markdown source beside its live preview; clicking a preview block moves the cursor to its source.
defineProps<{ wikiId: string; label: string }>();
const emit = defineEmits<{ submit: [] }>();
const draft = defineModel<string>({ required: true });

const editor = useTemplateRef("editor");
</script>

<template>
  <div class="panes">
    <section class="pane" aria-labelledby="source-heading">
      <h2 id="source-heading" class="pane-label">Markdown</h2>
      <MarkdownEditor ref="editor" v-model="draft" class="source" :label="label" :wiki-id="wikiId" @submit="emit('submit')" />
    </section>
    <section class="pane" aria-labelledby="preview-heading">
      <h2 id="preview-heading" class="pane-label">Preview</h2>
      <div class="preview">
        <PageContent :wiki-id="wikiId" :markdown="draft" preview @locate="editor?.focusAt($event)" />
      </div>
    </section>
  </div>
</template>

<style scoped>
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
