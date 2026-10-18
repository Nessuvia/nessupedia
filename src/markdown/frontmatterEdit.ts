import { isMap, parseDocument, type Document } from "yaml";
import { parseMarkdown } from "./pipeline";

export class FrontmatterError extends Error {
  constructor() {
    super("This page's frontmatter has a YAML error. Fix it in the editor first.");
  }
}

// Template placeholders such as {{date}} read as YAML maps and would be rewritten as {? {date}}, so they
// stand in as plain tokens while the YAML is edited and come back as written.
const PLACEHOLDER = /\{\{[^{}]*\}\}/g;
const TOKEN = /__oc_placeholder_(\d+)__/g;

// Applies `edit` to a page's frontmatter as a YAML document, so untouched keys keep their order and
// comments. Frontmatter left without keys is removed.
export function editFrontmatter(markdown: string, edit: (doc: Document) => void): string {
  const first = parseMarkdown(markdown).tree.children[0];
  const block = first?.type === "yaml" ? first : undefined;
  const placeholders: string[] = [];
  const masked = (block?.value ?? "").replace(PLACEHOLDER, (placeholder) => `__oc_placeholder_${placeholders.push(placeholder) - 1}__`);
  const doc = parseDocument(masked);
  if (doc.errors.length > 0 || (doc.contents !== null && !isMap(doc.contents))) throw new FrontmatterError();

  edit(doc);

  const body = block ? markdown.slice(block.position!.end.offset!) : markdown;
  if (!isMap(doc.contents) || doc.contents.items.length === 0) return body.replace(/^\n+/, "");
  const rest = block ? body : body ? `\n\n${body}` : "\n";
  const yaml = doc.toString({ flowCollectionPadding: false }).trimEnd().replace(TOKEN, (token, index: string) => placeholders[Number(index)] ?? token);
  return `---\n${yaml}\n---${rest}`;
}

// Writes each key as a flow list; an empty list removes its key.
export function updateFrontmatter(markdown: string, update: Record<string, string[]>): string {
  return editFrontmatter(markdown, (doc) => {
    for (const [key, values] of Object.entries(update)) {
      if (values.length === 0) {
        if (doc.contents) doc.delete(key);
        continue;
      }
      const list = doc.createNode(values);
      list.flow = true;
      doc.set(key, list);
    }
  });
}
