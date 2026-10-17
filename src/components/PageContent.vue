<script setup lang="ts">
import type { Root } from "mdast";
import { computed, nextTick, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useLiveQuery } from "@/composables/useLiveQuery";
import { headingId, parseMarkdown, renderMarkdown, type RenderOptions } from "@/markdown/pipeline";
import { buildToc } from "@/markdown/toc";
import { titleKey } from "@/markdown/wikilinks";
import { pageService } from "@/services";
import TableOfContents from "./TableOfContents.vue";

// In preview mode links stay put, so a click can't leave the editor.
const props = defineProps<{ wikiId: string; markdown: string; preview?: boolean }>();

const TOC_MIN_HEADINGS = 3;

const route = useRoute();
const router = useRouter();

const pages = useLiveQuery((wikiId) => pageService.listForWiki(wikiId), () => props.wikiId);
const existingNames = computed(
  () => new Set(pages.value?.flatMap((existing) => [existing.titleKey, ...existing.aliasKeys])),
);

// The lead renders above the table of contents, so the body splits at its first section heading.
const rendered = computed(() => {
  if (!pages.value) return undefined;
  const tree = parseMarkdown(props.markdown).tree;
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

watch(rendered, async (now, before) => {
  if (props.preview || !now || before || !route.hash) return;
  await nextTick();
  document.getElementById(decodeURIComponent(route.hash.slice(1)))?.scrollIntoView();
});

function followLink(event: MouseEvent) {
  const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
  if (!link) return;
  if (props.preview) {
    if (!link.getAttribute("href")!.startsWith("#")) event.preventDefault();
    return;
  }
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (!link.classList.contains("wikilink")) return;
  event.preventDefault();
  void router.push(link.getAttribute("href")!);
}
</script>

<template>
  <div v-if="rendered" class="page-body" @click="followLink">
    <div v-html="rendered.lead" />
    <TableOfContents v-if="rendered.toc.length >= TOC_MIN_HEADINGS" :entries="rendered.toc" />
    <div v-html="rendered.body" />
  </div>
</template>
