<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, ref, watch, watchEffect } from "vue";
import { useRouter } from "vue-router";
import SplitPanes from "@/components/SplitPanes.vue";
import { useLeaveGuard } from "@/composables/useLeaveGuard";
import { useLiveQuery } from "@/composables/useLiveQuery";
import { versionOf } from "@/markdown/versions";
import { titleParam } from "@/router/params";
import { pageService } from "@/services";
import { useWikiStore } from "@/stores/wiki";

const props = defineProps<{ wikiId: string; title: string }>();

const router = useRouter();
const { currentWiki } = storeToRefs(useWikiStore());

const page = useLiveQuery(
  async ([wikiId, title]) => (await pageService.getByTitle(wikiId, title)) ?? null,
  () => [props.wikiId, props.title] as const,
);

// The draft loads once per page, so live updates to the stored page never overwrite typing.
const loadedId = ref<string>();
const base = ref("");
const draft = ref("");
const summary = ref("");
const minor = ref(false);
const saving = ref(false);
const error = ref("");

watch(page, (found) => {
  if (!found || found.id === loadedId.value) return;
  loadedId.value = found.id;
  base.value = found.body;
  draft.value = found.body;
  summary.value = "";
  minor.value = false;
});

const continuity = computed(() => (page.value ? versionOf(page.value.title, currentWiki.value?.continuities ?? []) : undefined));
const mainPage = useLiveQuery(
  async ([wikiId, main]) => (main ? await pageService.getByTitle(wikiId, main) : undefined),
  () => [props.wikiId, continuity.value?.main] as const,
);

const dirty = computed(() => loadedId.value !== undefined && draft.value !== base.value);
useLeaveGuard(dirty);

async function save() {
  if (!page.value || !dirty.value || saving.value) return;
  saving.value = true;
  error.value = "";
  try {
    const saved = await pageService.save(page.value.id, draft.value, { minor: minor.value, summary: summary.value.trim() });
    base.value = saved.body;
    await router.push({ name: "page", params: { wikiId: props.wikiId, title: titleParam(saved.title) } });
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    saving.value = false;
  }
}

watchEffect(() => {
  document.title = [`Editing ${page.value?.title ?? props.title}`, currentWiki.value?.name].filter(Boolean).join(" | ");
});
</script>

<template>
  <article class="content-card editor-card" @keydown.ctrl.s.prevent="save" @keydown.meta.s.prevent="save">
    <header class="editor-header">
      <h1>Editing {{ page?.title ?? title }}</h1>
    </header>

    <div v-if="page === null" class="missing">
      <p>This page doesn't exist yet.</p>
      <RouterLink :to="{ name: 'new-page', params: { wikiId }, query: { title } }">Create this page</RouterLink>
    </div>

    <template v-else-if="loadedId">
      <SplitPanes
        v-model="draft"
        :wiki-id="wikiId"
        label="Page source"
        :inherit-from="mainPage?.body"
        :continuity="continuity?.continuity.name"
        @submit="save"
      />

      <form class="save-bar" @submit.prevent="save">
        <label class="summary">
          <span>Summary</span>
          <input v-model="summary" type="text" placeholder="Briefly describe your changes" maxlength="200" />
        </label>
        <label class="minor">
          <input v-model="minor" type="checkbox" />
          Minor edit
        </label>
        <div class="actions">
          <p v-if="error" class="form-error" role="alert">{{ error }}</p>
          <RouterLink :to="{ name: 'page', params: { wikiId, title: titleParam(page?.title ?? title) } }">Cancel</RouterLink>
          <button class="button" type="submit" :disabled="!dirty || saving">{{ saving ? "Saving…" : "Save" }}</button>
        </div>
      </form>
    </template>
  </article>
</template>

<style scoped>
.editor-header h1 {
  margin: 0.25rem 0 1rem;
}

.summary {
  display: flex;
  flex: 1 1 20rem;
  align-items: center;
  gap: 0.5rem;
}

.summary span {
  font-weight: 600;
}

.summary input {
  flex: 1;
  min-width: 0;
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font: inherit;
}

.minor {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.missing p {
  color: var(--color-muted);
}
</style>
