<script setup lang="ts">
import { ref, shallowRef } from "vue";
import { useRouter } from "vue-router";
import { vaultImporter } from "@/services";
import type { VaultScan } from "@/services/VaultImporter";
import AppDialog from "./AppDialog.vue";

const router = useRouter();
const input = ref<HTMLInputElement>();
const scanning = ref(false);
const error = ref("");

const scan = shallowRef<VaultScan>();
const open = ref(false);
const name = ref("");
const chosen = ref<string[]>([]);
const importing = ref(false);
const progress = ref("");
const importError = ref("");

// Reading the vault first lets you choose its tags before anything is written.
async function readFile() {
  const file = input.value?.files?.[0];
  if (!file) return;
  scanning.value = true;
  error.value = "";
  try {
    scan.value = await vaultImporter.scan(new Uint8Array(await file.arrayBuffer()), file.name);
    name.value = scan.value.name;
    chosen.value = scan.value.tags.map(({ key }) => key);
    importError.value = "";
    open.value = true;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    scanning.value = false;
    input.value!.value = "";
  }
}

async function runImport() {
  if (!scan.value || importing.value) return;
  importing.value = true;
  importError.value = "";
  progress.value = "";
  try {
    const wiki = await vaultImporter.importVault(scan.value, {
      name: name.value,
      categoryTags: chosen.value,
      onProgress: (done, total) => (progress.value = `Storing images: ${done} of ${total}`),
    });
    open.value = false;
    scan.value = undefined;
    await router.push({ name: "wiki", params: { wiki: wiki.slug } });
  } catch (cause) {
    importError.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    importing.value = false;
  }
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
</script>

<template>
  <div class="import-vault">
    <button class="button secondary" type="button" :disabled="scanning" @click="input?.click()">
      {{ scanning ? "Reading…" : "Import Obsidian vault" }}
    </button>
    <input ref="input" type="file" accept=".zip,application/zip" hidden @change="readFile" />
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>

    <AppDialog v-if="scan" v-model:open="open" :title="`Import ${scan.name}`">
      <form @submit.prevent="runImport">
        <p class="summary">
          {{ count(scan.notes.length, "note", "notes") }}, {{ count(scan.images.length, "image", "images") }}<template
            v-if="scan.templates.length"
            >, and {{ count(scan.templates.length, "template", "templates") }}</template
          >.
          <template v-if="scan.skipped">{{ count(scan.skipped, "other file is", "other files are") }} left out.</template>
        </p>
        <label class="label" for="vault-wiki-name">Wiki name</label>
        <input id="vault-wiki-name" v-model="name" class="text-input" type="text" autocomplete="off" required />

        <fieldset v-if="scan.tags.length" class="tags">
          <legend class="label">Tags to turn into categories</legend>
          <div class="tag-actions">
            <button class="link-button" type="button" @click="chosen = scan.tags.map(({ key }) => key)">All</button>
            <button class="link-button" type="button" @click="chosen = []">None</button>
          </div>
          <ul class="tag-list">
            <li v-for="tag in scan.tags" :key="tag.key">
              <label>
                <input v-model="chosen" type="checkbox" :value="tag.key" />
                #{{ tag.name }} <span class="count">{{ tag.count }}</span>
              </label>
            </li>
          </ul>
        </fieldset>
        <p class="note">Folders become categories too. Tags left unticked stay in the notes as they are.</p>

        <p v-if="importError" class="form-error" role="alert">{{ importError }}</p>
        <p v-else-if="importing && progress" class="note" role="status">{{ progress }}</p>
        <div class="dialog-actions">
          <button class="button secondary" type="button" :disabled="importing" @click="open = false">Cancel</button>
          <button class="button" type="submit" :disabled="importing || !name.trim()">{{ importing ? "Importing…" : "Import" }}</button>
        </div>
      </form>
    </AppDialog>
  </div>
</template>

<style scoped>
.import-vault > p {
  margin: 0.5rem 0 0;
}

.summary {
  margin-top: 0;
}

.label {
  display: block;
  margin-bottom: 0.35rem;
  font-weight: 600;
}

.tags {
  margin: 1rem 0 0;
  padding: 0;
  border: 0;
}

.tags legend {
  float: left;
  padding: 0;
}

.tag-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.tag-list {
  clear: both;
  max-height: 14rem;
  margin: 0.35rem 0 0;
  padding: 0.35rem 0.6rem;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  list-style: none;
}

.tag-list label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.count {
  color: var(--color-muted);
  font-size: 0.85rem;
}

.link-button {
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-link);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}

.note {
  margin: 0.5rem 0 0;
  color: var(--color-muted);
  font-size: 0.85rem;
}
</style>
