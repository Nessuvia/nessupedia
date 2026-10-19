<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, ref, shallowRef, watchEffect } from "vue";
import { useRouter } from "vue-router";
import AppDialog from "@/components/AppDialog.vue";
import NameDialog from "@/components/NameDialog.vue";
import { useTemplateNameCheck } from "@/composables/useTemplateNameCheck";
import type { Template } from "@/db/types";
import { templateDescription } from "@/markdown/templates";
import { templateService } from "@/services";
import { useWikiStore } from "@/stores/wiki";
import { isBundled } from "@/templates";

const props = defineProps<{ wikiId: string }>();

const router = useRouter();
const { currentWiki } = storeToRefs(useWikiStore());
const { templates, check } = useTemplateNameCheck(() => props.wikiId);

const bundled = computed(() => templates.value?.filter(isBundled) ?? []);
const own = computed(() => templates.value?.filter((template) => !isBundled(template)) ?? []);

const target = shallowRef<Template>();
const duplicateOpen = ref(false);
const renameOpen = ref(false);
const deleteOpen = ref(false);
const deleteError = ref("");

function open(kind: "duplicate" | "rename" | "delete", template: Template) {
  target.value = template;
  deleteError.value = "";
  ({ duplicate: duplicateOpen, rename: renameOpen, delete: deleteOpen })[kind].value = true;
}

async function duplicate(name: string) {
  const copy = await templateService.duplicate(target.value!.id, props.wikiId, name);
  await router.push({ name: "edit-template", params: { templateId: copy.id } });
}

async function rename(name: string) {
  await templateService.rename(target.value!.id, name);
}

async function remove() {
  try {
    await templateService.delete(target.value!.id);
    deleteOpen.value = false;
  } catch (cause) {
    deleteError.value = cause instanceof Error ? cause.message : String(cause);
  }
}

watchEffect(() => {
  document.title = ["Templates", currentWiki.value?.name].filter(Boolean).join(" | ");
});
</script>

<template>
  <article class="content-card">
    <h1>Templates</h1>
    <p class="intro">Templates give new pages a starting shape. Pick one on the Create a page screen.</p>

    <section aria-labelledby="own-templates">
      <h2 id="own-templates">Your templates</h2>
      <p v-if="own.length === 0 && templates" class="empty">
        None yet. Use "Save as template" on a page, or duplicate a bundled template below.
      </p>
      <ul class="templates">
        <li v-for="template in own" :key="template.id" class="template">
          <div class="about">
            <strong>{{ template.name }}</strong>
            <span v-if="templateDescription(template)">{{ templateDescription(template) }}</span>
          </div>
          <div class="actions">
            <RouterLink class="action" :to="{ name: 'edit-template', params: { templateId: template.id } }">Edit</RouterLink>
            <button class="action" type="button" @click="open('rename', template)">Rename</button>
            <button class="action" type="button" @click="open('duplicate', template)">Duplicate</button>
            <button class="action" type="button" @click="open('delete', template)">Delete</button>
          </div>
        </li>
      </ul>
    </section>

    <section aria-labelledby="bundled-templates">
      <h2 id="bundled-templates">Bundled</h2>
      <ul class="templates">
        <li v-for="template in bundled" :key="template.id" class="template">
          <div class="about">
            <strong>{{ template.name }}</strong>
            <span>{{ templateDescription(template) }}</span>
          </div>
          <div class="actions">
            <button class="action" type="button" @click="open('duplicate', template)">Duplicate</button>
          </div>
        </li>
      </ul>
    </section>

    <template v-if="target">
      <NameDialog
        v-model:open="duplicateOpen"
        :title="`Duplicate ${target.name}`"
        label="Name"
        :initial="`${target.name} (copy)`"
        action="Duplicate"
        :check="(name) => check(name)"
        :submit="duplicate"
      />
      <NameDialog
        v-model:open="renameOpen"
        :title="`Rename ${target.name}`"
        label="Name"
        :initial="target.name"
        action="Rename"
        :check="(name) => check(name, target)"
        :submit="rename"
      />
      <AppDialog v-model:open="deleteOpen" :title="`Delete ${target.name}?`">
        <p>Pages made from it keep their content.</p>
        <p v-if="deleteError" class="form-error" role="alert">{{ deleteError }}</p>
        <div class="dialog-actions">
          <button class="button secondary" type="button" autofocus @click="deleteOpen = false">Cancel</button>
          <button class="button danger" type="button" @click="remove">Delete template</button>
        </div>
      </AppDialog>
    </template>
  </article>
</template>

<style scoped>
.intro,
.empty {
  color: var(--color-muted);
}

h2 {
  font-size: 1.2rem;
}

.templates {
  margin: 0;
  padding: 0;
  list-style: none;
}

.template {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--color-border);
}

.about {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.about span {
  color: var(--color-muted);
  font-size: 0.9rem;
}

.actions {
  display: flex;
  gap: 1rem;
}

.action {
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-link);
  font: inherit;
  font-size: 0.9rem;
  cursor: pointer;
}
</style>
