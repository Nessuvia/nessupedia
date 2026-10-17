<script setup lang="ts">
import { markdown } from "@codemirror/lang-markdown";
import { yamlFrontmatter } from "@codemirror/lang-yaml";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from "vue";
import { imagePasteAndDrop } from "@/editor/images";

const props = defineProps<{ label: string; wikiId: string }>();
const source = defineModel<string>({ required: true });

const host = useTemplateRef("host");
const status = ref("");
let view: EditorView | undefined;

onMounted(() => {
  view = new EditorView({
    parent: host.value!,
    state: EditorState.create({
      doc: source.value,
      extensions: [
        basicSetup,
        yamlFrontmatter({ content: markdown() }),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ "aria-label": props.label }),
        imagePasteAndDrop({ wikiId: () => props.wikiId, onStatus: (message) => (status.value = message) }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) source.value = update.state.doc.toString();
        }),
      ],
    }),
  });
  view.focus();
});

watch(source, (next) => {
  if (view && next !== view.state.doc.toString()) {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
  }
});

onBeforeUnmount(() => view?.destroy());
</script>

<template>
  <div class="markdown-editor">
    <div ref="host" class="host" />
    <p v-if="status" class="status" role="status">{{ status }}</p>
  </div>
</template>

<style scoped>
.markdown-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}

.host {
  flex: 1;
  min-height: 0;
}

.host :deep(.cm-editor) {
  height: 100%;
  font-size: 0.9rem;
}

.host :deep(.cm-editor.cm-focused) {
  outline: 2px solid var(--color-link);
  outline-offset: -1px;
}

.host :deep(.cm-scroller) {
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
}

.status {
  margin: 0;
  padding: 0.25rem 0.5rem;
  border-top: 1px solid var(--color-border);
  color: var(--color-muted);
  font-size: 0.8rem;
}
</style>
