import { isMap, parseDocument } from "yaml";
import { parseMarkdown } from "./pipeline";

export class FrontmatterError extends Error {
  constructor() {
    super("This page's frontmatter has a YAML error. Fix it in the editor first.");
  }
}

// Rewrites the given keys of a page's frontmatter as flow lists, keeping every other key, its order, and
// comments. An empty list removes its key, and frontmatter left without keys is removed.
export function updateFrontmatter(markdown: string, update: Record<string, string[]>): string {
  const first = parseMarkdown(markdown).tree.children[0];
  const block = first?.type === "yaml" ? first : undefined;
  const doc = parseDocument(block?.value ?? "");
  if (doc.errors.length > 0 || (doc.contents !== null && !isMap(doc.contents))) throw new FrontmatterError();

  for (const [key, values] of Object.entries(update)) {
    if (values.length === 0) {
      if (doc.contents) doc.delete(key);
      continue;
    }
    const list = doc.createNode(values);
    list.flow = true;
    doc.set(key, list);
  }

  const body = block ? markdown.slice(block.position!.end.offset!) : markdown;
  if (!isMap(doc.contents) || doc.contents.items.length === 0) return body.replace(/^\n+/, "");
  const rest = block ? body : body ? `\n\n${body}` : "\n";
  return `---\n${doc.toString({ flowCollectionPadding: false }).trimEnd()}\n---${rest}`;
}
