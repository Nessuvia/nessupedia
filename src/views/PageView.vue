<script setup lang="ts">
import type { Root } from "mdast";
import { storeToRefs } from "pinia";
import { computed, nextTick, watch, watchEffect } from "vue";
import { useRoute, useRouter } from "vue-router";
import TableOfContents from "@/components/TableOfContents.vue";
import { useLiveQuery } from "@/composables/useLiveQuery";
import { headingId, parseMarkdown, renderMarkdown, type RenderOptions } from "@/markdown/pipeline";
import { buildToc } from "@/markdown/toc";
import { titleKey } from "@/markdown/wikilinks";
import { pageService } from "@/services";
import { useWikiStore } from "@/stores/wiki";

const props = defineProps<{ wikiId: string; title: string }>();

const TOC_MIN_HEADINGS = 3;

const route = useRoute();
const router = useRouter();
const { currentWiki } = storeToRefs(useWikiStore());

const page = useLiveQuery(
  async ([wikiId, title]) => (await pageService.getByTitle(wikiId, title)) ?? null,
  () => [props.wikiId, props.title] as const,
);
const pages = useLiveQuery((wikiId) => pageService.listForWiki(wikiId), () => props.wikiId);

const existingNames = computed(
  () => new Set(pages.value?.flatMap((existing) => [existing.titleKey, ...existing.aliasKeys])),
);

// The lead renders above the table of contents, so the body splits at its first section heading.
const rendered = computed(() => {
  if (!page.value || !pages.value) return undefined;
  const tree = parseMarkdown(page.value.body).tree;
  const split = tree.children.findIndex((node) => node.type === "heading" && node.depth >= 2);
  const at = split === -1 ? tree.children.length : split;
  const exists = (title: string) => existingNames.value.has(titleKey(title));
  const options: RenderOptions = {
    pageExists: exists,
    pageHref: (title, heading) =>
      router.resolve(
        exists(title)
          ? { name: "page", params: { wikiId: props.wikiId, title }, hash: heading && `#${headingId(heading)}` }
          : { name: "new-page", params: { wikiId: props.wikiId }, query: { title } },
      ).href,
  };
  const part = (children: Root["children"]) => renderMarkdown({ ...tree, children }, options);
  const lead = part(tree.children.slice(0, at));
  const body = part(tree.children.slice(at));
  return { lead: lead.html, body: body.html, toc: buildToc(body.headings) };
});

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
    params: { wikiId: props.wikiId, title: found.title },
    hash: route.hash,
    ...(viaAlias && { state: { redirectedFrom: props.title } }),
  });
});

watch(rendered, async (now, before) => {
  if (!now || before || !route.hash) return;
  await nextTick();
  document.getElementById(decodeURIComponent(route.hash.slice(1)))?.scrollIntoView();
});

function followLink(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = (event.target as Element).closest<HTMLAnchorElement>("a.wikilink");
  if (!link) return;
  event.preventDefault();
  void router.push(link.getAttribute("href")!);
}

watchEffect(() => {
  document.title = [page.value?.title ?? props.title, currentWiki.value?.name].filter(Boolean).join(" | ");
});
</script>

<template>
  <article class="content-card">
    <header class="page-header">
      <h1 class="page-title">{{ page?.title ?? title }}</h1>
    </header>
    <p v-if="redirectedFrom && page" class="redirect-note">(Redirected from {{ redirectedFrom }})</p>
    <div v-if="rendered" class="page-body" @click="followLink">
      <div v-html="rendered.lead" />
      <TableOfContents v-if="rendered.toc.length >= TOC_MIN_HEADINGS" :entries="rendered.toc" />
      <div v-html="rendered.body" />
    </div>
    <div v-else-if="page === null" class="missing">
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

.page-title {
  margin: 0.25rem 0 0.5rem;
  border: 0;
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
