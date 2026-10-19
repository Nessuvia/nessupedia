<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, onMounted, ref, watch, watchEffect } from "vue";
import { useRouter } from "vue-router";
import AppDialog from "@/components/AppDialog.vue";
import ContinuityDialog from "@/components/ContinuityDialog.vue";
import ImportVault from "@/components/ImportVault.vue";
import ImportZip from "@/components/ImportZip.vue";
import ModelSettingsForm from "@/components/ModelSettingsForm.vue";
import { EXPORT_REMINDER_DAYS, useExportReminder } from "@/composables/useExportReminder";
import { useLiveQuery } from "@/composables/useLiveQuery";
import type { Continuity } from "@/db/types";
import { DEFAULT_AUTO_CONTEXT_DEPTH } from "@/markdown/autoContext";
import { archiveService, changeLog, continuityService, pageService, storageService, wikiService } from "@/services";
import { fileSafeName } from "@/services/ArchiveService";
import { useWikiStore } from "@/stores/wiki";
import { downloadFile } from "@/utils/download";
import { relativeTime } from "@/utils/relativeTime";

const props = defineProps<{ wikiId: string }>();

const router = useRouter();
const { currentWiki, wikis } = storeToRefs(useWikiStore());
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

const KEEP_OPTIONS = [
  { label: "Forever", days: undefined },
  { label: "1 year", days: 365 },
  { label: "90 days", days: 90 },
  { label: "30 days", days: 30 },
];
const pruneNote = ref("");

// Shortening removes history right away, so it asks first.
async function changeHistoryDays(event: Event) {
  const select = event.target as HTMLSelectElement;
  const days = select.value ? Number(select.value) : undefined;
  const previous = currentWiki.value?.historyDays;
  pruneNote.value = "";
  if (days !== undefined && (previous === undefined || days < previous)) {
    const label = KEEP_OPTIONS.find((option) => option.days === days)!.label;
    if (!window.confirm(`Remove changes older than ${label} now? This can't be undone.`)) {
      select.value = String(previous ?? "");
      return;
    }
  }
  await wikiService.setHistoryDays(props.wikiId, days);
  if (days !== undefined) {
    const removed = await changeLog.prune(props.wikiId, days);
    pruneNote.value = removed ? `Removed ${removed} old ${removed === 1 ? "change" : "changes"}.` : "Nothing was old enough to remove.";
  }
}

const FOLLOW_OPTIONS = [
  { label: "Off", depth: 0 },
  { label: "1 link away", depth: 1 },
  { label: "2 links away", depth: 2 },
  { label: "3 links away", depth: 3 },
];

function changeFollowDepth(event: Event) {
  const depth = Number((event.target as HTMLSelectElement).value);
  return wikiService.setAutoContextDepth(props.wikiId, depth === DEFAULT_AUTO_CONTEXT_DEPTH ? undefined : depth);
}

const assistantRules = ref("");
const rulesSaved = ref(false);
watch(
  () => currentWiki.value?.assistantRules,
  (current) => (assistantRules.value = current ?? ""),
  { immediate: true },
);
const rulesChanged = computed(() => assistantRules.value.trim() !== (currentWiki.value?.assistantRules ?? ""));
watch(assistantRules, () => (rulesSaved.value = false));

async function saveAssistantRules() {
  await wikiService.setAssistantRules(props.wikiId, assistantRules.value);
  rulesSaved.value = true;
}

const DAY = 24 * 60 * 60 * 1000;
const HISTORY_SPANS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last year", days: 365 },
  { label: "All of it", days: undefined },
];

const { overdue: exportOverdue } = useExportReminder(currentWiki);
const exportScope = ref<"wiki" | "all">("wiki");
const includeHistory = ref(true);
const historySpan = ref(HISTORY_SPANS.length - 1);
const exporting = ref(false);
const exportError = ref("");

async function exportZip() {
  exporting.value = true;
  exportError.value = "";
  try {
    const all = exportScope.value === "all" && (wikis.value?.length ?? 0) > 1;
    const { days } = HISTORY_SPANS[historySpan.value]!;
    const data = await archiveService.exportZip(all ? wikis.value!.map(({ id }) => id) : [props.wikiId], {
      includeHistory: includeHistory.value,
      historySince: days === undefined ? undefined : Date.now() - days * DAY,
    });
    const date = new Date().toISOString().slice(0, 10);
    downloadFile(data, `${all ? "All wikis" : fileSafeName(currentWiki.value?.name ?? "Wiki")} ${date}.zip`, "application/zip");
  } catch (cause) {
    exportError.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    exporting.value = false;
  }
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

    <section aria-labelledby="settings-appearance">
      <h2 id="settings-appearance">Appearance</h2>
      <p class="hint">
        Set this wiki's accent color, fonts, and images on the
        <RouterLink :to="{ name: 'appearance', params: { wikiId } }">Appearance page</RouterLink>.
      </p>
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

    <section aria-labelledby="settings-history">
      <h2 id="settings-history">History</h2>
      <label class="label" for="history-days">Keep history for</label>
      <select id="history-days" class="text-input history-days" :value="currentWiki?.historyDays ?? ''" @change="changeHistoryDays">
        <option v-for="option in KEEP_OPTIONS" :key="option.label" :value="option.days ?? ''">{{ option.label }}</option>
      </select>
      <p class="hint">
        Older changes are removed when the wiki opens. Deletions stay, so deleted pages can still come back, and pages set to
        keep all history in their Details keep everything.
      </p>
      <p v-if="pruneNote" class="saved" role="status">{{ pruneNote }}</p>
    </section>

    <section aria-labelledby="settings-assistant">
      <h2 id="settings-assistant">Assistant</h2>
      <label class="label" for="follow-depth">Follow connections</label>
      <select id="follow-depth" class="text-input follow-depth" :value="currentWiki?.autoContextDepth ?? DEFAULT_AUTO_CONTEXT_DEPTH" @change="changeFollowDepth">
        <option v-for="option in FOLLOW_OPTIONS" :key="option.depth" :value="option.depth">{{ option.label }}</option>
      </select>
      <p class="hint">
        Auto-context gives the Assistant the pages your notes mention. Following connections adds the pages those link to,
        this many links away.
      </p>
      <label class="label subsection" for="assistant-rules">Assistant rules</label>
      <textarea
        id="assistant-rules"
        v-model="assistantRules"
        class="text-input assistant-rules"
        rows="5"
        placeholder="Always spell it &quot;grey&quot;. Assume characters are adults unless the notes say otherwise."
      />
      <p class="hint">The Assistant follows these in every run, whatever the assumption mode. Each run can add its own.</p>
      <button class="button secondary" type="button" :disabled="!rulesChanged" @click="saveAssistantRules">Save rules</button>
      <p v-if="rulesSaved" class="saved" role="status">Saved.</p>
    </section>

    <section aria-labelledby="settings-model">
      <h2 id="settings-model">Model</h2>
      <p class="hint">The model the Assistant writes with. These settings are shared by all wikis.</p>
      <ModelSettingsForm />
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

      <h3 class="label subsection">Export</h3>
      <p class="hint">Download a ZIP of markdown pages, images, and settings, to keep as a backup or import on another device.</p>
      <p class="hint" :class="{ overdue: exportOverdue }">
        {{ currentWiki?.lastExportedAt ? `Last exported ${relativeTime(currentWiki.lastExportedAt)}.` : "Never exported." }}
        <template v-if="exportOverdue">It's time for a new backup.</template>
        A reminder shows when the wiki has changed and its last export is {{ EXPORT_REMINDER_DAYS }} days old.
      </p>
      <form class="export" @submit.prevent="exportZip">
        <fieldset v-if="(wikis?.length ?? 0) > 1" class="choices">
          <legend>What to export</legend>
          <label class="choice"><input v-model="exportScope" type="radio" value="wiki" /> This wiki</label>
          <label class="choice"><input v-model="exportScope" type="radio" value="all" /> All {{ wikis!.length }} wikis</label>
        </fieldset>
        <label class="check"><input v-model="includeHistory" type="checkbox" /> Include history</label>
        <div v-if="includeHistory" class="span">
          <label for="history-span">How far back</label>
          <input
            id="history-span"
            v-model.number="historySpan"
            type="range"
            min="0"
            :max="HISTORY_SPANS.length - 1"
            step="1"
            :aria-valuetext="HISTORY_SPANS[historySpan]!.label"
          />
          <output for="history-span">{{ HISTORY_SPANS[historySpan]!.label }}</output>
        </div>
        <p v-if="exportScope === 'wiki' && currentWiki?.keepOriginalImages" class="hint">Original images are included.</p>
        <div>
          <button class="button" type="submit" :disabled="exporting">{{ exporting ? "Exporting…" : "Export ZIP" }}</button>
        </div>
        <p v-if="exportError" class="form-error" role="alert">{{ exportError }}</p>
      </form>

      <h3 class="label subsection">Import</h3>
      <p class="hint">Makes a new wiki from a ZIP exported here, leaving this one as it is. A name already in use gets a number.</p>
      <ImportZip class="import" />

      <h3 class="label subsection">Import an Obsidian vault</h3>
      <p class="hint">Makes a new wiki from a ZIP of an Obsidian vault. Links, images, and callouts come along; folders become categories.</p>
      <ImportVault class="import" />
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

.hint.overdue {
  color: var(--color-danger);
}

.status {
  max-width: 40rem;
  margin: 0 0 0.5rem;
}

.history-days,
.follow-depth {
  width: auto;
}

.subsection {
  margin-top: 1.5rem;
}

.assistant-rules {
  display: block;
  max-width: 40rem;
  resize: vertical;
}

.assistant-rules + .hint {
  margin-bottom: 0.5rem;
}

.import {
  margin-top: 0.75rem;
}

.export {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.choices {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1.25rem;
  margin: 0;
  padding: 0;
  border: 0;
}

.choices legend {
  margin-bottom: 0.25rem;
  padding: 0;
  font-weight: 600;
}

.choice {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.span {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.75rem;
}

.span output {
  min-width: 7rem;
  color: var(--color-muted);
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
