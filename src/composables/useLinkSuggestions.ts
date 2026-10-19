import { computed, ref, type Ref } from "vue";
import type { LinkSuggestion, Page } from "@/db/types";
import type { SourceMark } from "@/markdown/pipeline";
import { linkSuggester, pageService } from "@/services";
import { linkMarkup } from "@/services/LinkSuggester";
import { titleKey } from "@/markdown/wikilinks";

// Suggest links on one page: exact mentions at once, and on request the Assistant's indirect ones.
// Accepting a link shifts the offsets of those after it, so the rest stay in place without searching again.
export function useLinkSuggestions(page: Ref<Page | null | undefined>) {
  const active = ref(false);
  const suggestions = ref<LinkSuggestion[]>([]);
  const asking = ref(false);
  const askedOnce = ref(false);
  const error = ref("");
  const note = ref("");
  let controller: AbortController | undefined;

  const marks = computed((): SourceMark[] => suggestions.value.map(({ start, end }, id) => ({ id, start, end })));

  async function start() {
    if (!page.value) return;
    active.value = true;
    askedOnce.value = false;
    error.value = "";
    note.value = "";
    suggestions.value = await linkSuggester.suggest(page.value.id);
  }

  function stop() {
    controller?.abort();
    active.value = false;
    suggestions.value = [];
  }

  async function accept(chosen: LinkSuggestion[]) {
    if (!page.value || chosen.length === 0) return;
    error.value = "";
    try {
      const pages = await pageService.listForWiki(page.value.wikiId);
      await linkSuggester.accept(page.value.id, chosen);
      const shifts = chosen.map((suggestion) => {
        const target = pages.find((candidate) => candidate.titleKey === titleKey(suggestion.title));
        return { at: suggestion.start, by: linkMarkup(suggestion.text, target, suggestion.title).length - suggestion.text.length };
      });
      suggestions.value = suggestions.value
        .filter((suggestion) => !chosen.includes(suggestion))
        .map((suggestion) => {
          const by = shifts.filter((shift) => shift.at < suggestion.start).reduce((sum, shift) => sum + shift.by, 0);
          return { ...suggestion, start: suggestion.start + by, end: suggestion.end + by };
        });
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
    }
  }

  async function ask() {
    if (!page.value || asking.value) return;
    asking.value = true;
    error.value = "";
    note.value = "";
    controller = new AbortController();
    try {
      const run = await linkSuggester.askAssistant(page.value.id, suggestions.value, controller.signal);
      if (run.status === "error") error.value = run.error ?? "The Assistant couldn't answer.";
      const found = run.linkSuggestions ?? [];
      if (run.status === "done") note.value = found.length ? `The Assistant found ${found.length} more.` : "The Assistant found nothing more.";
      suggestions.value = [...suggestions.value, ...found].sort((a, b) => a.start - b.start);
      askedOnce.value = true;
    } finally {
      asking.value = false;
    }
  }

  return {
    active,
    suggestions,
    marks,
    asking,
    askedOnce,
    error,
    note,
    start,
    stop,
    ask,
    cancelAsk: () => controller?.abort(),
    acceptOne: (id: number) => accept(suggestions.value[id] ? [suggestions.value[id]!] : []),
    acceptAll: () => accept([...suggestions.value]),
  };
}
