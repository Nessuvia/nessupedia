<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, ref, watch, watchEffect } from "vue";
import { useRouter } from "vue-router";
import { useLiveQuery } from "@/composables/useLiveQuery";
import { updateFrontmatter } from "@/markdown/frontmatterEdit";
import { suggestedPairTitle } from "@/markdown/relationships";
import { instantiateTemplate, templateDescription, templateParts } from "@/markdown/templates";
import { titleError, titleKey } from "@/markdown/wikilinks";
import { titleParam } from "@/router/params";
import DraftForm, { type DraftInput } from "@/components/DraftForm.vue";
import ListInput from "@/components/ListInput.vue";
import { changeLog, modelSettingsService, pageService, templateService } from "@/services";
import { useRunsStore } from "@/stores/runs";
import { useWikiStore } from "@/stores/wiki";

const VERSION_CARD = "version";

// `withTitle` fills in the first character of a pair, or the page a version is of.
const props = defineProps<{ wikiId: string; initialTitle?: string; initialTemplate?: string; withTitle?: string }>();

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
const deletion = useLiveQuery(
  async ([wikiId, wanted]) => (wanted.trim() ? ((await changeLog.deletedPage(wikiId, wanted)) ?? null) : null),
  () => [props.wikiId, title.value] as const,
);
const viaAlias = computed(() => existing.value && existing.value.titleKey !== titleKey(title.value));
const templates = useLiveQuery((wikiId) => templateService.list(wikiId), () => props.wikiId);
const templateId = ref("");
watch(
  () => props.initialTemplate,
  (id) => (templateId.value = id ?? ""),
  { immediate: true },
);
const template = computed(() => templates.value?.find(({ id }) => id === templateId.value));
const parts = computed(() => (template.value ? templateParts(template.value.body) : []));
const included = ref<string[]>([]);
watch(parts, (next) => (included.value = next.filter((part) => !part.optional).map((part) => part.key)));

// Templates with a `between` key make relationship pages, so they ask for the two characters.
const asksPair = computed(() => !!template.value && "between" in template.value.frontmatter);
const pair = ref(["", ""]);
watch(
  () => props.withTitle,
  (name) => (pair.value = [name ?? "", ""]),
  { immediate: true },
);
const pageTitles = useLiveQuery(async (wikiId) => (await pageService.listForWiki(wikiId)).map((page) => page.title), () => props.wikiId);
const pairNames = computed(() => pair.value.map((name) => name.trim()));
const pairProblem = computed(() => {
  const [first = "", second = ""] = pairNames.value;
  if (!first || !second) return undefined;
  const invalid = [first, second].find((name) => titleError(name));
  if (invalid) return `"${invalid}" can't be a page title.`;
  return titleKey(first) === titleKey(second) ? "Pick two different characters." : undefined;
});
const pairReady = computed(() => !asksPair.value || (pairNames.value.every(Boolean) && !pairProblem.value));

// The title follows the pair until it's typed in.
const titleTyped = ref(!!props.initialTitle);
watch([asksPair, pairNames], () => {
  if (asksPair.value && !titleTyped.value && pairNames.value.every(Boolean)) title.value = suggestedPairTitle(pairNames.value);
});

// The version card makes a page's version in a continuity, titled for it and holding only the changes.
const makingVersion = computed(() => templateId.value === VERSION_CARD);
const continuities = computed(() => [...(currentWiki.value?.continuities ?? [])].sort((a, b) => a.name.localeCompare(b.name)));
const versionedTitle = ref(props.withTitle ?? "");
const continuityName = ref("");
const versionChanges = ref<string[]>([]);
watch(continuities, (list) => {
  if (!continuityName.value && list.length === 1) continuityName.value = list[0]!.name;
}, { immediate: true });
const topLevelTitles = computed(() => pageTitles.value?.filter((pageTitle) => !pageTitle.includes("/")) ?? []);
const versionProblem = computed(() => {
  const name = versionedTitle.value.trim();
  if (!name || !pageTitles.value) return undefined;
  return topLevelTitles.value.some((pageTitle) => titleKey(pageTitle) === titleKey(name)) ? undefined : "Pick an existing page without a slash in its title.";
});
const versionReady = computed(() => !makingVersion.value || (!!versionedTitle.value.trim() && !!continuityName.value && !versionProblem.value));
watch(
  [makingVersion, versionedTitle, continuityName, topLevelTitles],
  () => {
    if (!makingVersion.value) return;
    const main = topLevelTitles.value.find((pageTitle) => titleKey(pageTitle) === titleKey(versionedTitle.value)) ?? versionedTitle.value.trim();
    title.value = main && continuityName.value ? `${main}/${continuityName.value}` : "";
  },
  { immediate: true },
);

const canCreate = computed(
  () => !!title.value.trim() && !formatError.value && existing.value === null && pairReady.value && versionReady.value && !saving.value,
);

function startingBody(): string {
  if (makingVersion.value) return versionChanges.value.length ? updateFrontmatter("", { changes: versionChanges.value }) : "";
  if (!template.value) return "";
  const exclude = parts.value.filter((part) => !included.value.includes(part.key)).map((part) => part.key);
  const body = instantiateTemplate(template.value, { title: title.value.trim(), exclude });
  return asksPair.value ? updateFrontmatter(body, { between: pairNames.value }) : body;
}

// A draft creates the page only when its first section is accepted, so discarding everything leaves nothing behind.
const drafting = ref(false);
const draft = ref<DraftInput>({ notes: "", mode: "strict", rules: "" });
const configured = useLiveQuery(() => modelSettingsService.configured());
const canDraft = computed(() => !makingVersion.value);
const runs = useRunsStore();

async function startDraft() {
  saving.value = true;
  saveError.value = "";
  try {
    await runs.start({
      wikiId: props.wikiId,
      kind: "draft",
      pageTitle: title.value.trim(),
      mode: draft.value.mode,
      notes: draft.value.notes,
      rules: draft.value.rules,
      body: startingBody(),
      ...(template.value && { templateId: template.value.id }),
    });
  } catch (cause) {
    saveError.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    saving.value = false;
  }
}

async function create() {
  if (!canCreate.value) return;
  if (drafting.value && canDraft.value) return startDraft();
  saving.value = true;
  saveError.value = "";
  try {
    const page = await pageService.create({
      wikiId: props.wikiId,
      title: title.value,
      body: startingBody(),
      ...(template.value && { templateId: template.value.id }),
    });
    // A new version already shows its main page's content, so it opens where sections can be changed one by one.
    await router.push({ name: makingVersion.value ? "page" : "edit-page", params: { wikiId: props.wikiId, title: titleParam(page.title) } });
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
      <input
        id="page-title"
        v-model="title"
        type="text"
        placeholder="e.g. Mira"
        autocomplete="off"
        autofocus
        :readonly="makingVersion"
        @input="titleTyped = true"
      />
      <p v-if="formatError" class="problem" role="alert">{{ formatError }}</p>
      <p v-else-if="existing" class="problem" role="alert">
        {{ viaAlias ? `"${title.trim()}" is another name for` : "A page with this title already exists:" }}
        <RouterLink :to="{ name: 'page', params: { wikiId, title: titleParam(existing.title) } }">{{ existing.title }}</RouterLink>.
      </p>
      <p v-else-if="deletion" class="warning" role="status">
        A deleted page named {{ deletion.pageTitle }} has
        <RouterLink :to="{ name: 'page-history', params: { wikiId, title: titleParam(deletion.pageTitle) } }">history</RouterLink>.
        Creating this page removes it.
      </p>

      <fieldset class="starts">
        <legend class="field-label">Start from</legend>
        <label class="start-card">
          <input v-model="templateId" type="radio" name="start" value="" />
          <strong>Blank</strong>
          <span>An empty page.</span>
        </label>
        <label v-for="option in templates" :key="option.id" class="start-card">
          <input v-model="templateId" type="radio" name="start" :value="option.id" />
          <strong>{{ option.name }}</strong>
          <span>{{ templateDescription(option) }}</span>
        </label>
        <label class="start-card">
          <input v-model="templateId" type="radio" name="start" :value="VERSION_CARD" />
          <strong>Version in a continuity</strong>
          <span>A page as it is in an alternate universe, changing only what you rewrite.</span>
        </label>
      </fieldset>

      <fieldset v-if="makingVersion" class="version">
        <legend class="visually-hidden">Version</legend>
        <label class="field-label" for="version-of">Page</label>
        <input id="version-of" v-model="versionedTitle" type="text" list="version-pages" autocomplete="off" placeholder="e.g. Mira" />
        <datalist id="version-pages">
          <option v-for="pageTitle in topLevelTitles" :key="pageTitle" :value="pageTitle" />
        </datalist>
        <p v-if="versionProblem" class="problem" role="alert">{{ versionProblem }}</p>

        <label class="field-label" for="version-continuity">Continuity</label>
        <select v-if="continuities.length" id="version-continuity" v-model="continuityName">
          <option value="" disabled>Pick a continuity</option>
          <option v-for="continuity in continuities" :key="continuity.id" :value="continuity.name">{{ continuity.name }}</option>
        </select>
        <p v-else class="note">
          No continuities yet. <RouterLink :to="{ name: 'wiki-settings', params: { wikiId } }">Add one in wiki settings</RouterLink>.
        </p>

        <ListInput v-model="versionChanges" class="changes" label="What changes" />
        <p class="note">Listed on the version's banner. Everything else starts the same as the main page.</p>
      </fieldset>

      <fieldset v-if="asksPair" class="pair">
        <legend class="field-label">Between</legend>
        <div class="pair-inputs">
          <input v-model="pair[0]" type="text" aria-label="First character" list="pair-pages" autocomplete="off" />
          <span aria-hidden="true">&amp;</span>
          <input v-model="pair[1]" type="text" aria-label="Second character" list="pair-pages" autocomplete="off" />
        </div>
        <datalist id="pair-pages">
          <option v-for="pageTitle in pageTitles" :key="pageTitle" :value="pageTitle" />
        </datalist>
        <p v-if="pairProblem" class="problem" role="alert">{{ pairProblem }}</p>
      </fieldset>

      <fieldset v-if="parts.length" class="parts">
        <legend class="field-label">Include</legend>
        <label v-for="part in parts" :key="part.key" class="part">
          <input v-model="included" type="checkbox" :value="part.key" />
          {{ part.label }}
        </label>
      </fieldset>

      <fieldset v-if="canDraft" class="draft">
        <legend class="visually-hidden">Assistant</legend>
        <label class="part">
          <input v-model="drafting" type="checkbox" />
          Draft from notes with the Assistant
        </label>
        <template v-if="drafting">
          <p v-if="configured === false" class="problem" role="alert">
            The Assistant needs a model first.
            <RouterLink :to="{ name: 'wiki-settings', params: { wikiId }, hash: '#settings-model' }">Set one up in settings</RouterLink>.
          </p>
          <p class="note">
            {{ template ? "Each included section" : "Each section the Assistant plans" }} is proposed for review. The page is created when you
            accept the first one.
          </p>
          <DraftForm v-model="draft" class="draft-form" />
        </template>
      </fieldset>

      <p v-if="saveError" class="problem" role="alert">{{ saveError }}</p>
      <button type="submit" :disabled="!canCreate || (drafting && canDraft && configured === false)">
        {{ drafting && canDraft ? "Start draft" : "Create page" }}
      </button>
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

.warning {
  margin: 0.5rem 0 0;
  color: var(--color-danger);
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

.version {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin: 0 0 1.5rem;
  padding: 0;
  border: 0;
}

.version .field-label:not(:first-of-type) {
  margin-top: 0.75rem;
}

.version select {
  align-self: flex-start;
  padding: 0.4rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font: inherit;
}

.version .changes {
  margin-top: 0.75rem;
}

.note {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.85rem;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.pair {
  margin: 0 0 1.5rem;
  padding: 0;
  border: 0;
}

.pair-inputs {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.parts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.25rem;
  margin: 0 0 1.5rem;
  padding: 0;
  border: 0;
}

.part {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.draft {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin: 0 0 1.5rem;
  padding: 0;
  border: 0;
}

.draft-form :deep(textarea) {
  font: inherit;
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
