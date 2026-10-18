<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, onMounted, ref, watch, watchEffect } from "vue";
import { useRouter } from "vue-router";
import AppDialog from "@/components/AppDialog.vue";
import ContinuityDialog from "@/components/ContinuityDialog.vue";
import { useLiveQuery } from "@/composables/useLiveQuery";
import type { Continuity } from "@/db/types";
import { continuityService, pageService, storageService, wikiService } from "@/services";
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

const continuities = useLiveQuery((wikiId) => continuityService.list(wikiId), () => props.wikiId);
const versionCounts = useLiveQuery(
  async ([wikiId, list]) => {
    const counts = new Map<string, number>();
    for (const continuity of list) counts.set(continuity.id, (await continuityService.versions(wikiId, continuity.name)).length);
    return counts;
  },
  () => [props.wikiId, continuities.value ?? []] as const,
);
const continuityOpen = ref(false);
const editing = ref<Continuity>();
const continuityError = ref("");

function openContinuity(continuity?: Continuity) {
  editing.value = continuity;
  continuityError.value = "";
  continuityOpen.value = true;
}

async function deleteContinuity(continuity: Continuity) {
  continuityError.value = "";
  if (!window.confirm(`Delete the ${continuity.name} continuity?`)) return;
  try {
    await continuityService.delete(props.wikiId, continuity.id);
  } catch (cause) {
    continuityError.value = cause instanceof Error ? cause.message : String(cause);
  }
}

const persisted = ref<boolean>();
const askedToKeep = ref(false);
onMounted(async () => (persisted.value = await storageService.persisted()));

async function askToKeep() {
  persisted.value = await storageService.request();
  askedToKeep.value = true;
}

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

    <section aria-labelledby="settings-continuities">
      <h2 id="settings-continuities">Continuities</h2>
      <p class="hint">
        Alternate universes and spinoffs. A page's version in one, such as <em>Mira/Noir AU</em>, starts from the main page and
        changes only what you rewrite.
      </p>
      <ul v-if="continuities?.length" class="continuities">
        <li v-for="continuity in continuities" :key="continuity.id">
          <div class="about">
            <RouterLink :to="{ name: 'continuity', params: { wikiId, name: continuity.name } }">{{ continuity.name }}</RouterLink>
            <span class="count">
              {{ versionCounts?.get(continuity.id) ?? 0 }} {{ versionCounts?.get(continuity.id) === 1 ? "version" : "versions" }}
            </span>
            <span v-if="continuity.description" class="description">{{ continuity.description }}</span>
          </div>
          <div class="actions">
            <button class="link-button" type="button" @click="openContinuity(continuity)">Edit</button>
            <button class="link-button" type="button" @click="deleteContinuity(continuity)">Delete</button>
          </div>
        </li>
      </ul>
      <p v-if="continuityError" class="form-error" role="alert">{{ continuityError }}</p>
      <button class="button secondary add" type="button" @click="openContinuity()">Add continuity</button>
      <ContinuityDialog
        v-model:open="continuityOpen"
        :wiki-id="wikiId"
        :continuities="continuities ?? []"
        :continuity="editing"
        :version-count="editing && versionCounts?.get(editing.id)"
      />
    </section>

    <section aria-labelledby="settings-data">
      <h2 id="settings-data">Data</h2>
      <h3 class="label">Storage</h3>
      <template v-if="!storageService.supported">
        <p class="status">This browser can't promise to keep your wikis.</p>
        <p class="hint">Wikis live only on this device, and the browser may clear them when space runs low.</p>
      </template>
      <p v-else-if="persisted" class="status kept" role="status">This browser keeps your wikis until you delete them.</p>
      <template v-else-if="persisted === false">
        <p class="status" role="status">The browser may clear your wikis when space runs low.</p>
        <button class="button secondary" type="button" @click="askToKeep">Ask the browser to keep them</button>
        <p v-if="askedToKeep" class="hint" role="alert">
          The browser said no. Some browsers decide by how often you use a site, and installing the app usually helps.
        </p>
      </template>
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

.status {
  max-width: 40rem;
  margin: 0 0 0.5rem;
}

.kept::before {
  content: "✓ ";
  color: var(--color-success);
}

.continuities {
  max-width: 40rem;
  margin: 1rem 0 0;
  padding: 0;
  list-style: none;
}

.continuities li {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.6rem 0;
  border-bottom: 1px solid var(--color-border);
}

.about {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 0.6rem;
  min-width: 0;
}

.count {
  color: var(--color-muted);
  font-size: 0.85rem;
}

.description {
  flex-basis: 100%;
  color: var(--color-muted);
  font-size: 0.9rem;
}

.actions {
  display: flex;
  gap: 1rem;
}

.link-button {
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-link);
  font: inherit;
  font-size: 0.9rem;
  cursor: pointer;
}

.add {
  margin-top: 1rem;
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
