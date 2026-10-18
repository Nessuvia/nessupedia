import { isSeq, type Document } from "yaml";
import { isImagePath } from "./embeds";
import { editFrontmatter, FrontmatterError } from "./frontmatterEdit";
import { parseMarkdown } from "./pipeline";
import { unlinkedRanges } from "./retarget";
import { titleError, titleKey } from "./wikilinks";

// Where each link and image in a note points once imported.
export interface NoteTargets {
  // A link target as written, without `.md`, to the title of the page it now names.
  link(target: string): string | undefined;
  // An image path as written to its stored asset path.
  image(path: string): string | undefined;
}

// Obsidian comments, wikilinks and embeds, and markdown images, in one pass so their offsets don't overlap.
const TOKEN = /%%[\s\S]*?%%|!?\[\[([^[\]]+)\]\]|!\[([^\]]*)\]\(<?([^)<>\s]+)>?(?:\s+"[^"]*")?\)/g;
const TAG_CHAR = String.raw`[^\s!"#$%&'()*+,.:;<=>?@[\\\]^\x60{|}~]`;
const INLINE_TAG = new RegExp(String.raw`(?<=^|\s)#(${TAG_CHAR}+)`, "gu");
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

// Characters wikilinks reserve become dashes, so every file name makes a usable title.
export function vaultTitle(name: string): string {
  const title = name
    .normalize("NFC")
    .replace(/\.md$/i, "")
    .replace(/[[\]|#]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return title || "Untitled";
}

// Nested tags read as a path in a category name: "character/main" becomes "character › main".
export function tagCategory(tag: string): string {
  return tag
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" › ");
}

export const tagKey = (tag: string) => tag.replace(/^#/, "").trim().toLowerCase();

// A tag needs something besides digits, as in Obsidian, so "#1" in prose isn't one.
const isTag = (tag: string) => !/^[\d/]*$/.test(tag);

function frontmatterTagValues(frontmatter: Record<string, unknown>): string[] {
  const value = frontmatter.tags ?? frontmatter.tag;
  const values = typeof value === "string" ? value.split(/[,\s]+/) : Array.isArray(value) ? value.map(String) : [];
  return values.map((tag) => tag.replace(/^#/, "").trim()).filter((tag) => tag && isTag(tag));
}

// Every tag a note carries, in frontmatter or inline outside code, each once.
export function noteTags(source: string): string[] {
  const { tree, frontmatter } = parseMarkdown(source);
  const unlinked = unlinkedRanges(tree);
  const tags = frontmatterTagValues(frontmatter);
  for (const match of source.matchAll(INLINE_TAG)) {
    const tag = match[1]!.replace(/\/+$/, "");
    if (isTag(tag) && !unlinked.some(([start, end]) => match.index >= start && match.index < end)) tags.push(tag);
  }
  const seen = new Set<string>();
  return tags.filter((tag) => !seen.has(tagKey(tag)) && seen.add(tagKey(tag)));
}

// Inside tables the bar is written \| so it doesn't end the cell; the rewritten text keeps it that way.
const barIn = (inner: string) => (inner.includes("\\|") ? "\\|" : "|");

function convertLink(inner: string, targets: NoteTargets, raw: string): string {
  const bar = barIn(inner);
  const [targetPart = "", ...labelParts] = inner.split(/\\?\|/);
  const label = labelParts.join("|").trim();
  const hash = targetPart.indexOf("#");
  const written = (hash === -1 ? targetPart : targetPart.slice(0, hash)).trim().replace(/\.md$/i, "");
  const heading = hash === -1 ? "" : targetPart.slice(hash + 1).trim();
  // A link to a heading in the same note has no page to name.
  if (!written) return raw;
  const title = targets.link(written) ?? vaultTitle(written.split("/").at(-1)!);
  const shown = label ? (label === title ? "" : label) : titleKey(title) === titleKey(written) ? "" : written;
  return `[[${title}${heading ? `#${heading}` : ""}${shown ? `${bar}${shown}` : ""}]]`;
}

function convertEmbed(inner: string, targets: NoteTargets, raw: string): string {
  const bar = barIn(inner);
  const [path = "", ...options] = inner.split(/\\?\|/);
  const target = path.split("#")[0]!.trim();
  const asset = isImagePath(target) ? targets.image(target) : undefined;
  if (!asset) return raw;
  const option = options.join("|").trim();
  return `![[${asset}${option ? `${bar}${option}` : ""}]]`;
}

function convertImage(alt: string, href: string, targets: NoteTargets, raw: string): string {
  if (URL_SCHEME.test(href)) return raw;
  // Obsidian reads a fragment such as #interface as styling, not part of the file name.
  let path = href.split("#")[0]!;
  try {
    path = decodeURI(path);
  } catch {
    // A malformed escape stays as written.
  }
  const asset = isImagePath(path) ? targets.image(path) : undefined;
  if (!asset) return raw;
  return `![[${asset}${alt.trim() ? `|${alt.trim()}` : ""}]]`;
}

// Rewrites links, image embeds, and markdown images to their imported targets, and turns %% comments %%
// into HTML comments, which never render. Code and frontmatter stay as written.
export function convertNote(source: string, targets: NoteTargets): string {
  const unlinked = unlinkedRanges(parseMarkdown(source).tree);
  return source.replace(TOKEN, (raw: string, inner: string | undefined, alt: string | undefined, href: string | undefined, offset: number) => {
    if (unlinked.some(([start, end]) => offset >= start && offset < end)) return raw;
    if (raw.startsWith("%%")) return `<!--${raw.slice(2, -2).replaceAll("--", "- -")}-->`;
    if (inner !== undefined) return raw.startsWith("!") ? convertEmbed(inner, targets, raw) : convertLink(inner, targets, raw);
    return convertImage(alt ?? "", href ?? "", targets, raw);
  });
}

// Obsidian properties often hold links, as in `categories: ["[[Movies]]"]`; a category is just the name.
function unlink(value: string): string {
  const match = /^\[\[([^[\]|#]+)(?:#[^[\]|]*)?(?:\|[^[\]]*)?\]\]$/.exec(value.trim());
  return (match ? match[1]! : value).trim();
}

function listAt(doc: Document, key: string): unknown[] {
  const node = doc.get(key, true);
  if (isSeq(node)) return node.toJSON() as unknown[];
  const value = doc.get(key);
  return value === undefined || value === null ? [] : [value];
}

function setList(doc: Document, key: string, values: string[]): void {
  if (values.length === 0) {
    doc.delete(key);
    return;
  }
  const list = doc.createNode(values);
  list.flow = true;
  doc.set(key, list);
}

export interface FrontmatterChanges {
  // Added after the note's own categories, each once.
  categories: string[];
  // Tags, by tagKey, that became categories and leave `tags`.
  movedTags: Set<string>;
}

// Unwraps linked categories, adds new ones, and moves chosen tags out of `tags`. Frontmatter with a YAML
// error is left alone.
export function convertFrontmatter(source: string, { categories, movedTags }: FrontmatterChanges): string {
  if (categories.length === 0 && parseMarkdown(source).tree.children[0]?.type !== "yaml") return source;
  try {
    return editFrontmatter(source, (doc) => {
      const merged = new Map<string, string>();
      for (const value of [...listAt(doc, "categories").map((item) => unlink(String(item))), ...categories]) {
        if (!titleError(value) && !merged.has(titleKey(value))) merged.set(titleKey(value), value);
      }
      if (merged.size || doc.has("categories")) setList(doc, "categories", [...merged.values()]);

      if (movedTags.size) {
        for (const key of ["tags", "tag"]) {
          if (!doc.has(key)) continue;
          const value = doc.get(key);
          const tags = typeof value === "string" ? value.split(/[,\s]+/).filter(Boolean) : listAt(doc, key).map(String);
          const kept = tags.filter((tag) => !movedTags.has(tagKey(tag)));
          if (kept.length !== tags.length) setList(doc, key, kept);
        }
      }

      const aliases = listAt(doc, "aliases").map(String);
      const usable = aliases.map(unlink).filter((alias) => !titleError(alias));
      if (usable.join("\n") !== aliases.join("\n")) setList(doc, "aliases", usable);
    });
  } catch (cause) {
    if (cause instanceof FrontmatterError) return source;
    throw cause;
  }
}
