<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import type { Wiki } from "@/db/types";
import { archiveService } from "@/services";

const router = useRouter();
const input = ref<HTMLInputElement>();
const importing = ref(false);
const error = ref("");
const imported = ref<Wiki[]>([]);

// One wiki opens straight away; several are listed so you can pick.
async function importFile() {
  const file = input.value?.files?.[0];
  if (!file) return;
  importing.value = true;
  error.value = "";
  imported.value = [];
  try {
    const wikis = await archiveService.importZip(new Uint8Array(await file.arrayBuffer()));
    if (wikis.length === 1) await router.push({ name: "wiki", params: { wiki: wikis[0]!.slug } });
    else imported.value = wikis;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    importing.value = false;
    input.value!.value = "";
  }
}
</script>

<template>
  <div class="import-zip">
    <button class="button secondary" type="button" :disabled="importing" @click="input?.click()">
      {{ importing ? "Importing…" : "Import ZIP" }}
    </button>
    <input ref="input" type="file" accept=".zip,application/zip" hidden @change="importFile" />
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <p v-else-if="imported.length" role="status">
      Imported
      <template v-for="(wiki, index) in imported" :key="wiki.id">
        <RouterLink :to="{ name: 'wiki', params: { wiki: wiki.slug } }">{{ wiki.name }}</RouterLink
        >{{ index < imported.length - 2 ? ", " : index === imported.length - 2 ? " and " : "." }}
      </template>
    </p>
  </div>
</template>

<style scoped>
.import-zip p {
  margin: 0.5rem 0 0;
}
</style>
