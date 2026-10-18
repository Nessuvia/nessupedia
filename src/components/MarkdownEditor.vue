<script setup lang="ts">
import { markdown } from "@codemirror/lang-markdown";
import { yamlFrontmatter } from "@codemirror/lang-yaml";
import { EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from "vue";
import { wikiEditing } from "@/editor";

// Compact editors grow with their text and drop the gutter, for inline blocks and form fields.
const props = withDefaults(
  defineProps<{ label: string; wikiId: string; surroundingText?: string; compact?: boolean; autofocus?: boolean; placeholder?: string }>(),
  { autofocus: true },
);
const emit = defineEmits<{ submit: []; cancel: [] }>();
const source = defineModel<string>({ required: true });

const host = useTemplateRef("host");
const status = ref("");
let view: EditorView | undefined;

// Escape reaches this only after the autocomplete popup, which sits at a higher precedence, has closed.
const submitAndCancel = Prec.high(
  keymap.of([
    { key: "Mod-Enter", run: () => (emit("submit"), true) },
    { key: "Escape", run: () => (emit("cancel"), true) },
  ]),
);

onMounted(() => {
  view = new EditorView({
    parent: host.value!,
    state: EditorState.create({
      doc: source.value,
      extensions: [
        submitAndCancel,
        basicSetup,
        yamlFrontmatter({ content: markdown() }),
        EditorView.lineWrapping,
        ...(props.placeholder ? [placeholder(props.placeholder)] : []),
        EditorView.contentAttributes.of({ "aria-label": props.label }),
        wikiEditing({
          wikiId: () => props.wikiId,
          onStatus: (message) => (status.value = message),
          surroundingText: () => props.surroundingText ?? "",
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) source.value = update.state.doc.toString();
        }),
      ],
    }),
  });
  if (props.autofocus) {
    if (props.compact) view.dispatch({ selection: { anchor: view.state.doc.length } });
    view.focus();
  }
});

watch(source, (next) => {
  if (view && next !== view.state.doc.toString()) {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
  }
});

onBeforeUnmount(() => view?.destroy());

function focusAt(offset: number) {
  if (!view) return;
  const anchor = Math.min(offset, view.state.doc.length);
  view.dispatch({ selection: { anchor }, effects: EditorView.scrollIntoView(anchor, { y: "start", yMargin: 24 }) });
  view.focus();
}

defineExpose({ focusAt });
</script>

<template>
  <div class="markdown-editor" :class="{ compact }">
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

.compact {
  height: auto;
}

.compact .host :deep(.cm-editor) {
  height: auto;
  max-height: 60vh;
}

.compact .host :deep(.cm-gutters) {
  display: none;
}

.compact .host :deep(.cm-activeLine) {
  background: transparent;
}

.status {
  margin: 0;
  padding: 0.25rem 0.5rem;
  border-top: 1px solid var(--color-border);
  color: var(--color-muted);
  font-size: 0.8rem;
}
</style>
