<script setup lang="ts">
import { markdown } from "@codemirror/lang-markdown";
import { yamlFrontmatter } from "@codemirror/lang-yaml";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from "vue";

const props = defineProps<{ label: string }>();
const source = defineModel<string>({ required: true });

const host = useTemplateRef("host");
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
  <div ref="host" class="markdown-editor" />
</template>

<style scoped>
.markdown-editor {
  height: 100%;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}

.markdown-editor :deep(.cm-editor) {
  height: 100%;
  font-size: 0.9rem;
}

.markdown-editor :deep(.cm-editor.cm-focused) {
  outline: 2px solid var(--color-link);
  outline-offset: -1px;
}

.markdown-editor :deep(.cm-scroller) {
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
}
</style>
