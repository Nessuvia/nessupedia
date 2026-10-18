<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useLiveQuery } from "@/composables/useLiveQuery";
import type { Page } from "@/db/types";
import { linkIndexer, pageService } from "@/services";
import { titleError } from "@/markdown/wikilinks";
import AppDialog from "./AppDialog.vue";

const props = defineProps<{ page: Page }>();
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ renamed: [title: string] }>();

const title = ref("");
const saving = ref(false);
const error = ref("");

watch(
  open,
  (isOpen) => {
    if (!isOpen) return;
    title.value = props.page.title;
    error.value = "";
  },
  { immediate: true },
);

const linkingPages = useLiveQuery(
  async (page) => new Set((await linkIndexer.linksByTitle(page)).map((link) => link.fromPageId).filter((id) => id !== page.id)).size,
  () => props.page,
);
const subpageCount = useLiveQuery(async (page) => (await pageService.subpages(page.wikiId, page.title)).length, () => props.page);
const clash = useLiveQuery(
  async ([wikiId, wanted]) => {
    const found = wanted.trim() ? await pageService.getByTitle(wikiId, wanted) : undefined;
    return found && found.id !== props.page.id ? found : null;
  },
  () => [props.page.wikiId, title.value] as const,
);

const problem = computed(() => {
  if (!title.value.trim()) return undefined;
  return titleError(title.value) ?? (clash.value ? `"${clash.value.title}" already uses that name.` : undefined);
});
const unchanged = computed(() => title.value.trim() === props.page.title);
const canRename = computed(() => !!title.value.trim() && !problem.value && clash.value === null && !unchanged.value && !saving.value);

async function rename() {
  if (!canRename.value) return;
  saving.value = true;
  error.value = "";
  try {
    const renamed = await pageService.rename(props.page.id, title.value);
    open.value = false;
    emit("renamed", renamed.title);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppDialog v-model:open="open" :title="`Rename ${page.title}`">
    <form @submit.prevent="rename">
      <label class="label" for="rename-title">New title</label>
      <input id="rename-title" v-model="title" class="text-input" type="text" autocomplete="off" autofocus />
      <p v-if="problem" class="form-error" role="alert">{{ problem }}</p>
      <p class="note">
        <template v-if="linkingPages">
          Links to "{{ page.title }}" on {{ linkingPages }} {{ linkingPages === 1 ? "other page" : "other pages" }} will be
          updated to the new title, each as a minor edit.
        </template>
        <template v-else>No other pages link here by this title.</template>
        Links that use an alias stay as they are.
      </p>
      <p v-if="subpageCount" class="note">
        Its {{ subpageCount }} {{ subpageCount === 1 ? "subpage moves" : "subpages move" }} with it, keeping their names under the new title.
      </p>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <div class="dialog-actions">
        <button class="button secondary" type="button" @click="open = false">Cancel</button>
        <button class="button" type="submit" :disabled="!canRename">{{ saving ? "Renaming…" : "Rename" }}</button>
      </div>
    </form>
  </AppDialog>
</template>

<style scoped>
.label {
  display: block;
  margin-bottom: 0.35rem;
  font-weight: 600;
}

.note {
  margin: 0.75rem 0 0;
  color: var(--color-muted);
  font-size: 0.9rem;
}
</style>
