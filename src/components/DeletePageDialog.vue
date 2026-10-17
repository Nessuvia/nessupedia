<script setup lang="ts">
import { ref } from "vue";
import { useLiveQuery } from "@/composables/useLiveQuery";
import type { Page } from "@/db/types";
import { linkIndexer, pageService } from "@/services";
import AppDialog from "./AppDialog.vue";

const props = defineProps<{ page: Page }>();
const open = defineModel<boolean>("open", { required: true });

const deleting = ref(false);
const error = ref("");

const linkingPages = useLiveQuery(
  async (page) => new Set((await linkIndexer.backlinks(page.id)).map((link) => link.fromPageId).filter((id) => id !== page.id)).size,
  () => props.page,
);

async function remove() {
  deleting.value = true;
  error.value = "";
  try {
    await pageService.delete(props.page.id);
    open.value = false;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <AppDialog v-model:open="open" :title="`Delete ${page.title}?`">
    <ul class="consequences">
      <li v-if="linkingPages">
        {{ linkingPages }} {{ linkingPages === 1 ? "page links" : "pages link" }} here; those links will turn red.
      </li>
      <li>Its edit history will be removed. Recent changes keeps a note that it was created and deleted.</li>
      <li>You can create a page with this title again later.</li>
    </ul>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <div class="dialog-actions">
      <button class="button secondary" type="button" autofocus @click="open = false">Cancel</button>
      <button class="button danger" type="button" :disabled="deleting" @click="remove">
        {{ deleting ? "Deleting…" : "Delete page" }}
      </button>
    </div>
  </AppDialog>
</template>

<style scoped>
.consequences {
  margin: 0;
  padding-left: 1.25rem;
}

.consequences li + li {
  margin-top: 0.35rem;
}
</style>
