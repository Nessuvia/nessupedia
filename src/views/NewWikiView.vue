<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import ImportVault from "@/components/ImportVault.vue";
import ImportZip from "@/components/ImportZip.vue";
import { useWikiStore } from "@/stores/wiki";

const store = useWikiStore();
const { wikis } = storeToRefs(store);
const router = useRouter();

const name = ref("");
const error = ref("");
const saving = ref(false);
const firstWiki = computed(() => wikis.value?.length === 0);

async function create() {
  saving.value = true;
  error.value = "";
  try {
    const wiki = await store.createWiki(name.value);
    await router.push({ name: "wiki", params: { wikiId: wiki.id } });
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    saving.value = false;
  }
}

document.title = "Create a wiki | OC Wiki";
</script>

<template>
  <main class="new-wiki content-card">
    <h1>{{ firstWiki ? "Create your first wiki" : "Create a wiki" }}</h1>
    <p v-if="firstWiki" class="intro">
      A wiki holds one universe: its characters, places, histories, and spinoffs. Everything stays on this device.
    </p>
    <form @submit.prevent="create">
      <label for="wiki-name">Wiki name</label>
      <input id="wiki-name" v-model="name" type="text" placeholder="e.g. Ashfall" required autofocus />
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="actions">
        <button type="submit" :disabled="saving || !name.trim()">Create wiki</button>
        <RouterLink v-if="!firstWiki && wikis" :to="{ name: 'home' }">Cancel</RouterLink>
      </div>
    </form>
    <section class="import" aria-labelledby="import-heading">
      <h2 id="import-heading">Or bring one in</h2>
      <p class="intro">Import a ZIP exported from OC Wiki, such as a backup or a wiki from another device, or a ZIP of an Obsidian vault.</p>
      <div class="import-buttons">
        <ImportZip />
        <ImportVault />
      </div>
    </section>
  </main>
</template>

<style scoped>
.new-wiki {
  max-width: 32rem;
  margin: 4rem auto;
}

.intro {
  color: var(--color-muted);
}

label {
  display: block;
  margin-bottom: 0.25rem;
  font-weight: 600;
}

input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font: inherit;
}

.error {
  color: var(--color-link-new);
}

.import {
  margin-top: 2.5rem;
}

.import-buttons {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0.75rem;
}

.import h2 {
  margin: 0;
  font-size: 1.1rem;
}

.actions {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-top: 1rem;
}

button {
  padding: 0.5rem 1rem;
  border: 0;
  border-radius: 4px;
  background: var(--color-header);
  color: var(--color-header-text);
  font: inherit;
  cursor: pointer;
}

button:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
