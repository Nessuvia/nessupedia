<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, ref, shallowRef, watch, watchEffect } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppIcon from "@/components/AppIcon.vue";
import DeletePageDialog from "@/components/DeletePageDialog.vue";
import NameDialog from "@/components/NameDialog.vue";
import PageContent from "@/components/PageContent.vue";
import PageDetailsDialog from "@/components/PageDetailsDialog.vue";
import RelationshipsTab from "@/components/RelationshipsTab.vue";
import RenamePageDialog from "@/components/RenamePageDialog.vue";
import TabBar from "@/components/TabBar.vue";
import { useLiveQuery } from "@/composables/useLiveQuery";
import { useTemplateNameCheck } from "@/composables/useTemplateNameCheck";
import type { Page } from "@/db/types";
import { pageCategories } from "@/markdown/categories";
import { titleSegments, topTitle } from "@/markdown/subpages";
import { RELATIONSHIPS_TAB, titleKey } from "@/markdown/wikilinks";
import { titleParam } from "@/router/params";
import { pageService, templateService } from "@/services";
import { useWikiStore } from "@/stores/wiki";

const props = defineProps<{ wikiId: string; title: string }>();

const route = useRoute();
const router = useRouter();
const { currentWiki } = storeToRefs(useWikiStore());

const page = useLiveQuery(
  async ([wikiId, title]) => (await pageService.getByTitle(wikiId, title)) ?? null,
  () => [props.wikiId, props.title] as const,
);

const redirectedFrom = computed(() => {
  void route.fullPath;
  const from: unknown = window.history.state?.redirectedFrom;
  return typeof from === "string" ? from : undefined;
});

watch(page, (found) => {
  if (!found || found.title === props.title) return;
  const viaAlias = found.titleKey !== titleKey(props.title);
  void router.replace({
    name: "page",
    params: { wikiId: props.wikiId, title: titleParam(found.title) },
    hash: route.hash,
    ...(viaAlias && { state: { redirectedFrom: props.title } }),
  });
});

const categories = computed(() => (page.value ? pageCategories(page.value.frontmatter) : []));

// Subpages carry their top page's title as the heading; the tab bar shows which one this is, and a
// subtitle names pages the bar can't, deeper ones and missing ones.
const shownTitle = computed(() => page.value?.title ?? props.title);
const segments = computed(() => titleSegments(shownTitle.value));
const topPage = useLiveQuery(
  async ([wikiId, top]) => (await pageService.getByTitle(wikiId, top)) ?? null,
  () => [props.wikiId, topTitle(shownTitle.value)] as const,
);
const heading = computed(() => (segments.value.length > 1 ? (topPage.value?.title ?? segments.value[0]) : shownTitle.value));

// No page can take this title, so it shows the generated tab of the page above it.
const relationshipsOf = computed(() =>
  segments.value.length === 2 && titleKey(segments.value[1]!) === titleKey(RELATIONSHIPS_TAB) ? topPage.value : undefined,
);

const subtitle = computed(() => {
  if (relationshipsOf.value) return undefined;
  const deep = segments.value.length > 2 || (segments.value.length > 1 && page.value === null);
  return deep ? segments.value.slice(1).join(" › ") : undefined;
});

// Dialogs work on a snapshot, so they stay mounted while the live page they changed reloads.
const dialogPage = shallowRef<Page>();
const dialogs = { details: ref(false), rename: ref(false), template: ref(false), delete: ref(false) };
const { details: detailsOpen, rename: renameOpen, template: templateOpen, delete: deleteOpen } = dialogs;

function openDialog(kind: keyof typeof dialogs) {
  dialogPage.value = page.value ?? undefined;
  dialogs[kind].value = true;
}

const { check: checkTemplateName } = useTemplateNameCheck(() => props.wikiId);

async function saveAsTemplate(name: string) {
  const template = await templateService.fromPage((await pageService.get(dialogPage.value!.id))!, name);
  await router.push({ name: "edit-template", params: { wikiId: props.wikiId, templateId: template.id } });
}

async function saveBody(body: string, summary: string, minor: boolean) {
  await pageService.save(page.value!.id, body, { summary, minor });
}

function showRenamed(title: string) {
  void router.replace({ name: "page", params: { wikiId: props.wikiId, title: titleParam(title) } });
}

watchEffect(() => {
  document.title = [page.value?.title ?? props.title, currentWiki.value?.name].filter(Boolean).join(" | ");
});
</script>

<template>
  <article class="content-card">
    <header class="page-header">
      <div class="page-heading">
        <p v-if="categories.length" class="page-categories">
          in:
          <template v-for="(category, index) in categories" :key="category">
            <RouterLink :to="{ name: 'category', params: { wikiId, name: category } }">{{ category }}</RouterLink>
            <template v-if="index < categories.length - 1">, </template>
          </template>
        </p>
        <h1 class="page-title">{{ heading }}</h1>
      </div>
      <div v-if="page" class="page-actions">
        <RouterLink class="page-action" :to="{ name: 'edit-page', params: { wikiId, title: titleParam(page.title) } }">
          <AppIcon name="edit" />
          Edit
        </RouterLink>
        <button class="page-action" type="button" @click="openDialog('details')">Details</button>
        <button class="page-action" type="button" @click="openDialog('rename')">Rename</button>
        <button class="page-action" type="button" @click="openDialog('template')">Save as template</button>
        <button class="page-action" type="button" @click="openDialog('delete')">Delete</button>
      </div>
    </header>
    <TabBar :wiki-id="wikiId" :title="shownTitle" />
    <p v-if="subtitle" class="page-subtitle">{{ subtitle }}</p>
    <template v-if="dialogPage">
      <PageDetailsDialog v-model:open="detailsOpen" :page="dialogPage" />
      <RenamePageDialog v-model:open="renameOpen" :page="dialogPage" @renamed="showRenamed" />
      <NameDialog
        v-model:open="templateOpen"
        :title="`Save ${dialogPage.title} as a template`"
        label="Template name"
        :initial="dialogPage.title"
        action="Save template"
        :check="(name) => checkTemplateName(name)"
        :submit="saveAsTemplate"
      >
        <p class="dialog-note">The template copies this page as it is. You can trim it to a starting shape next.</p>
      </NameDialog>
      <DeletePageDialog v-model:open="deleteOpen" :page="dialogPage" />
    </template>
    <p v-if="redirectedFrom && page" class="redirect-note">(Redirected from {{ redirectedFrom }})</p>
    <PageContent v-if="page" :key="page.id" :wiki-id="wikiId" :markdown="page.body" :save="saveBody" />
    <RelationshipsTab v-else-if="relationshipsOf" :wiki-id="wikiId" :character="relationshipsOf" />
    <div v-else-if="page === null && topPage !== undefined" class="missing">
      <p>This page doesn't exist yet.</p>
      <RouterLink class="create-button" :to="{ name: 'new-page', params: { wikiId }, query: { title } }">
        Create this page
      </RouterLink>
    </div>
  </article>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid var(--color-border);
}

.page-heading {
  min-width: 0;
}

.page-categories {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.8rem;
}

.page-title {
  margin: 0.25rem 0 0.5rem;
  border: 0;
}

.page-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem 1rem;
  padding-bottom: 0.75rem;
}

.page-action {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-link);
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.page-action .icon {
  width: 1rem;
  height: 1rem;
}

.page-subtitle {
  margin: 0.5rem 0 0;
  font-family: var(--font-heading);
  font-size: 1.2rem;
}

.dialog-note {
  margin: 0.75rem 0 0;
  color: var(--color-muted);
  font-size: 0.9rem;
}

.redirect-note {
  margin: 0.25rem 0 0;
  color: var(--color-muted);
  font-size: 0.85rem;
}

.missing p {
  color: var(--color-muted);
}

.create-button {
  display: inline-block;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  background: var(--color-header);
  color: var(--color-header-text);
}

.create-button:hover {
  text-decoration: none;
}
</style>
