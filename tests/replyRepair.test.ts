import { describe, expect, it } from "vitest";
import { isRepeating, repairReply, wrapIdea } from "@/llm/ReplyRepair";
import { parseMarkdown } from "@/markdown/pipeline";

const names = ["Mira", "Mi", "Harrow", "Theo"];
const repair = (raw: string, heading = "Background") => repairReply(raw, { heading, names });

describe("repairReply", () => {
  it("leaves a clean reply alone", () => {
    expect(repair("Grew up in [[Harrow]].\n\n### Early years\n\nQuiet.")).toEqual({
      markdown: "Grew up in [[Harrow]].\n\n### Early years\n\nQuiet.",
      fixes: [],
      unknownLinks: [],
    });
  });

  it("strips thinking, openers, an outer fence, the repeated heading, and closing remarks", () => {
    const raw = [
      "<think>She is from Harrow, so…</think>",
      "Here's the Background section:",
      "```markdown",
      "## Background",
      "",
      "Grew up in [[Harrow]].",
      "```",
    ].join("\n");
    const result = repair(raw);
    expect(result.markdown).toBe("Grew up in [[Harrow]].");
    expect(result.fixes).toHaveLength(4);

    expect(repair("Sure! Here you go.\n\n**Background**\n\nText.\n\nLet me know if you want changes.").markdown).toBe("Text.");
    expect(repair("Great storms shaped her.\n\nText.").markdown).toBe("Great storms shaped her.\n\nText.");
    expect(repair("reasoning…</think>\nText.").markdown).toBe("Text.");
  });

  it("drops a leading heading that names the section differently, and cuts off later sections", () => {
    const result = repair("# Early Life\n\nFarm girl.\n\n```\n## not a heading\n```\n\n## Skills\n\nKnives.");
    expect(result.markdown).toBe("Farm girl.\n\n```\n## not a heading\n```");
    expect(result.fixes).toEqual([
      'Removed the heading "Early Life" the reply started with.',
      'Dropped "Skills" and everything after it, which belonged to another section.',
    ]);
    expect(repair("### Background\n\nText.").markdown).toBe("Text.");
    expect(repair("### Childhood\n\nText.").markdown).toBe("### Childhood\n\nText.");
  });

  it("closes open blocks and turns QUESTION: lines into question callouts", () => {
    const result = repair("::::canon{tier=soft}\nLikely.\n\n:::infobox\ntitle: Mira\n\nQUESTION: Where was she born?\n- **Question:** Who raised her?");
    expect(result.markdown).toBe(
      [
        "::::canon{tier=soft}\nLikely.",
        ":::infobox\ntitle: Mira",
        "> [!question]\n> Where was she born?",
        "> [!question]\n> Who raised her?",
        ":::\n::::",
      ].join("\n\n"),
    );
    expect(parseMarkdown(result.markdown).tree.children.map((node) => node.type)).toEqual(["canonBlock"]);
    expect(result.fixes).toEqual(["Closed 2 blocks the reply left open."]);
    expect(repair("Skilled at metalwork. QUESTION: Anything else?").markdown).toBe("Skilled at metalwork.\n\n> [!question]\n> Anything else?");
    expect(repair(":::canon\nText.\n:::").fixes).toEqual([]);
  });

  it("removes tier labels copied from the wiki text", () => {
    const result = repair("Left at sixteen. [Canon]\nFights with two knives. [Likely] Born [Likely: in winter].\n\n[Canon]\nScarred.\n[/Canon]\n\n(From main canon) Quiet.");
    expect(result.markdown).toBe("Left at sixteen.\nFights with two knives. Born in winter.\n\nScarred.\n\nQuiet.");
    expect(result.fixes).toEqual(["Removed Canon and Likely labels copied from the wiki text."]);
  });

  it("flags links to pages that don't exist, with the closest names", () => {
    expect(repair("Met [[Thea]] and [[mi|Mira]], then [[thea]] again and [[Nowhere]].").unknownLinks).toEqual([
      { title: "Thea", closest: ["Theo"] },
      { title: "Nowhere", closest: [] },
    ]);
  });

  it("says why a reply can't be used", () => {
    expect(repair("").problem).toBe("The reply was empty.");
    expect(repair("<think>Hmm, where to start").problem).toBe("The reply was all thinking and never got to the section.");
    expect(repair("## Background\n\n").problem).toBe("Nothing was left once the reply was cleaned up.");
  });
});

describe("isRepeating", () => {
  it("catches a looping end and a line that keeps coming back", () => {
    expect(isRepeating("She ran. " + "and then she ran again, ".repeat(5))).toBe(true);
    expect(isRepeating(Array(4).fill("She stood at the window and watched the rain.").join("\n\nThen more.\n\n"))).toBe(true);
    expect(isRepeating("- Born: unknown\n".repeat(3) + "A long and varied paragraph with no loop in it at all.")).toBe(false);
    expect(isRepeating("Ha ha ha ha")).toBe(false);
  });
});

describe("wrapIdea", () => {
  it("tags the whole section as Idea, around any blocks inside", () => {
    expect(wrapIdea("Text.")).toBe(":::canon{tier=maybe}\nText.\n:::");
    const wrapped = wrapIdea(":::infobox\ntitle: Mira\n:::\n\nText.");
    expect(wrapped).toBe("::::canon{tier=maybe}\n:::infobox\ntitle: Mira\n:::\n\nText.\n::::");
    const [node] = parseMarkdown(wrapped).tree.children;
    expect(node).toMatchObject({ type: "canonBlock", tier: "maybe" });
  });
});
