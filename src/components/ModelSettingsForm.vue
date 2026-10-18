<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import type { ModelSettings, ProviderId } from "@/db/types";
import { testConnection, type ConnectionReport } from "@/llm/connection";
import type { ModelInfo } from "@/llm/LlmClient";
import { defaultModelSettings, PROVIDERS, providerById } from "@/llm/providers";
import { llmClient, modelSettingsService } from "@/services";

const form = ref<ModelSettings>(defaultModelSettings());
const saved = ref<string>();
const loaded = ref(false);
onMounted(async () => {
  form.value = await modelSettingsService.get();
  saved.value = JSON.stringify(form.value);
  loaded.value = true;
});

const dirty = computed(() => loaded.value && JSON.stringify(form.value) !== saved.value);
const provider = computed(() => providerById(form.value.provider));

// A URL still at the old preset follows the new provider; one typed by hand stays.
function changeProvider(event: Event) {
  const next = (event.target as HTMLSelectElement).value as ProviderId;
  const url = form.value.baseUrl.trim();
  if (!url || url === provider.value.baseUrl) form.value.baseUrl = providerById(next).baseUrl;
  form.value.provider = next;
}

const models = ref<ModelInfo[]>([]);
const testing = ref(false);
const report = ref<ConnectionReport>();
let controller: AbortController | undefined;

async function test() {
  controller?.abort();
  controller = new AbortController();
  testing.value = true;
  report.value = undefined;
  try {
    const result = await testConnection(llmClient, form.value, controller.signal);
    report.value = result;
    if (result.models.length) models.value = result.models;
    if (result.model && !form.value.model.trim()) form.value.model = result.model;
    if (result.contextLength) form.value.contextLength = result.contextLength;
    if (result.tools !== undefined) form.value.tools = result.tools;
  } finally {
    testing.value = false;
  }
}

function stopTest() {
  controller?.abort();
}

watch(
  () => [form.value.baseUrl, form.value.provider, form.value.apiKey],
  () => (report.value = undefined),
);

const saving = ref(false);
const savedNote = ref(false);
const saveError = ref("");
async function save() {
  saving.value = true;
  saveError.value = "";
  try {
    form.value = await modelSettingsService.save(form.value);
    saved.value = JSON.stringify(form.value);
    savedNote.value = true;
  } catch (cause) {
    saveError.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    saving.value = false;
  }
}
watch(dirty, (changed) => changed && (savedNote.value = false));
</script>

<template>
  <form class="model-settings" @submit.prevent="save">
    <div class="field">
      <label class="label" for="model-provider">Provider</label>
      <select id="model-provider" class="text-input narrow" :value="form.provider" @change="changeProvider">
        <option v-for="option in PROVIDERS" :key="option.id" :value="option.id">{{ option.label }}</option>
      </select>
    </div>

    <div class="field">
      <label class="label" for="model-url">Endpoint URL</label>
      <input
        id="model-url"
        v-model="form.baseUrl"
        class="text-input"
        type="url"
        autocomplete="off"
        spellcheck="false"
        :placeholder="provider.baseUrl || 'https://example.com/v1'"
      />
    </div>

    <div class="field">
      <label class="label" for="model-key">API key</label>
      <input id="model-key" v-model="form.apiKey" class="text-input" type="password" autocomplete="off" spellcheck="false" />
      <p class="hint">
        {{ provider.local ? "Usually not needed for a local server. " : "" }}Stored unencrypted on this device, and sent only to
        this endpoint.
      </p>
    </div>

    <div class="field">
      <label class="label" for="model-name">Model</label>
      <input id="model-name" v-model="form.model" class="text-input" type="text" autocomplete="off" spellcheck="false" list="model-options" />
      <datalist id="model-options">
        <option v-for="model in models" :key="model.id" :value="model.id" />
      </datalist>
      <p class="hint">Test connection lists the server's models. A local server uses whichever model it has loaded.</p>
    </div>

    <div class="numbers">
      <div class="field">
        <label class="label" for="model-context">Context size</label>
        <input id="model-context" v-model.number="form.contextLength" class="text-input number" type="number" min="512" step="1" />
      </div>
      <div class="field">
        <label class="label" for="model-reply">Reply length</label>
        <input id="model-reply" v-model.number="form.replyTokens" class="text-input number" type="number" min="64" step="1" />
      </div>
    </div>
    <p class="hint">In tokens. The reply length is held back from the context size, so a long prompt can't crowd out the answer.</p>

    <label class="check"><input v-model="form.tools" type="checkbox" /> Uses tools</label>
    <p class="hint">Lets the Assistant look up pages as it writes. Without tools, it works from auto-context alone.</p>

    <div class="actions">
      <button v-if="testing" class="button secondary" type="button" @click="stopTest">Stop test</button>
      <button v-else class="button secondary" type="button" :disabled="!form.baseUrl.trim()" @click="test">Test connection</button>
      <button class="button" type="submit" :disabled="!dirty || saving">{{ saving ? "Saving…" : "Save" }}</button>
    </div>

    <p v-if="testing" class="status" role="status">Testing… a local model may take a moment to answer.</p>
    <div v-else-if="report?.error" class="report" role="alert">
      <p class="form-error">{{ report.error.message }}</p>
      <p class="hint">{{ report.error.help }}</p>
    </div>
    <p v-else-if="report" class="status ok" role="status">
      Connected{{ report.model ? ` to ${report.model}` : "" }}.
      {{ report.contextLength ? `Context size ${report.contextLength.toLocaleString()} tokens.` : "The server didn't say its context size." }}
      {{ report.tools ? "Tools work." : "Tools didn't work, so the Assistant will use auto-context only." }}
      <template v-if="dirty"> Save to keep these.</template>
    </p>
    <p v-if="saveError" class="form-error" role="alert">{{ saveError }}</p>
    <p v-else-if="savedNote && !dirty" class="status" role="status">Saved.</p>
  </form>
</template>

<style scoped>
.model-settings {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 32rem;
  margin-top: 0.75rem;
}

.field {
  display: flex;
  flex-direction: column;
}

.label {
  margin-bottom: 0.35rem;
  font-weight: 600;
}

.narrow {
  align-self: flex-start;
  width: auto;
}

.numbers {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1.5rem;
}

.number {
  width: 9rem;
}

.numbers + .hint {
  margin-top: -0.4rem;
}

.check {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 600;
}

.check + .hint {
  margin-top: -0.4rem;
}

.hint {
  margin: 0.35rem 0 0;
  color: var(--color-muted);
  font-size: 0.9rem;
}

.actions {
  display: flex;
  gap: 0.5rem;
}

.status,
.report p {
  margin: 0;
}

.ok::before {
  content: "✓ ";
  color: var(--color-success);
}
</style>
