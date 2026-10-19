import { snippet, startCompletion, type Completion, type CompletionSource } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import { PRESSURE_FIELDS } from "@/markdown/fields";
import { templateParts } from "@/markdown/templates";
import { templateService } from "@/services";
import { assistantActionHandler, type SlashAssistantAction } from "./assistantActions";
import { insertImages, type ImageInsertOptions } from "./images";

export interface SlashMenuOptions extends ImageInsertOptions {
  // Text of the page outside this editor, for inline editors that hold one block.
  surroundingText?: () => string;
}

type Apply = Exclude<Completion["apply"], string | undefined>;

const PRESSURE = /^:{3,}\s*pressure\b/m;

// Block snippets start on a fresh line, so a slash typed mid-paragraph opens one below it.
function blockSnippet(template: string): Apply {
  return (view, completion, from, to) => {
    const line = view.state.doc.lineAt(from);
    const prefix = view.state.sliceDoc(line.from, from).trim() ? "\n\n" : "";
    snippet(prefix + template)(view, completion, from, to);
  };
}

// Inserts text as written, for content that may hold snippet syntax, with the cursor after it.
function blockText(text: string): Apply {
  return (view, _completion, from, to) => {
    const line = view.state.doc.lineAt(from);
    const insert = (view.state.sliceDoc(line.from, from).trim() ? "\n\n" : "") + text;
    view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length } });
  };
}

const TEMPLATE_SECTIONS = { name: "Section from template", rank: 1 };

async function templateSections(wikiId: string): Promise<Completion[]> {
  const templates = await templateService.list(wikiId);
  return templates.flatMap((template) =>
    templateParts(template.body)
      .filter((part) => part.kind === "section")
      .map((part) => ({
        label: `${template.name} › ${part.label}`,
        section: TEMPLATE_SECTIONS,
        apply: blockText(`${template.body.slice(part.start, part.end).trimEnd()}\n`),
      })),
  );
}

function pickImages(view: EditorView, from: number, to: number, options: ImageInsertOptions) {
  view.dispatch({ changes: { from, to } });
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.multiple = true;
  input.addEventListener("change", () => {
    const files = [...(input.files ?? [])];
    if (files.length > 0) void insertImages(view, files, from, options);
  });
  input.click();
}

const PRESSURE_TEMPLATE = `:::pressure\n${PRESSURE_FIELDS.map((label, index) => `${label}: ${index === 0 ? "${}" : ""}`.trimEnd()).join("\n")}\n:::\n`;

const ASSISTANT = { name: "Assistant", rank: 2 };

function assistantCommands(): Completion[] {
  const handle = assistantActionHandler();
  if (!handle) return [];
  const command = (label: string, detail: string, action: SlashAssistantAction): Completion => ({
    label,
    detail,
    section: ASSISTANT,
    apply: (view, _completion, from, to) => {
      view.dispatch({ changes: { from, to } });
      handle(action);
    },
  });
  return [command("Draft from notes", "Assistant", "draft"), command("Fill template", "Assistant", "fill")];
}

export function slashMenu(options: SlashMenuOptions): CompletionSource {
  const commands = (hasPressure: boolean): Completion[] => [
    { label: "Infobox", detail: "Title, image, and facts", apply: blockSnippet(":::infobox\ntitle: ${Title}\n## ${Biographical}\n${Label}: ${Value}\n:::\n") },
    { label: "Canon note", detail: "Canon", apply: blockSnippet(":::canon{tier=hard}\n${}\n:::\n") },
    { label: "Likely note", detail: "Canon note: Likely", apply: blockSnippet(":::canon{tier=soft}\n${}\n:::\n") },
    { label: "Idea note", detail: "Canon note: Idea", apply: blockSnippet(":::canon{tier=maybe}\n${}\n:::\n") },
    { label: "Inline canon note", detail: "Mark a phrase", apply: snippet(":canon[${text}]{tier=${maybe}}") },
    ...(hasPressure ? [] : [{ label: "Pressure profile", detail: "How they break", apply: blockSnippet(PRESSURE_TEMPLATE) }]),
    { label: "Callout", detail: "Note, tip, warning…", apply: blockSnippet("> [!${note}] ${Title}\n> ${}") },
    { label: "Image", detail: "Upload from this device", apply: (view, _completion, from, to) => pickImages(view, from, to, options) },
    {
      label: "Link to page",
      detail: "[[Page]]",
      apply: (view, _completion, from, to) => {
        view.dispatch({ changes: { from, to, insert: "[[]]" }, selection: { anchor: from + 2 } });
        startCompletion(view);
      },
    },
    ...assistantCommands(),
  ];

  return async (context) => {
    const typed = context.matchBefore(/\/[\w ]*$/);
    if (!typed) return null;
    const before = context.state.sliceDoc(typed.from - 1, typed.from);
    if (before && !/\s/.test(before)) return null;
    // A space ends the menu once nothing matches, so "/ " and prose like "and/or" stay plain text.
    if (typed.text.includes(" ") && !context.explicit && /\s$/.test(typed.text)) return null;

    // Options filter on the text after the slash, and applying one replaces the slash too.
    const hasPressure = PRESSURE.test(context.state.doc.toString()) || PRESSURE.test(options.surroundingText?.() ?? "");
    const sections = await templateSections(options.wikiId());
    if (context.aborted) return null;
    const withSlash = [...commands(hasPressure), ...sections].map((command) => ({
      ...command,
      apply: ((view, completion, from, to) => (command.apply as Apply)(view, completion, from - 1, to)) satisfies Apply,
    }));
    return { from: typed.from + 1, options: withSlash, validFor: /^[\w ]*$/ };
  };
}
