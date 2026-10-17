<script setup lang="ts">
import type { Root } from "mdast";
import { computed, nextTick, useTemplateRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useLiveQuery } from "@/composables/useLiveQuery";
import { headingId, parseMarkdown, renderMarkdown, type RenderOptions } from "@/markdown/pipeline";
import { buildToc } from "@/markdown/toc";
import { titleKey } from "@/markdown/wikilinks";
import { assetService, pageService } from "@/services";
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

const root = useTemplateRef("root");

// Rendered images name their asset; each re-render gets fresh elements, so sources are filled in after every one.
watch(
  rendered,
  () => {
    for (const image of root.value?.querySelectorAll<HTMLImageElement>("img[data-asset]:not([src])") ?? []) {
      const path = image.dataset.asset!;
      void assetService.objectUrl(props.wikiId, path).then((url) => {
        if (url) return void (image.src = url);
        const missing = document.createElement("span");
        missing.className = "asset-missing";
        missing.textContent = `Missing image: ${path}`;
        image.replaceWith(missing);
      });
    }
  },
  { flush: "post" },
);

function switchTab(tab: HTMLElement) {
  const tabset = tab.closest(".tabset");
  if (!tabset) return;
  for (const other of tabset.querySelectorAll(":scope > .tablist > [role=tab]")) {
    other.setAttribute("aria-selected", String(other === tab));
  }
  for (const panel of tabset.querySelectorAll<HTMLElement>(":scope > [data-panel]")) {
    panel.hidden = panel.dataset.panel !== tab.dataset.tab;
  }
}

watch(rendered, async (now, before) => {
  if (props.preview || !now || before || !route.hash) return;
  await nextTick();
  document.getElementById(decodeURIComponent(route.hash.slice(1)))?.scrollIntoView();
});

function followLink(event: MouseEvent) {
  const tab = (event.target as Element).closest<HTMLElement>("[role=tab][data-tab]");
  if (tab) return switchTab(tab);
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
  <div v-if="rendered" ref="root" class="page-body" @click="followLink">
    <div v-html="rendered.lead" />
    <TableOfContents v-if="rendered.toc.length >= TOC_MIN_HEADINGS" :entries="rendered.toc" />
    <div v-html="rendered.body" />
  </div>
</template>
