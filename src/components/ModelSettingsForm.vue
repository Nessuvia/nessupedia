<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import type { ModelSettings, ProviderId } from "@/db/types";
import { testConnection, type ConnectionReport } from "@/llm/connection";
import type { ModelInfo } from "@/llm/LlmClient";
import { defaultModelSettings, PROVIDERS, providerById } from "@/llm/providers";
import { catalogEntry, suggestTokenizer, TOKENIZER_CATALOG } from "@/llm/tokenizerCatalog";
import { llmClient, modelSettingsService, tokenizerService } from "@/services";

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
    if (!provider.value.exactTokens && !form.value.tokenizerId && suggested.value) form.value.tokenizerId = suggested.value.id;
  } finally {
    testing.value = false;
  }
}

function stopTest() {
  controller?.abort();
}

const downloaded = ref(new Set<string>());
onMounted(async () => (downloaded.value = new Set(await tokenizerService.downloadedIds())));

const suggested = computed(() => {
  const family = models.value.find((model) => model.id === form.value.model)?.tokenizer;
  return suggestTokenizer(form.value.model, family);
});
const tokenizerChoice = computed({
  get: () => form.value.tokenizerId ?? "",
  set: (id: string) => (form.value.tokenizerId = id || undefined),
});
const chosenTokenizer = computed(() => catalogEntry(form.value.tokenizerId));

const progress = ref<number>();
const downloading = ref(false);
const downloadError = ref("");
let downloadController: AbortController | undefined;

async function download() {
  const entry = chosenTokenizer.value;
  if (!entry) return;
  downloadController = new AbortController();
  downloading.value = true;
  progress.value = undefined;
  downloadError.value = "";
  try {
    await tokenizerService.download(entry, (fraction) => (progress.value = fraction), downloadController.signal);
    downloaded.value = new Set([...downloaded.value, entry.id]);
  } catch (cause) {
    if (!downloadController.signal.aborted) downloadError.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    downloading.value = false;
  }
}

async function removeDownload() {
  const entry = chosenTokenizer.value;
  if (!entry) return;
  await tokenizerService.remove(entry.id);
  downloaded.value = new Set([...downloaded.value].filter((id) => id !== entry.id));
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

    <div v-if="!provider.exactTokens" class="field">
      <label class="label" for="model-tokenizer">Tokenizer</label>
      <select id="model-tokenizer" v-model="tokenizerChoice" class="text-input narrow">
        <option value="">None: estimate</option>
        <option v-for="entry in TOKENIZER_CATALOG" :key="entry.id" :value="entry.id">
          {{ entry.label }}{{ downloaded.has(entry.id) ? " (downloaded)" : "" }}
        </option>
      </select>
      <p v-if="suggested && suggested.id !== form.tokenizerId" class="hint">
        {{ suggested.label }} looks like the match for this model.
        <button class="link-button" type="button" @click="form.tokenizerId = suggested.id">Use it</button>
      </p>
      <div v-if="chosenTokenizer && !downloaded.has(chosenTokenizer.id)" class="download">
        <template v-if="downloading">
          <progress :value="progress" max="1" :aria-label="`Downloading ${chosenTokenizer.label}`" />
          <button class="link-button" type="button" @click="downloadController?.abort()">Cancel</button>
        </template>
        <template v-else>
          <button class="button secondary" type="button" @click="download">Download {{ chosenTokenizer.label }}</button>
          <span class="hint">From Hugging Face, stored on this device. Counts are estimated until it's downloaded.</span>
        </template>
      </div>
      <p v-else-if="chosenTokenizer" class="hint">
        Counts use the {{ chosenTokenizer.label }} tokenizer.
        <button class="link-button" type="button" @click="removeDownload">Remove download</button>
      </p>
      <p v-if="downloadError" class="form-error" role="alert">{{ downloadError }}</p>
      <p v-if="!chosenTokenizer" class="hint">
        Counts are estimated at about 4 characters per token, so 10% of the context is held back to be safe.
      </p>
    </div>
    <p v-else class="hint">{{ provider.label }} counts tokens exactly with the loaded model.</p>

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

.download {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  margin-top: 0.5rem;
}

.download .hint {
  margin: 0;
}

.download progress {
  width: 14rem;
}

.link-button {
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-link);
  font: inherit;
  cursor: pointer;
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
