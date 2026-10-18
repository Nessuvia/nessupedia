import { describe, expect, it } from "vitest";
import { FrontmatterError, updateFrontmatter } from "@/markdown/frontmatterEdit";
import { parseMarkdown } from "@/markdown/pipeline";

describe("updateFrontmatter", () => {
  it("adds frontmatter to a page without any", () => {
    expect(updateFrontmatter("Hello", { categories: ["Characters"] })).toBe("---\ncategories: [Characters]\n---\n\nHello");
    expect(updateFrontmatter("", { aliases: ["Mi"] })).toBe("---\naliases: [Mi]\n---\n");
  });

  it("replaces keys in place and keeps other keys, their order, and comments", () => {
    const page = "---\n# Notes stay\naliases: Mi\nmood: grim\ncategories: [Old]\n---\n\nBody";
    const updated = updateFrontmatter(page, { aliases: ["Mi", "Vale"], categories: ["Characters"] });

    expect(updated).toBe("---\n# Notes stay\naliases: [Mi, Vale]\nmood: grim\ncategories: [Characters]\n---\n\nBody");
    expect(parseMarkdown(updated).frontmatter).toEqual({ aliases: ["Mi", "Vale"], mood: "grim", categories: ["Characters"] });
  });

  it("quotes names YAML would misread", () => {
    const updated = updateFrontmatter("Body", { aliases: ["Vale, Mira", "Re: Zero", "yes"] });
    expect(parseMarkdown(updated).frontmatter.aliases).toEqual(["Vale, Mira", "Re: Zero", "yes"]);
  });

  it("removes emptied keys, and the whole block once no keys are left", () => {
    expect(updateFrontmatter("---\naliases: [Mi]\nmood: grim\n---\n\nBody", { aliases: [] })).toBe("---\nmood: grim\n---\n\nBody");
    expect(updateFrontmatter("---\naliases: [Mi]\n---\n\nBody", { aliases: [] })).toBe("Body");
    expect(updateFrontmatter("Body", { aliases: [] })).toBe("Body");
  });

  it("refuses frontmatter that isn't a YAML mapping", () => {
    expect(() => updateFrontmatter("---\naliases: [Mi\n---\n\nBody", { aliases: [] })).toThrow(FrontmatterError);
    expect(() => updateFrontmatter("---\n- a list\n---\n\nBody", { aliases: [] })).toThrow(FrontmatterError);
  });
});
