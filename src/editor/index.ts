import { EditorState, type Extension } from "@codemirror/state";
import { imagePasteAndDrop } from "./images";
import { slashMenu, type SlashMenuOptions } from "./slashMenu";
import { wikilinkPicker } from "./wikilinkPicker";

export type WikiEditingOptions = SlashMenuOptions;

// Slash menu, page picker, and image paste and drop, for every editor that writes page markdown.
export function wikiEditing(options: WikiEditingOptions): Extension {
  // Autocompletion tracks sources by identity, so they're built once rather than per lookup.
  const sources = [{ autocomplete: slashMenu(options) }, { autocomplete: wikilinkPicker(options.wikiId) }];
  return [
    EditorState.languageData.of(() => sources),
    imagePasteAndDrop(options),
  ];
}
