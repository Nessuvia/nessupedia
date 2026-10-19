<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from "vue";
import { useLeaveGuard } from "@/composables/useLeaveGuard";
import { hintText } from "@/markdown/hints";
import CanonForm from "./forms/CanonForm.vue";
import InfoboxForm from "./forms/InfoboxForm.vue";
import PressureForm from "./forms/PressureForm.vue";
import MarkdownEditor from "./MarkdownEditor.vue";

const props = defineProps<{
  wikiId: string;
  kind: string;
  source: string;
  surroundingText: string;
  saving: boolean;
  error: string;
}>();
const emit = defineEmits<{ save: [text: string, minor: boolean]; cancel: [] }>();

const FORMS = { infobox: InfoboxForm, pressure: PressureForm, canon: CanonForm } as const;
const form = computed(() => FORMS[props.kind as keyof typeof FORMS]);
const label = computed(() => (/^h[1-6]$/.test(props.kind) ? "Heading" : "Block markdown"));

// A hint opens empty with its text as the placeholder; what's written replaces it, and nothing keeps it.
const hint = computed(() => (props.kind === "hint" ? hintText(props.source) : undefined));

const draft = ref(hint.value ? "" : props.source);
const minor = ref(false);
const root = useTemplateRef("root");

const unchanged = computed(() => draft.value === props.source || (!!hint.value && !draft.value.trim()));

// A click outside starts the save before the click navigates, so a save in progress doesn't ask.
useLeaveGuard(computed(() => !unchanged.value && !props.saving));

function submit() {
  if (props.saving) return;
  if (unchanged.value) return emit("cancel");
  emit("save", draft.value, minor.value);
}

// Keys from inside CodeMirror arrive already handled; these cover the form's plain inputs.
function onKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented) return;
  if (event.key === "Escape") {
    event.preventDefault();
    emit("cancel");
  } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    submit();
  }
}

// Clicking anywhere outside saves, like leaving a field. Elements removed mid-click, such as a row's
// remove button, are no longer inside the editor by then, so only connected targets count.
function onPointerDown(event: PointerEvent) {
  const target = event.target as Node;
  if (target.isConnected && !root.value?.contains(target)) submit();
}

onMounted(() => document.addEventListener("pointerdown", onPointerDown));
onBeforeUnmount(() => document.removeEventListener("pointerdown", onPointerDown));
</script>

<template>
  <div ref="root" class="block-editor" :class="`block-editor-${kind}`" @keydown="onKeydown">
    <component :is="form" v-if="form" v-model="draft" :wiki-id="wikiId" @submit="submit" @cancel="emit('cancel')" />
    <MarkdownEditor
      v-else
      v-model="draft"
      compact
      :label="label"
      :wiki-id="wikiId"
      :surrounding-text="surroundingText"
      :placeholder="hint"
      @submit="submit"
      @cancel="emit('cancel')"
    />
    <div class="bar">
      <span class="hint">Ctrl+Enter saves · Esc cancels</span>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <label class="minor">
        <input v-model="minor" type="checkbox" />
        Minor edit
      </label>
      <button class="button secondary" type="button" @click="emit('cancel')">Cancel</button>
      <button class="button" type="button" :disabled="saving" @click="submit">{{ saving ? "Saving…" : "Save" }}</button>
    </div>
  </div>
</template>

<style scoped>
.block-editor {
  display: flow-root;
  margin: 0.75rem 0;
  padding: 0.75rem;
  border: 1px solid var(--color-link);
  border-radius: 6px;
  background: var(--color-surface);
  box-shadow: 0 2px 10px rgb(0 0 0 / 8%);
  font-family: var(--font-body);
  font-size: 1rem;
}

.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem 0.9rem;
  margin-top: 0.6rem;
}

.hint {
  margin-right: auto;
  color: var(--color-muted);
  font-size: 0.8rem;
}

.bar .form-error {
  flex-basis: 100%;
  margin: 0;
  order: -1;
}

.minor {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.9rem;
}

.button {
  padding: 0.35rem 1rem;
}
</style>
