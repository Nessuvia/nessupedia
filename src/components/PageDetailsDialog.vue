<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from "vue";
import { useLiveQuery } from "@/composables/useLiveQuery";
import type { Page } from "@/db/types";
import { stringList } from "@/markdown/frontmatter";
import { editFrontmatter, updateFrontmatter } from "@/markdown/frontmatterEdit";
import { parseMarkdown } from "@/markdown/pipeline";
import { titleError, titleKey } from "@/markdown/wikilinks";
import { categoryService, pageService } from "@/services";
import AppDialog from "./AppDialog.vue";
import ListInput from "./ListInput.vue";

const props = defineProps<{ page: Page }>();
const open = defineModel<boolean>("open", { required: true });

const aliases = ref<string[]>([]);
const categories = ref<string[]>([]);
const between = ref<string[]>([]);
// Only relationship pages, and pages meant to become one, have the field.
const hasPair = computed(() => "between" in props.page.frontmatter);
const keepHistory = ref(false);
const keepsHistory = () => props.page.frontmatter.history === "keep";
const minor = ref(false);
const saving = ref(false);
const error = ref("");

// Names as written, so a value the page can't use shows up here to be fixed rather than vanishing on save.
const written = (key: string) => stringList(props.page.frontmatter[key]).map((name) => name.trim());

watch(
  open,
  (isOpen) => {
    if (!isOpen) return;
    aliases.value = written("aliases");
    categories.value = written("categories");
    between.value = written("between");
    keepHistory.value = keepsHistory();
    minor.value = false;
    error.value = "";
  },
  { immediate: true },
);

const yamlProblem = computed(() =>
  parseMarkdown(props.page.body).frontmatterError ? "This page's frontmatter has a YAML error. Fix it in the editor first." : undefined,
);

const knownCategories = useLiveQuery(
  async (wikiId) => (await categoryService.list(wikiId)).map(({ name }) => name),
  () => props.page.wikiId,
);

// Maps each alias another page already uses, by title or alias, to that page's title.
async function takenBy(wikiId: string, names: readonly string[]): Promise<Map<string, string>> {
  const taken = new Map<string, string>();
  for (const name of names) {
    const owner = titleError(name) ? undefined : await pageService.getByTitle(wikiId, name);
    if (owner && owner.id !== props.page.id) taken.set(titleKey(name), owner.title);
  }
  return taken;
}

const takenAliases = useLiveQuery(([wikiId, names]) => takenBy(wikiId, names), () => [props.page.wikiId, [...aliases.value]] as const);

function aliasProblem(name: string): string | undefined {
  if (titleError(name)) return `"${name}" can't be an alias: names can't contain [ ] | or #.`;
  if (titleKey(name) === props.page.titleKey) return `"${name}" is already this page's title.`;
  const owner = takenAliases.value?.get(titleKey(name));
  return owner ? `"${name}" already leads to ${owner}.` : undefined;
}

function categoryProblem(name: string): string | undefined {
  return titleError(name) ? `"${name}" can't be a category: names can't contain [ ] | or #.` : undefined;
}

const pageTitles = useLiveQuery(
  async (wikiId) => (await pageService.listForWiki(wikiId)).map((page) => page.title),
  () => props.page.wikiId,
);

function pairProblem(name: string): string | undefined {
  if (titleError(name)) return `"${name}" can't be a page title.`;
  return titleKey(name) === props.page.titleKey ? "A relationship page can't name itself." : undefined;
}

const LABELS: Record<string, string> = { aliases: "aliases", categories: "categories", between: "the pair", history: "history setting" };

const changes = computed(() => {
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((name, index) => name === b[index]);
  const update: Record<string, string[]> = {};
  if (!same(aliases.value, written("aliases"))) update.aliases = aliases.value;
  if (!same(categories.value, written("categories"))) update.categories = categories.value;
  if (hasPair.value && !same(between.value, written("between"))) update.between = between.value;
  return update;
});

const blocked = computed(
  () =>
    !!yamlProblem.value ||
    takenAliases.value === undefined ||
    aliases.value.some((name) => aliasProblem(name)) ||
    categories.value.some((name) => categoryProblem(name)) ||
    between.value.some((name) => pairProblem(name)),
);

const aliasInput = useTemplateRef("aliasInput");
const categoryInput = useTemplateRef("categoryInput");
const pairInput = useTemplateRef("pairInput");

async function save() {
  aliasInput.value?.commit();
  categoryInput.value?.commit();
  pairInput.value?.commit();
  const historyChanged = keepHistory.value !== keepsHistory();
  const keys = [...Object.keys(changes.value), ...(historyChanged ? ["history"] : [])];
  if (blocked.value || saving.value) return;
  if (keys.length === 0) return void (open.value = false);

  saving.value = true;
  error.value = "";
  try {
    // A name typed just before saving hasn't reached the live check yet, which then reports it.
    if ((await takenBy(props.page.wikiId, aliases.value)).size > 0) return;
    // Reads the stored body again so an edit made since the dialog opened isn't lost.
    const latest = (await pageService.get(props.page.id))!;
    let body = updateFrontmatter(latest.body, changes.value);
    if (historyChanged) body = editFrontmatter(body, (doc) => (keepHistory.value ? doc.set("history", "keep") : doc.delete("history")));
    await pageService.save(latest.id, body, { summary: `Edited ${keys.map((key) => LABELS[key]).join(" and ")}`, minor: minor.value });
    open.value = false;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppDialog v-model:open="open" :title="`Details of ${page.title}`">
    <form @submit.prevent="save">
      <p v-if="yamlProblem" class="form-error" role="alert">{{ yamlProblem }}</p>
      <ListInput ref="aliasInput" v-model="aliases" label="Aliases" :check="aliasProblem" />
      <p class="note">Other names that lead to this page, such as nicknames.</p>
      <ListInput ref="categoryInput" v-model="categories" label="Categories" :suggestions="knownCategories" :check="categoryProblem" />
      <template v-if="hasPair">
        <ListInput ref="pairInput" v-model="between" class="pair" label="Between" :suggestions="pageTitles" :check="pairProblem" />
        <p class="note">The characters this relationship page is about. It shows on each one's Relationships tab.</p>
      </template>
      <label class="keep"><input v-model="keepHistory" type="checkbox" /> Keep all history</label>
      <p class="note">Old changes to this page are never removed, whatever the wiki's settings say.</p>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <div class="dialog-actions">
        <label class="minor"><input v-model="minor" type="checkbox" /> Minor edit</label>
        <button class="button secondary" type="button" @click="open = false">Cancel</button>
        <button class="button" type="submit" :disabled="blocked || saving">{{ saving ? "Saving…" : "Save" }}</button>
      </div>
    </form>
  </AppDialog>
</template>

<style scoped>
.pair {
  margin-top: 1rem;
}

.keep {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 600;
}

.note {
  margin: 0.35rem 0 1rem;
  color: var(--color-muted);
  font-size: 0.85rem;
}

.minor {
  align-self: center;
  margin-right: auto;
  font-size: 0.9rem;
}
</style>
