import { defineStore } from "pinia";
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { useStoredRef } from "@/composables/useStoredRef";
import type { RunActivity, StartRunInput } from "@/llm/RunOrchestrator";
import { runOrchestrator } from "@/services";

// The run panel's state and what each run is doing right now, which only lives in memory.
export const useRunsStore = defineStore("runs", () => {
  const router = useRouter();
  const panelOpen = ref(false);
  const selectedRunId = ref<string>();
  const details = useStoredRef("oc-wiki:run-details", false);
  // Off: proposals keep arriving in the review while the run goes on. On: each waits for a decision first.
  const approveEach = useStoredRef("oc-wiki:approve-each", false);
  const activity = reactive(new Map<string, RunActivity>());

  runOrchestrator.onActivity((next) => {
    const previous = activity.get(next.runId);
    // Streaming text keeps the line the run last set, so "Drafting Background" stays while the reply grows.
    activity.set(next.runId, next.reply === undefined ? next : { ...next, text: previous?.text ?? next.text });
  });

  function show(runId: string) {
    selectedRunId.value = runId;
    panelOpen.value = true;
  }

  async function start(input: Omit<StartRunInput, "stepwise">) {
    const run = await runOrchestrator.start({ ...input, stepwise: approveEach.value });
    show(run.id);
    await router.push({ name: "review", params: { runId: run.id } });
    return run;
  }

  return { panelOpen, selectedRunId, details, approveEach, activity, show, start };
});
