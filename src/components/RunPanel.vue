<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";
import { useLiveQuery } from "@/composables/useLiveQuery";
import type { AgentRun, RunSection, TranscriptEntry } from "@/db/types";
import { activityLabel } from "@/llm/RunOrchestrator";
import { reviewService, runOrchestrator } from "@/services";
import { useRunsStore } from "@/stores/runs";
import { relativeTime } from "@/utils/relativeTime";

const props = defineProps<{ wikiId: string }>();

const runs = useRunsStore();
const { panelOpen, selectedRunId, details, approveEach } = storeToRefs(runs);
const recent = useLiveQuery((wikiId) => reviewService.list(wikiId), () => props.wikiId);

// The newest run is shown until another is picked.
const run = computed(() => recent.value?.find((candidate) => candidate.id === selectedRunId.value) ?? recent.value?.[0]);
watch(
  () => props.wikiId,
  () => (selectedRunId.value = undefined),
);
const activity = computed(() => (run.value ? runs.activity.get(run.value.id) : undefined));
const finished = computed(() => run.value?.sections.filter((section) => section.status !== "pending" && section.status !== "writing").length ?? 0);

const STATUS_LINES: Record<AgentRun["status"], string> = {
  running: "Writing",
  reviewing: "Ready for review",
  done: "Reviewed",
  interrupted: "Interrupted",
  error: "Stopped",
};
const statusLine = computed(() => {
  if (!run.value) return "";
  if (run.value.status === "running") return activity.value?.text ?? "Starting";
  if (run.value.status === "error") return `Stopped: ${run.value.error ?? "something went wrong"}`;
  return STATUS_LINES[run.value.status];
});

const SECTION_MARKS: Record<RunSection["status"], string> = {
  pending: "○",
  writing: "◐",
  proposed: "●",
  accepted: "✓",
  discarded: "–",
  failed: "✕",
};
const SECTION_LABELS: Record<RunSection["status"], string> = {
  pending: "waiting",
  writing: "writing",
  proposed: "ready for review",
  accepted: "accepted",
  discarded: "discarded",
  failed: "couldn't be used",
};

const message = ref("");
const sent = ref(false);

async function sendMessage() {
  if (!run.value || !message.value.trim()) return;
  if (run.value.status === "running") {
    runOrchestrator.send(run.value.id, message.value);
    sent.value = true;
  } else {
    await runOrchestrator.resume(run.value.id, message.value);
  }
  message.value = "";
}
watch(run, () => (sent.value = false));

const canContinue = computed(
  () => (run.value?.status === "interrupted" || run.value?.status === "error") && run.value.sections.some((section) => section.status === "pending"),
);

type ToolEntry = Extract<TranscriptEntry, { kind: "tool-call" }>;
const toolTitle = (entry: ToolEntry) => `${activityLabel(entry.name, entry.args)}${entry.repeat ? ` ×${entry.repeat}` : ""}`;
const sectionName = (entry: TranscriptEntry) => (entry.section === undefined ? "Plan" : (run.value?.sections[entry.section]?.heading ?? ""));
const pretty = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value, null, 2));
const ROLE_LABELS = { system: "Instructions", user: "Request", assistant: "Reply" } as const;
</script>

<template>
  <aside v-if="panelOpen" class="run-panel" aria-labelledby="run-panel-title">
    <header class="panel-header">
      <h2 id="run-panel-title">Assistant</h2>
      <label class="details-toggle">
        <input v-model="details" type="checkbox" />
        Details
      </label>
      <button class="close" type="button" aria-label="Close the Assistant panel" @click="panelOpen = false">×</button>
    </header>

    <section v-if="run" class="current" aria-label="Current run">
      <p class="run-title">
        <RouterLink :to="{ name: 'review', params: { wikiId, runId: run.id } }">{{ run.pageTitle }}</RouterLink>
        <span class="muted"> · {{ run.kind === "fill-template" ? "Fill template" : "Draft" }}</span>
      </p>
      <p class="status-line" role="status">{{ statusLine }}</p>
      <p v-if="run.sections.length" class="progress">
        {{ finished }} of {{ run.sections.length }} sections
        <progress :value="finished" :max="run.sections.length" />
      </p>

      <ol class="checklist">
        <li v-for="(section, index) in run.sections" :key="index" :class="section.status">
          <span class="mark" aria-hidden="true">{{ SECTION_MARKS[section.status] }}</span>
          {{ section.heading }}
          <span class="visually-hidden">, {{ SECTION_LABELS[section.status] }}</span>
        </li>
      </ol>

      <div class="controls">
        <button v-if="run.status === 'running'" class="button secondary" type="button" @click="runOrchestrator.interrupt(run.id)">Interrupt</button>
        <button v-if="canContinue" class="button" type="button" @click="runOrchestrator.resume(run.id)">Continue</button>
        <RouterLink class="button secondary" :to="{ name: 'review', params: { wikiId, runId: run.id } }">Review</RouterLink>
      </div>
      <form v-if="run.status === 'running' || canContinue" class="message" @submit.prevent="sendMessage">
        <input
          v-model="message"
          class="text-input"
          type="text"
          :placeholder="run.status === 'running' ? 'Message for the next request' : 'Message, then continue'"
          aria-label="Message for the Assistant"
        />
        <button class="button secondary" type="submit" :disabled="!message.trim()">{{ run.status === "running" ? "Send" : "Continue" }}</button>
      </form>
      <p v-if="sent" class="muted small">Sent. It joins the Assistant's next request.</p>

      <div v-if="details" class="transcript">
        <h3>Transcript</h3>
        <template v-for="(entry, index) in run.transcript" :key="index">
          <p v-if="entry.kind === 'repair'" class="repair">
            <span class="entry-section">{{ sectionName(entry) }}</span>
            {{ entry.text }}
          </p>
          <details v-else-if="entry.kind === 'tool-call'" class="card" :class="{ error: entry.error }">
            <summary>
              <span class="entry-section">{{ sectionName(entry) }}</span>
              {{ toolTitle(entry) }}
              <span v-if="entry.repeat" class="badge">×{{ entry.repeat }}</span>
            </summary>
            <p class="card-label">{{ entry.name }}</p>
            <pre>{{ pretty(entry.args) }}</pre>
            <p class="card-label">Result</p>
            <pre>{{ entry.result }}</pre>
          </details>
          <details v-else class="card">
            <summary>
              <span class="entry-section">{{ sectionName(entry) }}</span>
              {{ ROLE_LABELS[entry.role] }}
            </summary>
            <pre>{{ entry.content || "(empty)" }}</pre>
          </details>
        </template>
      </div>
    </section>
    <p v-else class="muted">No runs yet. Use Draft from notes on a page or on the New page screen.</p>

    <label class="setting">
      <input v-model="approveEach" type="checkbox" />
      Approve each proposal before the next is written
    </label>

    <section v-if="recent && recent.length > 1" class="recent" aria-labelledby="recent-runs">
      <h3 id="recent-runs">Recent runs</h3>
      <ul>
        <li v-for="entry in recent" :key="entry.id">
          <button type="button" :aria-current="entry.id === run?.id" @click="selectedRunId = entry.id">
            {{ entry.pageTitle }}
            <span class="muted">· {{ STATUS_LINES[entry.status] }} · {{ relativeTime(entry.startedAt) }}</span>
          </button>
        </li>
      </ul>
    </section>
  </aside>
</template>

<style scoped>
.run-panel {
  position: fixed;
  top: var(--global-bar-height);
  right: 0;
  bottom: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: min(24rem, 100vw);
  padding: 1rem;
  overflow-y: auto;
  border-left: 1px solid var(--color-border);
  background: var(--color-surface);
  box-shadow: -4px 0 16px rgb(0 0 0 / 12%);
  font-size: 0.9rem;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

h2 {
  flex: 1;
  margin: 0;
  padding: 0;
  border: 0;
  font-size: 1.15rem;
}

h3 {
  margin: 0.5rem 0;
  font-size: 1rem;
}

.details-toggle,
.setting {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.close {
  border: 0;
  background: none;
  color: inherit;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
}

.run-title,
.status-line,
.progress {
  margin: 0;
}

.status-line {
  font-weight: 600;
}

.progress {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--color-muted);
}

.progress progress {
  flex: 1;
}

.checklist {
  margin: 0.5rem 0;
  padding: 0;
  list-style: none;
}

.checklist li {
  display: flex;
  gap: 0.5rem;
}

.mark {
  width: 1rem;
  text-align: center;
}

.writing,
.proposed {
  font-weight: 600;
}

.accepted .mark {
  color: var(--color-link);
}

.failed .mark {
  color: var(--color-danger);
}

.discarded {
  color: var(--color-muted);
  text-decoration: line-through;
}

.controls,
.message {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.message .text-input {
  flex: 1;
  width: auto;
}

.muted {
  color: var(--color-muted);
}

.small {
  margin: 0.25rem 0 0;
  font-size: 0.8rem;
}

.transcript {
  margin-top: 0.5rem;
}

.card {
  margin-bottom: 0.35rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.card.error {
  border-color: var(--color-danger);
}

.card summary {
  padding: 0.25rem 0.5rem;
  cursor: pointer;
}

.card pre {
  max-height: 16rem;
  margin: 0 0.5rem 0.5rem;
  overflow: auto;
  white-space: pre-wrap;
  font-size: 0.75rem;
}

.card-label {
  margin: 0.25rem 0.5rem;
  color: var(--color-muted);
  font-size: 0.75rem;
}

.entry-section {
  color: var(--color-muted);
  font-size: 0.75rem;
}

.entry-section::after {
  content: " ·";
}

.badge {
  padding: 0 0.35rem;
  border-radius: 999px;
  background: var(--color-danger);
  color: white;
  font-size: 0.75rem;
}

.repair {
  margin: 0 0 0.35rem;
  padding-left: 0.5rem;
  border-left: 3px solid var(--color-border);
  font-style: italic;
}

.recent ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.recent button {
  width: 100%;
  padding: 0.25rem 0;
  border: 0;
  background: none;
  color: var(--color-link);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.recent button[aria-current="true"] {
  font-weight: 600;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
