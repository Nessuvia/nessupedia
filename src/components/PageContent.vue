<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, onUpdated, ref, useTemplateRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { CanonTier } from "@/db/types";
import { useLiveQuery } from "@/composables/useLiveQuery";
import { editSummary, spliceBlock } from "@/markdown/blocks";
import { setCanonTier, shiftTier, TIER_LABELS } from "@/markdown/canon";
import { headingId, parseMarkdown, renderMarkdown, type RenderedBlock, type RenderOptions } from "@/markdown/pipeline";
import { buildToc } from "@/markdown/toc";
import {
  forkLead,
  forkSection,
  hideSection,
  mergeVersion,
  segmentAt,
  toOwnRange,
  unhideSection,
  type Segment,
} from "@/markdown/versions";
import { titleKey } from "@/markdown/wikilinks";
import { titleParam } from "@/router/params";
import { assetService, pageService } from "@/services";
import TableOfContents from "./TableOfContents.vue";

// CodeMirror and the forms load on the first edit, so reading pages stays light.
const BlockEditor = defineAsyncComponent(() => import("./BlockEditor.vue"));

export type SaveBody = (body: string, summary: string, minor: boolean) => Promise<void>;

// In preview mode links stay put, so a click can't leave the editor, and clicking a block reports
// its source offset instead. Passing `save` makes blocks editable in place.
// A version passes its main page's body as `inheritFrom` and its continuity's name: the two render
// merged, only the version's own blocks can be edited, and links prefer pages' versions in the continuity.
const props = defineProps<{
  wikiId: string;
  markdown: string;
  preview?: boolean;
  save?: SaveBody;
  inheritFrom?: string;
  continuity?: string;
}>();
const emit = defineEmits<{ locate: [offset: number] }>();

const TOC_MIN_HEADINGS = 3;

const route = useRoute();
const router = useRouter();

const pages = useLiveQuery((wikiId) => pageService.listForWiki(wikiId), () => props.wikiId);
const existingNames = computed(
  () => new Set(pages.value?.flatMap((existing) => [existing.titleKey, ...existing.aliasKeys])),
);

const merged = computed(() => (props.inheritFrom === undefined ? undefined : mergeVersion(props.inheritFrom, props.markdown)));

// The lead renders above the table of contents, so the contents box sits before the first section heading.
const rendered = computed(() => {
  if (!pages.value) return undefined;
  const { tree } = parseMarkdown(merged.value?.markdown ?? props.markdown);
  const exists = (title: string) => existingNames.value.has(titleKey(title));
  const target = (title: string) => (props.continuity && exists(`${title}/${props.continuity}`) ? `${title}/${props.continuity}` : title);
  const options: RenderOptions = {
    pageExists: exists,
    pageHref: (title, heading) =>
      router.resolve(
        exists(title)
          ? { name: "page", params: { wikiId: props.wikiId, title: titleParam(target(title)) }, hash: heading && `#${headingId(heading)}` }
          : { name: "new-page", params: { wikiId: props.wikiId }, query: { title } },
      ).href,
  };
  const { blocks, headings } = renderMarkdown(tree, options);
  const toc = buildToc(headings);
  const firstSection = blocks.findIndex(({ kind }) => /^h[2-6]$/.test(kind));
  return { blocks, toc, tocAt: toc.length >= TOC_MIN_HEADINGS ? firstSection : -1 };
});

interface Placed {
  block: RenderedBlock;
  // The block's range in `markdown`, absent for blocks inherited from the main page.
  own?: { start: number; end: number };
  // Set on the first block of an inherited lead or section, which carries its controls.
  inheritedStart?: Segment;
}

const placed = computed((): Placed[] =>
  (rendered.value?.blocks ?? []).map((block) => {
    if (!merged.value) return { block, own: block.start < 0 ? undefined : { start: block.start, end: block.end } };
    const segment = segmentAt(merged.value, block.start);
    if (segment?.origin !== "main") return { block, own: toOwnRange(merged.value, block.start, block.end) };
    return { block, ...(segment.mergedStart === block.start && { inheritedStart: segment }) };
  }),
);

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
  // Where the editor sits among rendered blocks, which differs from `start` on a version.
  at: number;
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

function openEditor({ block, own }: Placed) {
  if (!own) return;
  error.value = "";
  editing.value = { at: block.start, ...own, kind: block.kind, source: props.markdown.slice(own.start, own.end) };
}

async function saveBlock(text: string, minor: boolean) {
  const target = editing.value;
  if (!target) return;
  try {
    const body = spliceBlock(props.markdown, target.start, target.end, target.source, text);
    if (await write(body, editSummary(parseMarkdown(props.markdown).tree, target.start), minor)) editing.value = undefined;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
}

function ownRange(start: number, end: number) {
  return merged.value ? toOwnRange(merged.value, start, end) : { start, end };
}

async function shiftCanon(button: HTMLElement) {
  const mark = button.closest<HTMLElement>("[data-tier]");
  const range = ownRange(Number(mark?.dataset.start), Number(mark?.dataset.end));
  const next = shiftTier(mark?.dataset.tier as CanonTier, Number(button.dataset.shift) === 1 ? 1 : -1);
  if (!mark || !next || !range || Number.isNaN(range.start) || Number.isNaN(range.end)) return;
  const source = props.markdown.slice(range.start, range.end);
  const body = props.markdown.slice(0, range.start) + setCanonTier(source, next) + props.markdown.slice(range.end);
  await write(body, `Marked as ${TIER_LABELS[next]}`, false);
}

const sectionName = (segment: Segment) => (segment.kind === "lead" ? "the introduction" : `“${segment.label}”`);

async function fork(segment: Segment) {
  const body = segment.kind === "lead" ? forkLead(props.inheritFrom!, props.markdown) : forkSection(props.inheritFrom!, props.markdown, segment.key!);
  await write(body, `Changed ${sectionName(segment)} for this version`, false);
}

async function hide(segment: Segment) {
  await write(hideSection(props.markdown, segment.label!), `Hid ${sectionName(segment)} in this version`, false);
}

async function unhide(section: { key: string; label: string }) {
  await write(unhideSection(props.markdown, section.key), `Showed “${section.label}” in this version again`, false);
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
function onClick(event: MouseEvent, item: Placed) {
  const target = event.target as Element;
  const tab = target.closest<HTMLElement>("[role=tab][data-tab]");
  if (tab) return switchTab(tab);
  const shift = target.closest<HTMLElement>(".canon-shift");
  if (shift) return void (props.save && !saving.value && shiftCanon(shift));
  const link = target.closest<HTMLAnchorElement>("a[href]");
  if (link) return followLink(event, link);
  if (target.closest("summary") || !item.own || !window.getSelection()?.isCollapsed) return;
  if (props.preview) emit("locate", item.own.start);
  else if (props.save && !editing.value) openEditor(item);
}
</script>

<template>
  <div v-if="rendered" ref="root" class="page-body" :class="{ editable: !!save, preview }">
    <p v-if="error && !editing" class="form-error" role="alert">{{ error }}</p>
    <template v-for="(item, index) in placed" :key="index">
      <TableOfContents v-if="index === rendered.tocAt" :entries="rendered.toc" />
      <div v-if="item.inheritedStart" class="inherited-bar">
        <span>From main canon</span>
        <template v-if="save && !preview">
          <button type="button" :disabled="saving" @click="fork(item.inheritedStart)">Change for this version</button>
          <button v-if="item.inheritedStart.kind === 'section'" type="button" :disabled="saving" @click="hide(item.inheritedStart)">
            Hide in this version
          </button>
        </template>
      </div>
      <BlockEditor
        v-if="editing?.at === item.block.start"
        :wiki-id="wikiId"
        :kind="editing.kind"
        :source="editing.source"
        :surrounding-text="markdown"
        :saving="saving"
        :error="error"
        @save="saveBlock"
        @cancel="editing = undefined"
      />
      <div v-else class="block" :class="{ inherited: merged && !item.own }" @click="onClick($event, item)" v-html="item.block.html" />
    </template>
    <p v-if="save && !preview && merged?.hidden.length" class="hidden-sections">
      Hidden in this version:
      <template v-for="(section, index) in merged.hidden" :key="section.key">
        {{ section.label }}
        <button type="button" :disabled="saving" @click="unhide(section)">Show</button><template v-if="index < merged.hidden.length - 1">, </template>
      </template>
    </p>
  </div>
</template>

<style scoped>
.editable .block:not(.inherited):hover > :deep(*),
.preview .block:not(.inherited):hover > :deep(*) {
  outline: 1px dashed var(--color-border);
  outline-offset: 4px;
}

.editable .block:not(.inherited),
.preview .block:not(.inherited) {
  cursor: text;
}

.editable .block :deep(a),
.editable .block :deep(button),
.editable .block :deep(summary) {
  cursor: pointer;
}

.block.inherited :deep(.template-hint),
.block.inherited :deep(.canon-shift) {
  display: none;
}

.inherited-bar,
.hidden-sections {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 0.75rem;
  color: var(--color-muted);
  font-size: 0.8rem;
}

.inherited-bar {
  margin: 1rem 0 -0.5rem;
  font-style: italic;
}

.hidden-sections {
  gap: 0.25rem;
  margin-top: 2rem;
}

.inherited-bar button,
.hidden-sections button {
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-link);
  font: inherit;
  font-style: normal;
  cursor: pointer;
}
</style>
