<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, ref, watch, watchEffect } from "vue";
import { useRouter } from "vue-router";
import { useLiveQuery } from "@/composables/useLiveQuery";
import { titleKey } from "@/markdown/wikilinks";
import { pageService } from "@/services";
import { titleError } from "@/services/PageService";
import { useWikiStore } from "@/stores/wiki";

const props = defineProps<{ wikiId: string; initialTitle?: string }>();

const router = useRouter();
const { currentWiki } = storeToRefs(useWikiStore());

const title = ref("");
watch(
  () => props.initialTitle,
  (initial) => (title.value = initial ?? ""),
  { immediate: true },
);
const saving = ref(false);
const saveError = ref("");

const existing = useLiveQuery(
  async ([wikiId, wanted]) => (wanted.trim() ? ((await pageService.getByTitle(wikiId, wanted)) ?? null) : null),
  () => [props.wikiId, title.value] as const,
);
const formatError = computed(() => (title.value.trim() ? titleError(title.value) : undefined));
const viaAlias = computed(() => existing.value && existing.value.titleKey !== titleKey(title.value));
const canCreate = computed(() => !!title.value.trim() && !formatError.value && existing.value === null && !saving.value);

async function create() {
  if (!canCreate.value) return;
  saving.value = true;
  saveError.value = "";
  try {
    const page = await pageService.create({ wikiId: props.wikiId, title: title.value });
    await router.push({ name: "edit-page", params: { wikiId: props.wikiId, title: page.title } });
  } catch (cause) {
    saveError.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    saving.value = false;
  }
}

watchEffect(() => {
  document.title = ["Create a page", currentWiki.value?.name].filter(Boolean).join(" | ");
});
</script>

<template>
  <article class="content-card">
    <h1>Create a page</h1>
    <form @submit.prevent="create">
      <label class="field-label" for="page-title">Title</label>
      <input id="page-title" v-model="title" type="text" placeholder="e.g. Mira" autocomplete="off" autofocus />
      <p v-if="formatError" class="problem" role="alert">{{ formatError }}</p>
      <p v-else-if="existing" class="problem" role="alert">
        {{ viaAlias ? `"${title.trim()}" is another name for` : "A page with this title already exists:" }}
        <RouterLink :to="{ name: 'page', params: { wikiId, title: existing.title } }">{{ existing.title }}</RouterLink>.
      </p>

      <fieldset class="starts">
        <legend class="field-label">Start from</legend>
        <label class="start-card">
          <input type="radio" name="start" value="blank" checked />
          <strong>Blank</strong>
          <span>An empty page.</span>
        </label>
      </fieldset>

      <p v-if="saveError" class="problem" role="alert">{{ saveError }}</p>
      <button type="submit" :disabled="!canCreate">Create page</button>
    </form>
  </article>
</template>

<style scoped>
form {
  max-width: 36rem;
}

.field-label {
  display: block;
  margin-bottom: 0.35rem;
  font-weight: 600;
}

input[type="text"] {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font: inherit;
}

.problem {
  margin: 0.5rem 0 0;
  color: var(--color-link-new);
}

.starts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin: 1.5rem 0;
  padding: 0;
  border: 0;
}

.start-card {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 10rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  cursor: pointer;
}

.start-card:has(input:checked) {
  border-color: var(--color-link);
  box-shadow: 0 0 0 1px var(--color-link);
}

.start-card:has(input:focus-visible) {
  outline: 2px solid var(--color-link);
  outline-offset: 2px;
}

.start-card input {
  position: absolute;
  opacity: 0;
}

.start-card span {
  color: var(--color-muted);
  font-size: 0.85rem;
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
