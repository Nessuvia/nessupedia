<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, ref, watch, watchEffect } from "vue";
import { useRouter } from "vue-router";
import AppDialog from "@/components/AppDialog.vue";
import { useLiveQuery } from "@/composables/useLiveQuery";
import { pageService, wikiService } from "@/services";
import { useWikiStore } from "@/stores/wiki";

const props = defineProps<{ wikiId: string }>();

const router = useRouter();
const { currentWiki } = storeToRefs(useWikiStore());
const pageCount = useLiveQuery((wikiId) => pageService.countForWiki(wikiId), () => props.wikiId);

const name = ref("");
const renaming = ref(false);
const renameError = ref("");
const renamed = ref(false);
watch(
  () => currentWiki.value?.name,
  (current) => (name.value = current ?? ""),
  { immediate: true },
);
const canRename = computed(() => !!name.value.trim() && name.value.trim() !== currentWiki.value?.name && !renaming.value);

async function rename() {
  if (!canRename.value) return;
  renaming.value = true;
  renameError.value = "";
  try {
    await wikiService.rename(props.wikiId, name.value);
    renamed.value = true;
  } catch (cause) {
    renameError.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    renaming.value = false;
  }
}
watch(name, () => (renamed.value = false));

const deleteOpen = ref(false);
const confirmation = ref("");
const deleting = ref(false);
const deleteError = ref("");
watch(deleteOpen, () => (confirmation.value = ""));
const confirmed = computed(() => confirmation.value.trim() === currentWiki.value?.name);

async function remove() {
  if (!confirmed.value) return;
  deleting.value = true;
  deleteError.value = "";
  try {
    await wikiService.delete(props.wikiId);
    await router.replace({ name: "home" });
  } catch (cause) {
    deleteError.value = cause instanceof Error ? cause.message : String(cause);
    deleting.value = false;
  }
}

watchEffect(() => {
  document.title = ["Wiki settings", currentWiki.value?.name].filter(Boolean).join(" | ");
});
</script>

<template>
  <article class="content-card">
    <h1>Wiki settings</h1>

    <section aria-labelledby="settings-general">
      <h2 id="settings-general">General</h2>
      <form class="rename" @submit.prevent="rename">
        <label class="label" for="wiki-name">Wiki name</label>
        <div class="row">
          <input id="wiki-name" v-model="name" class="text-input" type="text" autocomplete="off" />
          <button class="button" type="submit" :disabled="!canRename">{{ renaming ? "Saving…" : "Save" }}</button>
        </div>
        <p v-if="renameError" class="form-error" role="alert">{{ renameError }}</p>
        <p v-else-if="renamed" class="saved" role="status">Saved.</p>
      </form>
    </section>

    <section aria-labelledby="settings-images">
      <h2 id="settings-images">Images</h2>
      <label class="check">
        <input
          type="checkbox"
          :checked="currentWiki?.keepOriginalImages ?? false"
          @change="wikiService.setKeepOriginalImages(wikiId, ($event.target as HTMLInputElement).checked)"
        />
        Keep original images
      </label>
      <p class="hint">
        Added images are scaled to at most 2048 pixels on their long edge and stored as WebP. Keeping originals stores the
        untouched file as well, which uses more space.
      </p>
    </section>

    <section class="danger-zone" aria-labelledby="settings-delete">
      <h2 id="settings-delete">Delete this wiki</h2>
      <p>
        Removes {{ currentWiki?.name }} and all {{ pageCount ?? "of its" }} {{ pageCount === 1 ? "page" : "pages" }}, with their
        history, from this device.
      </p>
      <button class="button danger" type="button" @click="deleteOpen = true">Delete wiki</button>
    </section>

    <AppDialog v-model:open="deleteOpen" :title="`Delete ${currentWiki?.name}?`">
      <form @submit.prevent="remove">
        <p>This permanently deletes every page, change, and setting in this wiki. It can't be undone.</p>
        <label class="label" for="delete-confirmation">
          Type <strong>{{ currentWiki?.name }}</strong> to confirm
        </label>
        <input id="delete-confirmation" v-model="confirmation" class="text-input" type="text" autocomplete="off" autofocus />
        <p v-if="deleteError" class="form-error" role="alert">{{ deleteError }}</p>
        <div class="dialog-actions">
          <button class="button secondary" type="button" @click="deleteOpen = false">Cancel</button>
          <button class="button danger" type="submit" :disabled="!confirmed || deleting">
            {{ deleting ? "Deleting…" : "Delete wiki" }}
          </button>
        </div>
      </form>
    </AppDialog>
  </article>
</template>

<style scoped>
section + section {
  margin-top: 2rem;
}

h2 {
  font-size: 1.3rem;
}

.label {
  display: block;
  margin-bottom: 0.35rem;
  font-weight: 600;
}

.row {
  display: flex;
  gap: 0.5rem;
  max-width: 32rem;
}

.saved {
  margin: 0.5rem 0 0;
  color: var(--color-muted);
}

.check {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 600;
}

.hint {
  max-width: 40rem;
  margin: 0.35rem 0 0;
  color: var(--color-muted);
  font-size: 0.9rem;
}

.danger-zone {
  padding: 0 1.25rem 1.25rem;
  border: 1px solid var(--color-danger);
  border-radius: 6px;
}

.danger-zone h2 {
  color: var(--color-danger);
}
</style>
