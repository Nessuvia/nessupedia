import type { Blockquote, BlockContent, Paragraph, Parent, PhrasingContent, Root, RootContent } from "mdast";
import type { Plugin } from "unified";
import type { Callout } from "./nodes";

export const CALLOUT_TYPES = [
  "note",
  "abstract",
  "info",
  "todo",
  "tip",
  "success",
  "question",
  "warning",
  "failure",
  "danger",
  "bug",
  "example",
  "quote",
] as const;

export type CalloutType = (typeof CALLOUT_TYPES)[number];

const ALIASES: Record<string, CalloutType> = {
  summary: "abstract",
  tldr: "abstract",
  hint: "tip",
  important: "tip",
  check: "success",
  done: "success",
  help: "question",
  faq: "question",
  caution: "warning",
  attention: "warning",
  fail: "failure",
  missing: "failure",
  error: "danger",
  cite: "quote",
};

export function calloutType(name: string): CalloutType {
  const key = name.toLowerCase();
  return (CALLOUT_TYPES as readonly string[]).includes(key) ? (key as CalloutType) : (ALIASES[key] ?? "note");
}

const MARKER = /^\[!([\w-]+)\]([+-]?)[ \t]*/;

// Splits the first paragraph at its first line break: the first line is the title, the rest stays as content.
function splitTitle(children: PhrasingContent[]): { title: PhrasingContent[]; rest: PhrasingContent[] } {
  for (const [index, node] of children.entries()) {
    if (node.type === "break") return { title: children.slice(0, index), rest: children.slice(index + 1) };
    if (node.type !== "text") continue;
    const newline = node.value.indexOf("\n");
    if (newline === -1) continue;
    const before = node.value.slice(0, newline);
    const after = node.value.slice(newline + 1);
    return {
      title: [...children.slice(0, index), ...(before ? [{ type: "text" as const, value: before }] : [])],
      rest: [...(after ? [{ type: "text" as const, value: after }] : []), ...children.slice(index + 1)],
    };
  }
  return { title: children, rest: [] };
}

function toCallout(node: Blockquote): Callout | undefined {
  const [first, ...blocks] = node.children;
  const lead = first?.type === "paragraph" ? first.children[0] : undefined;
  if (lead?.type !== "text") return undefined;
  const marker = MARKER.exec(lead.value);
  if (!marker) return undefined;

  const [, name = "", fold] = marker;
  const stripped = lead.value.slice(marker[0].length);
  const phrasing = [...(stripped ? [{ ...lead, value: stripped }] : []), ...(first as Paragraph).children.slice(1)];
  const { title, rest } = splitTitle(phrasing);
  const hasTitle = title.some((child) => child.type !== "text" || child.value.trim());
  const defaultTitle = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  const content = (rest.length > 0 ? [{ type: "paragraph", children: rest }, ...blocks] : blocks) as BlockContent[];

  return {
    type: "callout",
    calloutType: calloutType(name),
    fold: fold as Callout["fold"],
    children: [{ type: "calloutTitle", children: hasTitle ? title : [{ type: "text", value: defaultTitle }] }, ...content],
    position: node.position,
  };
}

const remarkCallouts: Plugin<[], Root> = () => {
  const transform = (parent: Parent) => {
    parent.children = parent.children.map((child: RootContent) => {
      if ("children" in child) transform(child);
      return (child.type === "blockquote" && toCallout(child)) || child;
    }) as Parent["children"];
  };
  return transform;
};

export default remarkCallouts;
