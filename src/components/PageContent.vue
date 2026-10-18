<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, onUpdated, ref, useTemplateRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { CanonTier } from "@/db/types";
import { useLiveQuery } from "@/composables/useLiveQuery";
import { editSummary, spliceBlock } from "@/markdown/blocks";
import { setCanonTier, shiftTier, TIER_LABELS } from "@/markdown/canon";
import { headingId, parseMarkdown, renderMarkdown, type RenderedBlock, type RenderOptions } from "@/markdown/pipeline";
import { buildToc } from "@/markdown/toc";
import { titleKey } from "@/markdown/wikilinks";
import { titleParam } from "@/router/params";
import { assetService, pageService } from "@/services";
import TableOfContents from "./TableOfContents.vue";

// CodeMirror and the forms load on the first edit, so reading pages stays light.
const BlockEditor = defineAsyncComponent(() => import("./BlockEditor.vue"));

export type SaveBody = (body: string, summary: string, minor: boolean) => Promise<void>;

// In preview mode links stay put, so a click can't leave the editor, and clicking a block reports
// its source offset instead. Passing `save` makes blocks editable in place.
const props = defineProps<{ wikiId: string; markdown: string; preview?: boolean; save?: SaveBody }>();
const emit = defineEmits<{ locate: [offset: number] }>();

const TOC_MIN_HEADINGS = 3;

const route = useRoute();
const router = useRouter();

const pages = useLiveQuery((wikiId) => pageService.listForWiki(wikiId), () => props.wikiId);
const existingNames = computed(
  () => new Set(pages.value?.flatMap((existing) => [existing.titleKey, ...existing.aliasKeys])),
);

// The lead renders above the table of contents, so the contents box sits before the first section heading.
const rendered = computed(() => {
  if (!pages.value) return undefined;
  const { tree } = parseMarkdown(props.markdown);
  const exists = (title: string) => existingNames.value.has(titleKey(title));
  const options: RenderOptions = {
    pageExists: exists,
    pageHref: (title, heading) =>
      router.resolve(
        exists(title)
          ? { name: "page", params: { wikiId: props.wikiId, title: titleParam(title) }, hash: heading && `#${headingId(heading)}` }
          : { name: "new-page", params: { wikiId: props.wikiId }, query: { title } },
      ).href,
  };
  const { blocks, headings } = renderMarkdown(tree, options);
  const toc = buildToc(headings);
  const firstSection = blocks.findIndex(({ kind }) => /^h[2-6]$/.test(kind));
  return { tree, blocks, toc, tocAt: toc.length >= TOC_MIN_HEADINGS ? firstSection : -1 };
});

const root = useTemplateRef("root");

// Rendered images name their asset. Opening or closing an editor re-creates a block's elements
// without changing `rendered`, so sources are filled in after every update.
function resolveImages() {
  for (const image of root.value?.querySelectorAll<HTMLImageElement>("img[data-asset]:not([data-resolving])") ?? []) {
    const path = image.dataset.asset!;
    image.dataset.resolving = "";
    void assetService.objectUrl(props.wikiId, path).then((url) => {
      if (url) return void (image.src = url);
      const missing = document.createElement("span");
      missing.className = "asset-missing";
      missing.textContent = `Missing image: ${path}`;
      image.replaceWith(missing);
    });
  }
}
onMounted(resolveImages);
onUpdated(resolveImages);

watch(rendered, async (now, before) => {
  if (props.preview || !now || before || !route.hash) return;
  await nextTick();
  document.getElementById(decodeURIComponent(route.hash.slice(1)))?.scrollIntoView();
});

interface Editing {
  start: number;
  end: number;
  kind: string;
  source: string;
}

const editing = ref<Editing>();
const saving = ref(false);
const error = ref("");

async function write(body: string, summary: string, minor: boolean): Promise<boolean> {
  saving.value = true;
  error.value = "";
  try {
    await props.save!(body, summary, minor);
    return true;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
    return false;
  } finally {
    saving.value = false;
  }
}

function openEditor(block: RenderedBlock) {
  error.value = "";
  editing.value = { start: block.start, end: block.end, kind: block.kind, source: props.markdown.slice(block.start, block.end) };
}

async function saveBlock(text: string, minor: boolean) {
  const target = editing.value;
  if (!target || !rendered.value) return;
  try {
    const body = spliceBlock(props.markdown, target.start, target.end, target.source, text);
    if (await write(body, editSummary(rendered.value.tree, target.start), minor)) editing.value = undefined;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
}

async function shiftCanon(button: HTMLElement) {
  const mark = button.closest<HTMLElement>("[data-tier]");
  const start = Number(mark?.dataset.start);
  const end = Number(mark?.dataset.end);
  const next = shiftTier(mark?.dataset.tier as CanonTier, Number(button.dataset.shift) === 1 ? 1 : -1);
  if (!mark || !next || Number.isNaN(start) || Number.isNaN(end)) return;
  const source = props.markdown.slice(start, end);
  const body = props.markdown.slice(0, start) + setCanonTier(source, next) + props.markdown.slice(end);
  await write(body, `Marked as ${TIER_LABELS[next]}`, false);
}

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

function followLink(event: MouseEvent, link: HTMLAnchorElement) {
  if (props.preview) {
    if (!link.getAttribute("href")!.startsWith("#")) event.preventDefault();
    return;
  }
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (!link.classList.contains("wikilink")) return;
  event.preventDefault();
  void router.push(link.getAttribute("href")!);
}

// Links, tabs, and fold toggles keep their own behavior; selecting text doesn't open an editor.
function onClick(event: MouseEvent, block: RenderedBlock) {
  const target = event.target as Element;
  const tab = target.closest<HTMLElement>("[role=tab][data-tab]");
  if (tab) return switchTab(tab);
  const shift = target.closest<HTMLElement>(".canon-shift");
  if (shift) return void (props.save && !saving.value && shiftCanon(shift));
  const link = target.closest<HTMLAnchorElement>("a[href]");
  if (link) return followLink(event, link);
  if (target.closest("summary") || block.start < 0 || !window.getSelection()?.isCollapsed) return;
  if (props.preview) emit("locate", block.start);
  else if (props.save && !editing.value) openEditor(block);
}
</script>

<template>
  <div v-if="rendered" ref="root" class="page-body" :class="{ editable: !!save, preview }">
    <p v-if="error && !editing" class="form-error" role="alert">{{ error }}</p>
    <template v-for="(block, index) in rendered.blocks" :key="index">
      <TableOfContents v-if="index === rendered.tocAt" :entries="rendered.toc" />
      <BlockEditor
        v-if="editing?.start === block.start"
        :wiki-id="wikiId"
        :kind="editing.kind"
        :source="editing.source"
        :surrounding-text="markdown"
        :saving="saving"
        :error="error"
        @save="saveBlock"
        @cancel="editing = undefined"
      />
      <div v-else class="block" @click="onClick($event, block)" v-html="block.html" />
    </template>
  </div>
</template>

<style scoped>
.editable .block:hover > :deep(*),
.preview .block:hover > :deep(*) {
  outline: 1px dashed var(--color-border);
  outline-offset: 4px;
}

.editable .block,
.preview .block {
  cursor: text;
}

.editable .block :deep(a),
.editable .block :deep(button),
.editable .block :deep(summary) {
  cursor: pointer;
}
</style>
