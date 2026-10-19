<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, ref, watchEffect } from "vue";
import ProposalCard from "@/components/ProposalCard.vue";
import { useLiveQuery } from "@/composables/useLiveQuery";
import { sectionContent } from "@/markdown/sections";
import { titleParam } from "@/router/params";
import { pageService, reviewService, runOrchestrator } from "@/services";
import { useRunsStore } from "@/stores/runs";
import { useWikiStore } from "@/stores/wiki";

const props = defineProps<{ wikiId: string; runId: string }>();

const { currentWiki } = storeToRefs(useWikiStore());
const runs = useRunsStore();
const run = useLiveQuery(async (runId) => (await reviewService.get(runId)) ?? null, () => props.runId);
const page = useLiveQuery(
  async ([pageId, title, wikiId]) => ((pageId ? await pageService.get(pageId) : await pageService.getByTitle(wikiId, title)) ?? null),
  () => [run.value?.pageId, run.value?.pageTitle ?? "", props.wikiId] as const,
);
const activity = computed(() => runs.activity.get(props.runId));
const proposed = computed(() => run.value?.sections.flatMap((section, index) => (section.status === "proposed" ? [index] : [])) ?? []);

const STATUS_LINES = {
  running: "Writing",
  reviewing: "Ready for review",
  done: "Reviewed",
  interrupted: "Interrupted",
  error: "Stopped",
} as const;
const statusLine = computed(() => {
  if (!run.value) return "";
  if (run.value.status === "running") return activity.value?.text ?? "Starting";
  if (run.value.status === "error") return `Stopped: ${run.value.error ?? "something went wrong"}`;
  return STATUS_LINES[run.value.status];
});

const message = ref("");
const busy = ref(false);
const error = ref("");

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

const acceptAll = () => act(() => reviewService.acceptAll(props.runId));
const carryOn = () =>
  act(async () => {
    await runOrchestrator.resume(props.runId, message.value);
    message.value = "";
  });

watchEffect(() => {
  document.title = [run.value ? `Review: ${run.value.pageTitle}` : "Review", currentWiki.value?.name].filter(Boolean).join(" | ");
});
</script>

<template>
  <article class="content-card review">
    <template v-if="run">
      <header class="review-header">
        <p class="kicker">{{ run.kind === "fill-template" ? "Fill template" : "Draft from notes" }} · {{ run.mode[0]!.toUpperCase() + run.mode.slice(1) }}</p>
        <h1>
          Review:
          <RouterLink v-if="page" :to="{ name: 'page', params: { wikiId, title: titleParam(page.title) } }">{{ page.title }}</RouterLink>
          <template v-else>{{ run.pageTitle }}</template>
        </h1>
        <p class="status-line" role="status">{{ statusLine }}</p>
        <p v-if="!page && run.kind === 'draft'" class="note">This page doesn't exist yet. Accepting a section creates it.</p>
        <div class="controls">
          <button v-if="run.status === 'running'" class="button secondary" type="button" @click="runOrchestrator.interrupt(run.id)">Interrupt</button>
          <template v-else-if="run.status === 'interrupted' || run.status === 'error'">
            <input v-model="message" class="text-input message" type="text" placeholder="Optional message for the Assistant" aria-label="Message for the Assistant" />
            <button
              v-if="run.sections.some((section) => section.status === 'pending')"
              class="button"
              type="button"
              :disabled="busy"
              @click="carryOn"
            >
              Continue
            </button>
          </template>
          <button class="button secondary" type="button" @click="runs.show(run.id)">Run details</button>
        </div>
      </header>

      <p v-if="run.sections.length === 0 && run.status === 'running'" class="note">Planning the sections…</p>
      <ProposalCard
        v-for="(section, index) in run.sections"
        :key="`${index}-${section.heading}`"
        :run="run"
        :index="index"
        :current="page ? sectionContent(page.body, section.heading) : undefined"
        :reply="activity?.section === index ? activity.reply : undefined"
      />

      <footer v-if="proposed.length > 1" class="review-footer">
        <button class="button" type="button" :disabled="busy" @click="acceptAll">Accept all {{ proposed.length }}</button>
        <span class="note">Accepted sections are saved together as one change by the Assistant.</span>
      </footer>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    </template>
    <template v-else-if="run === null">
      <h1>Run not found</h1>
      <p>This run was deleted, or is older than the 20 runs each wiki keeps.</p>
    </template>
  </article>
</template>

<style scoped>
.kicker {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.85rem;
}

h1 {
  margin: 0.25rem 0;
}

.status-line {
  margin: 0 0 0.5rem;
  font-weight: 600;
}

.note {
  margin: 0.25rem 0;
  color: var(--color-muted);
  font-size: 0.9rem;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin: 0.75rem 0 1rem;
}

.message {
  width: auto;
  flex: 1 1 16rem;
  max-width: 28rem;
}

.review-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);
}
</style>
