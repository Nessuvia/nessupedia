<script setup lang="ts">
import { ref, toRef } from "vue";
import { useExportReminder } from "@/composables/useExportReminder";
import type { Wiki } from "@/db/types";
import { archiveService } from "@/services";
import { fileSafeName } from "@/services/ArchiveService";
import { downloadFile } from "@/utils/download";
import { relativeTime } from "@/utils/relativeTime";

const props = defineProps<{ wiki: Wiki }>();

const { due, later } = useExportReminder(toRef(props, "wiki"));
const exporting = ref(false);
const error = ref("");

async function exportNow() {
  exporting.value = true;
  error.value = "";
  try {
    const data = await archiveService.exportZip([props.wiki.id]);
    downloadFile(data, `${fileSafeName(props.wiki.name)} ${new Date().toISOString().slice(0, 10)}.zip`, "application/zip");
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <aside v-if="due" class="export-reminder" aria-label="Export reminder">
    <p>
      {{
        wiki.lastExportedAt
          ? `${wiki.name} has changed since it was last exported ${relativeTime(wiki.lastExportedAt)}.`
          : `${wiki.name} has never been exported.`
      }}
      Export a ZIP to keep a copy safe outside this browser.
    </p>
    <div class="actions">
      <button type="button" class="button" :disabled="exporting" @click="exportNow">{{ exporting ? "Exporting…" : "Export now" }}</button>
      <button type="button" class="button secondary" :disabled="exporting" @click="later">Later</button>
    </div>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
  </aside>
</template>

<style scoped>
.export-reminder {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  margin: 0 0 1rem;
  padding: 0.6rem 0.9rem;
  border-left: 4px solid var(--color-header);
  border-radius: 4px;
  background: var(--color-surface);
  font-size: 0.9rem;
}

p {
  margin: 0;
}

.actions {
  display: flex;
  gap: 0.5rem;
  margin-left: auto;
}

.form-error {
  flex-basis: 100%;
}
</style>
