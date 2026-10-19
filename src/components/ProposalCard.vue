<script setup lang="ts">
import { createPatch } from "diff";
import { computed, defineAsyncComponent, ref, useId } from "vue";
import type { AgentRun } from "@/db/types";
import { applySections, sectionContent } from "@/markdown/sections";
import { titleParam } from "@/router/params";
import { reviewService, runOrchestrator } from "@/services";
import { sectionTag, type SectionTag } from "@/services/ReviewService";
import DiffView from "./DiffView.vue";
import PageContent from "./PageContent.vue";

const MarkdownEditor = defineAsyncComponent(() => import("./MarkdownEditor.vue"));

const props = defineProps<{
  run: AgentRun;
  index: number;
  // The page as it stands, or the text a new page will start from.
  body: string;
  reply?: string;
}>();

const id = useId();
const section = computed(() => props.run.sections[props.index]!);
const view = ref<"changes" | "preview">("changes");
const editing = ref(false);
const edited = ref("");
const retrying = ref(false);
const note = ref("");
const busy = ref(false);
const error = ref("");

const STATUS_LABELS = {
  pending: "Waiting",
  writing: "Writing…",
  proposed: "Proposed",
  accepted: "Accepted",
  discarded: "Discarded",
  failed: "Couldn't be used",
} as const;

// The diff shows the section as accepting would write it, so blocks the section keeps show as unchanged.
const diff = computed(() => {
  const { heading, markdown = "" } = section.value;
  const plan = props.run.sections.map((other) => other.heading);
  const after = sectionContent(applySections(props.body, [{ heading, markdown }], plan), heading) ?? markdown;
  return createPatch(heading, withNewline(sectionContent(props.body, heading) ?? ""), withNewline(after));
});
const tag = computed(() => sectionTag(section.value.markdown ?? ""));
const showTag = computed(() => props.run.mode === "liberal" || tag.value !== "none");
const TAGS: { value: SectionTag; label: string }[] = [
  { value: "maybe", label: "Idea" },
  { value: "soft", label: "Likely" },
  { value: "hard", label: "Canon" },
  { value: "none", label: "Untagged" },
];

function withNewline(text: string): string {
  return text && !text.endsWith("\n") ? `${text}\n` : text;
}

async function act(action: () => Promise<unknown>) {
  busy.value = true;
  error.value = "";
  try {
    await action();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}

function startEdit() {
  edited.value = section.value.markdown ?? "";
  editing.value = true;
  retrying.value = false;
}

const saveEdit = () =>
  act(async () => {
    await reviewService.edit(props.run.id, props.index, edited.value);
    editing.value = false;
  });

const retry = () =>
  act(async () => {
    await runOrchestrator.retrySection(props.run.id, props.index, note.value);
    retrying.value = false;
    note.value = "";
  });

const accept = () => act(() => reviewService.accept(props.run.id, [props.index]));
const discard = () => act(() => reviewService.discard(props.run.id, props.index));
const retag = (event: Event) => act(() => reviewService.retag(props.run.id, props.index, (event.target as HTMLSelectElement).value as SectionTag));
</script>

<template>
  <section class="proposal" :class="section.status" :aria-labelledby="`${id}-heading`">
    <header class="proposal-header">
      <h2 :id="`${id}-heading`">{{ section.heading }}</h2>
      <span class="status">{{ STATUS_LABELS[section.status] }}</span>
    </header>

    <template v-if="section.status === 'writing'">
      <p v-if="!reply" class="muted">The Assistant is reading up before it writes.</p>
      <pre v-else class="streaming">{{ reply }}</pre>
    </template>

    <template v-else-if="section.status === 'failed'">
      <p class="form-error">{{ section.problem ?? "The reply couldn't be used." }}</p>
      <details v-if="section.raw">
        <summary>The reply as it came</summary>
        <pre class="raw">{{ section.raw }}</pre>
      </details>
    </template>

    <template v-else-if="section.status === 'proposed'">
      <p v-if="section.unknownLinks?.length" class="flag">
        Links to pages that don't exist:
        <template v-for="(link, linkIndex) in section.unknownLinks" :key="link.title">
          <template v-if="linkIndex > 0">; </template>
          <RouterLink class="wikilink new" :to="{ name: 'page', params: { title: titleParam(link.title) } }">{{ link.title }}</RouterLink>
          <template v-if="link.closest.length"> (did you mean {{ link.closest.join(" or ") }}?)</template>
        </template>
      </p>

      <div v-if="editing" class="editor">
        <MarkdownEditor v-model="edited" :wiki-id="run.wikiId" :label="`Edit ${section.heading}`" @submit="saveEdit" @cancel="editing = false" />
        <div class="actions">
          <button class="button" type="button" :disabled="busy || !edited.trim()" @click="saveEdit">Save edit</button>
          <button class="button secondary" type="button" @click="editing = false">Cancel</button>
        </div>
      </div>
      <template v-else>
        <div class="view-switch" role="group" aria-label="Show">
          <button type="button" :aria-pressed="view === 'changes'" @click="view = 'changes'">Changes</button>
          <button type="button" :aria-pressed="view === 'preview'" @click="view = 'preview'">Preview</button>
        </div>
        <DiffView v-if="view === 'changes'" :diff="diff" />
        <PageContent v-else class="preview" :wiki-id="run.wikiId" :markdown="section.markdown ?? ''" preview />
      </template>

      <label v-if="showTag && !editing" class="tag">
        Tagged as
        <select class="text-input" :value="tag" :disabled="busy" @change="retag">
          <option v-for="option in TAGS" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </label>
    </template>

    <p v-else-if="section.status === 'pending'" class="muted">Not written yet.</p>

    <form v-if="retrying" class="retry" @submit.prevent="retry">
      <label class="label" :for="`${id}-note`">What should change?</label>
      <textarea :id="`${id}-note`" v-model="note" class="text-input" rows="2" placeholder="Optional, such as &quot;shorter, and mention the flood&quot;" />
      <div class="actions">
        <button class="button" type="submit" :disabled="busy">Retry</button>
        <button class="button secondary" type="button" @click="retrying = false">Cancel</button>
      </div>
    </form>

    <div v-else-if="!editing && (section.status === 'proposed' || section.status === 'failed')" class="actions">
      <button v-if="section.status === 'proposed'" class="button" type="button" :disabled="busy" @click="accept">Accept</button>
      <button v-if="section.status === 'proposed'" class="button secondary" type="button" :disabled="busy" @click="startEdit">Edit</button>
      <button class="button secondary" type="button" :disabled="busy" @click="retrying = true">
        {{ section.status === "failed" ? "Retry" : "Retry with note" }}
      </button>
      <button class="button secondary" type="button" :disabled="busy" @click="discard">Discard</button>
    </div>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.proposal {
  padding: 1rem 0 1.25rem;
  border-top: 1px solid var(--color-border);
}

.proposal-header {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
}

h2 {
  margin: 0 0 0.75rem;
  font-size: 1.25rem;
}

.status {
  color: var(--color-muted);
  font-size: 0.85rem;
}

.accepted .status {
  color: var(--color-link);
}

.failed .status {
  color: var(--color-danger);
}

.muted {
  color: var(--color-muted);
}

.streaming,
.raw {
  max-height: 20rem;
  overflow: auto;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  white-space: pre-wrap;
  font-size: 0.85rem;
}

.flag {
  margin: 0 0 0.75rem;
  font-size: 0.9rem;
}

.view-switch {
  display: inline-flex;
  margin-bottom: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  overflow: hidden;
}

.view-switch button {
  padding: 0.25rem 0.75rem;
  border: 0;
  background: var(--color-surface);
  color: inherit;
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}

.view-switch button[aria-pressed="true"] {
  background: var(--color-header);
  color: var(--color-header-text);
}

.preview {
  padding: 0.5rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.tag {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
  font-size: 0.9rem;
}

.tag select {
  width: auto;
}

.retry {
  margin-top: 0.75rem;
}

.label {
  display: block;
  margin-bottom: 0.35rem;
  font-weight: 600;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
</style>
