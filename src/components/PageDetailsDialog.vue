<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from "vue";
import { useLiveQuery } from "@/composables/useLiveQuery";
import type { Page } from "@/db/types";
import { stringList } from "@/markdown/frontmatter";
import { updateFrontmatter } from "@/markdown/frontmatterEdit";
import { parseMarkdown } from "@/markdown/pipeline";
import { titleError, titleKey } from "@/markdown/wikilinks";
import { categoryService, pageService } from "@/services";
import AppDialog from "./AppDialog.vue";
import ListInput from "./ListInput.vue";

const props = defineProps<{ page: Page }>();
const open = defineModel<boolean>("open", { required: true });

const aliases = ref<string[]>([]);
const categories = ref<string[]>([]);
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

const changes = computed(() => {
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((name, index) => name === b[index]);
  const update: Record<string, string[]> = {};
  if (!same(aliases.value, written("aliases"))) update.aliases = aliases.value;
  if (!same(categories.value, written("categories"))) update.categories = categories.value;
  return update;
});

const blocked = computed(
  () =>
    !!yamlProblem.value ||
    takenAliases.value === undefined ||
    aliases.value.some((name) => aliasProblem(name)) ||
    categories.value.some((name) => categoryProblem(name)),
);

const aliasInput = useTemplateRef("aliasInput");
const categoryInput = useTemplateRef("categoryInput");

async function save() {
  aliasInput.value?.commit();
  categoryInput.value?.commit();
  const keys = Object.keys(changes.value);
  if (blocked.value || saving.value) return;
  if (keys.length === 0) return void (open.value = false);

  saving.value = true;
  error.value = "";
  try {
    // A name typed just before saving hasn't reached the live check yet, which then reports it.
    if ((await takenBy(props.page.wikiId, aliases.value)).size > 0) return;
    // Reads the stored body again so an edit made since the dialog opened isn't lost.
    const latest = (await pageService.get(props.page.id))!;
    await pageService.save(latest.id, updateFrontmatter(latest.body, changes.value), { summary: `Edited ${keys.join(" and ")}`, minor: minor.value });
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
