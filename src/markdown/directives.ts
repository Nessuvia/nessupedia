import type { Paragraph, Parent, Root, RootContent, Text } from "mdast";
import type { ContainerDirective, TextDirective } from "mdast-util-directive";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";
import { canonTier } from "./canon";
import { parseFields, parseInfobox, type Field } from "./fields";
import type { CanonBlock, FieldNode, InfoboxNode, PressureNode } from "./nodes";

export interface DirectiveOptions {
  parseFragment: (markdown: string) => Root;
}

const CLOSING_FENCE = /^\s*:{3,}\s*$/;

function innerSource(source: string): string {
  const lines = source.split(/\r?\n/).slice(1);
  if (lines.length > 0 && CLOSING_FENCE.test(lines[lines.length - 1]!)) lines.pop();
  return lines.join("\n");
}

function mergeText(nodes: RootContent[]): RootContent[] {
  const merged: RootContent[] = [];
  for (const node of nodes) {
    const last = merged[merged.length - 1];
    if (node.type === "text" && last?.type === "text") merged[merged.length - 1] = { ...last, value: last.value + node.value };
    else merged.push(node);
  }
  return merged;
}

// Turns canon, infobox, and pressure directives into their own nodes. Anything else that only looks
// like a directive, such as `re:Zero` or a stray `::line`, goes back to the text it was written as.
const remarkDirectives: Plugin<[DirectiveOptions], Root> = ({ parseFragment }) => {
  const fieldNode = ({ label, value }: Field): FieldNode => {
    if (!value.trim()) return { type: "field", label, children: [] };
    // Fragment offsets are relative to the value, so they'd point at the wrong text in the page.
    const fragment = parseFragment(value);
    visit(fragment, (node) => {
      delete node.position;
    });
    const [only, ...rest] = fragment.children;
    const children = only?.type === "paragraph" && rest.length === 0 ? only.children : fragment.children;
    return { type: "field", label, children: children as FieldNode["children"] };
  };

  const infobox = (inner: string): Omit<InfoboxNode, "position"> => {
    const data = parseInfobox(inner);
    return {
      type: "infobox",
      title: data.title,
      ...(data.chat && { chat: data.chat }),
      children: [data.shared, ...data.tabs].map((tab) => ({
        type: "infoboxTab",
        label: tab.label,
        images: tab.images,
        children: tab.groups.map((group) => ({ type: "fieldGroup", label: group.label, children: group.fields.map(fieldNode) })),
      })),
    };
  };

  const pressure = (inner: string): Omit<PressureNode, "position"> => ({
    type: "pressure",
    children: parseFields(inner).map(fieldNode),
  });

  return (tree, file) => {
    const source = String(file.value ?? "");
    const sourceOf = (node: RootContent) => source.slice(node.position?.start.offset ?? 0, node.position?.end.offset ?? 0);

    const container = (node: ContainerDirective): RootContent => {
      const { position } = node;
      if (node.name === "canon") {
        const children = node.children.filter(
          (child) => !(child.type === "paragraph" && child.data?.directiveLabel),
        ) as CanonBlock["children"];
        return { type: "canonBlock", tier: canonTier(node.attributes?.tier), children, position };
      }
      if (node.name === "infobox") return { ...infobox(innerSource(sourceOf(node))), position };
      if (node.name === "pressure") return { ...pressure(innerSource(sourceOf(node))), position };
      return node;
    };

    const text = (node: TextDirective): RootContent =>
      node.name === "canon"
        ? { type: "canonInline", tier: canonTier(node.attributes?.tier), children: node.children, position: node.position }
        : ({ type: "text", value: sourceOf(node), position: node.position } satisfies Text);

    const replace = (node: RootContent): RootContent => {
      if (node.type === "containerDirective") return container(node);
      if (node.type === "textDirective") return text(node);
      if (node.type === "leafDirective") {
        const value = sourceOf(node);
        return { type: "paragraph", children: [{ type: "text", value }], position: node.position } satisfies Paragraph;
      }
      return node;
    };

    // Children go first, so a canon mark inside a canon block is already converted.
    const transform = (parent: Parent) => {
      for (const child of parent.children) if ("children" in child) transform(child);
      parent.children = mergeText(parent.children.map(replace)) as Parent["children"];
    };
    transform(tree);
  };
};

export default remarkDirectives;
