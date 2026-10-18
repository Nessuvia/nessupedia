import type { Template } from "@/db/types";
import { parseMarkdown } from "@/markdown/pipeline";
import character from "./character.md?raw";
import location from "./location.md?raw";
import relationship from "./relationship.md?raw";

const bundled = (id: string, name: string, body: string): Template => ({
  id: `bundled:${id}`,
  name,
  body,
  frontmatter: parseMarkdown(body).frontmatter,
});

export const BUNDLED_TEMPLATES: readonly Template[] = [
  bundled("character", "Character", character),
  bundled("location", "Location", location),
  bundled("relationship", "Relationship", relationship),
];

export const RELATIONSHIP_TEMPLATE_ID = "bundled:relationship";

export const isBundled = (template: Pick<Template, "id">) => template.id.startsWith("bundled:");
