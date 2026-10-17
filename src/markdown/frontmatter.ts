import type { Root } from "mdast";
import { parse as parseYaml } from "yaml";

export interface FrontmatterResult {
  frontmatter: Record<string, unknown>;
  error?: string;
}

export function readFrontmatter(tree: Root): FrontmatterResult {
  const node = tree.children[0];
  if (node?.type !== "yaml") return { frontmatter: {} };

  try {
    const value: unknown = parseYaml(node.value);
    const isRecord = typeof value === "object" && value !== null && !Array.isArray(value);
    return { frontmatter: isRecord ? (value as Record<string, unknown>) : {} };
  } catch (error) {
    return { frontmatter: {}, error: error instanceof Error ? error.message : String(error) };
  }
}

export function stringList(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}
