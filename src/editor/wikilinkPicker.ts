import type { Completion, CompletionSource } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import { titleKey } from "@/markdown/wikilinks";
import { searchService } from "@/services";

const OPEN_LINK = /\[\[[^[\]|#\n]*$/;

// Replaces the typed query with the name and closes the link, unless closeBrackets already did.
function insertLink(name: string) {
  return (view: EditorView, _completion: Completion, from: number, to: number) => {
    const closed = view.state.sliceDoc(to, to + 2) === "]]";
    view.dispatch({
      changes: { from, to, insert: closed ? name : `${name}]]` },
      selection: { anchor: from + name.length + 2 },
    });
  };
}

export function wikilinkPicker(wikiId: () => string): CompletionSource {
  return async (context) => {
    const typed = context.matchBefore(OPEN_LINK);
    if (!typed) return null;
    const query = typed.text.slice(2);
    const hits = query.trim() ? await searchService.suggest(wikiId(), query, { limit: 10 }) : [];
    if (context.aborted) return null;

    const options: Completion[] = hits.map((hit, index) => ({
      label: hit.alias ?? hit.title,
      detail: hit.alias ? `→ ${hit.title}` : undefined,
      type: "page",
      boost: -index,
      apply: insertLink(hit.alias ?? hit.title),
    }));
    const name = query.trim();
    const exists = hits.some((hit) => titleKey(hit.alias ?? hit.title) === titleKey(name));
    if (name && !exists) {
      options.push({ label: `Create page “${name}”`, detail: "red link", type: "new-page", boost: -99, apply: insertLink(name) });
    }
    if (options.length === 0) options.push({ label: "Type to search pages", type: "hint", apply: () => {} });

    return { from: typed.from + 2, options, filter: false };
  };
}
