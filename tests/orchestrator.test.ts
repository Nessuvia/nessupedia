import { beforeEach, describe, expect, it } from "vitest";
import { WikiDatabase } from "@/db/database";
import type { AgentRun, ModelSettings } from "@/db/types";
import { AutoContext } from "@/llm/AutoContext";
import { LlmClient } from "@/llm/LlmClient";
import { parseHeadings } from "@/llm/prompts";
import { defaultModelSettings } from "@/llm/providers";
import { KEEP_RUNS, MAX_TOOL_CALLS, RunOrchestrator, type StartRunInput } from "@/llm/RunOrchestrator";
import { TokenCounter } from "@/llm/TokenCounter";
import { WikiTools } from "@/llm/tools";
import { ChangeLog } from "@/services/ChangeLog";
import { LinkIndexer } from "@/services/LinkIndexer";
import { PageService } from "@/services/PageService";
import { RelationshipService } from "@/services/RelationshipService";
import { retagSection, ReviewService, sectionTag } from "@/services/ReviewService";
import { applySections, bodySections } from "@/markdown/sections";
import { SearchService } from "@/services/SearchService";
import { TemplateService } from "@/services/TemplateService";
import { TokenizerService } from "@/services/TokenizerService";
import { WikiService } from "@/services/WikiService";
import { fakeFetch, finish, json, sse, textDelta, toolDelta, type FakeRequest } from "./fakeLlm";

const ORIGIN = "http://kobold.test:5001";

type Scripted = (request: FakeRequest) => Response | Promise<Response>;

const say = (text: string): Scripted => () => sse([textDelta(text), finish("stop")]);
const call =
  (name: string, args: unknown, id = `call_${name}`): Scripted =>
  () =>
    sse([toolDelta(0, { id, name, arguments: typeof args === "string" ? args : JSON.stringify(args) }), finish("tool_calls")]);

let db: WikiDatabase;
let pages: PageService;
let wikis: WikiService;
let templates: TemplateService;
let orchestrator: RunOrchestrator;
let review: ReviewService;
let wikiId: string;
let settings: ModelSettings;
let script: Scripted[];
let chats: FakeRequest[];

beforeEach(async () => {
  db = new WikiDatabase(`test-${crypto.randomUUID()}`);
  const links = new LinkIndexer(db);
  pages = new PageService(db, links, new ChangeLog(db));
  wikis = new WikiService(db);
  templates = new TemplateService(db);
  wikiId = (await wikis.create("Ashfall")).id;
  settings = { ...defaultModelSettings("koboldcpp"), baseUrl: `${ORIGIN}/v1`, model: "gemma", contextLength: 8192, replyTokens: 512, tools: true };
  script = [];
  chats = [];
  const server = fakeFetch(ORIGIN, {
    "POST /v1/chat/completions": (request) => {
      chats.push(request);
      const next = script.shift();
      if (!next) throw new Error("The script ran out of replies");
      return next(request);
    },
  });
  const client = new LlmClient(server.fetch, { firstToken: 2000, idle: 2000 });
  orchestrator = new RunOrchestrator({
    db,
    client,
    counter: new TokenCounter(client, new TokenizerService(db)),
    autoContext: new AutoContext(db),
    tools: new WikiTools(db, links, new SearchService(db), new RelationshipService(db, links)),
    templates,
    settings: async () => settings,
  });
  review = new ReviewService(db, pages, orchestrator);
});

async function template(body: string) {
  return templates.create(wikiId, "Sketch", body);
}

async function run(input: Partial<StartRunInput> = {}): Promise<AgentRun> {
  const started = await orchestrator.start({ wikiId, kind: "draft", pageTitle: "Mira", mode: "strict", ...input });
  await orchestrator.settled(started.id);
  return (await db.runs.get(started.id))!;
}

const messagesOf = (request: FakeRequest) => request.body!.messages as { role: string; content: string; tool_calls?: unknown[] }[];
const repairs = (finished: AgentRun) => finished.transcript.flatMap((entry) => (entry.kind === "repair" ? [entry.text] : []));

describe("planning", () => {
  it("parses headings one per line, and rejects replies that aren't lists", () => {
    expect(parseHeadings("Here are the headings:\n1. Early life\n- **Career**\n## Legacy:\n\nCareer")).toEqual(["Early life", "Career", "Legacy"]);
    expect(parseHeadings("She was born in Harrow. Then she left.")).toEqual([]);
  });

  it("takes the template's sections with their hints, without asking the model", async () => {
    const sketch = await template("Lead.\n\n## Background\n\n<!-- Where they grew up. -->\n\n## Skills\n");
    script.push(say("Grew up in Harrow."), say("Knives."));
    const finished = await run({ templateId: sketch.id });
    expect(finished.status).toBe("reviewing");
    expect(finished.sections).toMatchObject([
      { heading: "Background", status: "proposed", markdown: "Grew up in Harrow.", hints: ["Where they grew up."] },
      { heading: "Skills", status: "proposed", markdown: "Knives." },
    ]);
    expect(chats).toHaveLength(2);
    expect(messagesOf(chats[0]!)[1]!.content).toContain("What this section should cover:\n- Where they grew up.\n\nWrite the Background section.");
    expect(messagesOf(chats[1]!)[1]!.content).toContain("Sections already written: Background.");
  });

  it("asks the model for headings, falling back to the Character template's after two failures", async () => {
    script.push(say("Early life\nCareer"), say("A."), say("B."));
    expect((await run({ notes: "A sellsword." })).sections.map((section) => section.heading)).toEqual(["Early life", "Career"]);

    script.push(say("I'd rather write prose."), say("Still prose."), ...Array.from({ length: 6 }, () => say("Text.")));
    const fallback = await run();
    expect(fallback.sections.map((section) => section.heading)).toEqual(["Appearance", "Personality", "History", "Abilities", "Trivia", "Interview"]);
    expect(repairs(fallback)).toContain("Using the Character template's sections instead.");
  });

  it("fills only a page's empty sections", async () => {
    const page = await pages.create({ wikiId, title: "Mira", body: "## Background\n\nFarm girl.\n\n## Skills\n\n<!-- What can she do? -->\n" });
    script.push(say("Knives."));
    const finished = await run({ kind: "fill-template", pageId: page.id });
    expect(finished.sections).toMatchObject([{ heading: "Skills", hints: ["What can she do?"], markdown: "Knives." }]);
    expect(messagesOf(chats[0]!)[1]!.content).toContain("## The page so far\n\n## Background\n\nFarm girl.");
  });
});

describe("section prompts", () => {
  it("carries the mode, both sets of rules, auto-context, and notes, and records sources", async () => {
    await wikis.setAssistantRules(wikiId, "Spell it grey.");
    await pages.create({ wikiId, title: "Harrow", body: "A mining town." });
    const sketch = await template("## Background\n");
    script.push(say("Grew up in [[Harrow]]."));
    const finished = await run({ templateId: sketch.id, notes: "Born in Harrow.", rules: "Keep it short." });

    const [system, user] = messagesOf(chats[0]!);
    expect(system!.content).toContain("write a line starting with QUESTION:");
    expect(system!.content).toContain("The author's rules for this wiki:\nSpell it grey.");
    expect(system!.content).toContain("The author's rules for this request:\nKeep it short.");
    expect(user!.content).toMatch(/^## Wiki pages\n\n# Harrow\n\nA mining town\.\n\n## The author's notes\n\nBorn in Harrow\./);
    expect(finished.sections[0]!.sources).toEqual(["Harrow"]);
  });

  it("wraps Liberal sections as Idea and turns Strict questions into callouts", async () => {
    const sketch = await template("## Background\n");
    script.push(say("Born a queen."));
    expect((await run({ templateId: sketch.id, mode: "liberal" })).sections[0]!.markdown).toBe(":::canon{tier=maybe}\nBorn a queen.\n:::");
    script.push(say("Born somewhere.\n\nQUESTION: Where?"));
    expect((await run({ templateId: sketch.id })).sections[0]!.markdown).toBe("Born somewhere.\n\n> [!question]\n> Where?");
  });
});

describe("tool loop", () => {
  beforeEach(async () => {
    await pages.create({ wikiId, title: "Theo", body: "A knight sworn to [[Mira]]." });
  });

  it("answers tool calls, counts repeats, and reads calls written as text", async () => {
    const sketch = await template("## Background\n");
    script.push(
      call("read_page", { title: "Theo" }),
      call("read_page", { title: "theo" }),
      say('<tool_call>{"name": "list_backlinks", "arguments": {"title": "Theo"}}</tool_call>'),
      say("Theo serves her."),
    );
    const finished = await run({ templateId: sketch.id });

    expect(finished.sections[0]).toMatchObject({ status: "proposed", markdown: "Theo serves her.", sources: ["Theo"] });
    const toolCalls = finished.transcript.filter((entry) => entry.kind === "tool-call");
    expect(toolCalls).toMatchObject([
      { name: "read_page", args: { title: "Theo" }, result: "# Theo\n\nA knight sworn to [[Mira]].", repeat: 2 },
      { name: "list_backlinks", result: "No pages link to Theo." },
    ]);
    expect(repairs(finished)).toContain("Read a tool call the model wrote as text.");

    const second = messagesOf(chats[1]!);
    expect(second.at(-2)).toMatchObject({ role: "assistant", tool_calls: [{ id: "call_read_page" }] });
    expect(second.at(-1)).toEqual({ role: "tool", tool_call_id: "call_read_page", content: "# Theo\n\nA knight sworn to [[Mira]]." });
    expect(messagesOf(chats[2]!).at(-1)!.content).toMatch(/You already looked this up/);
    expect(messagesOf(chats[3]!).at(-1)).toEqual({ role: "user", content: "Result of list_backlinks:\nNo pages link to Theo." });
  });

  it("turns tools off after the call limit and asks for the section", async () => {
    const sketch = await template("## Background\n");
    for (let index = 0; index < MAX_TOOL_CALLS; index++) script.push(call("search_pages", { query: `q${index}` }));
    script.push(say("Done."));
    const finished = await run({ templateId: sketch.id });

    expect(finished.sections[0]!.markdown).toBe("Done.");
    expect(chats.slice(0, MAX_TOOL_CALLS).every((request) => Array.isArray(request.body!.tools))).toBe(true);
    expect(chats[MAX_TOOL_CALLS]!.body!.tools).toBeUndefined();
    expect(messagesOf(chats[MAX_TOOL_CALLS]!).at(-1)!.content).toBe("That's all the lookups for this section. Write the Background section now.");
  });

  it("sends no tools to a model without tool support", async () => {
    settings.tools = false;
    const sketch = await template("## Background\n");
    script.push(say("Plain."));
    await run({ templateId: sketch.id });
    expect(chats[0]!.body!.tools).toBeUndefined();
    expect(messagesOf(chats[0]!)[0]!.content).not.toContain("tools");
  });
});

describe("recovery", () => {
  it("retries an unusable reply once with a note, then fails the section and carries on", async () => {
    const sketch = await template("## Background\n\n## Skills\n");
    script.push(say(""), say("<think>hmm"), say("Knives."));
    const finished = await run({ templateId: sketch.id });

    expect(finished.status).toBe("reviewing");
    expect(finished.sections[0]).toMatchObject({ status: "failed", problem: "The reply was all thinking and never got to the section.", raw: "<think>hmm" });
    expect(finished.sections[1]).toMatchObject({ status: "proposed", markdown: "Knives." });
    expect(messagesOf(chats[1]!)[1]!.content).toContain("Your last reply couldn't be used: The reply was empty.");
  });

  it("trims auto-context after a context overflow, and retries a stalled reply", async () => {
    await pages.create({ wikiId, title: "Harrow", body: "A mining town." });
    const sketch = await template("## Background\n");
    script.push(
      () => json({ error: { message: "Context length exceeded" } }, 400),
      ({ signal }) => sse([], { hang: true, ...(signal && { signal }) }),
      say("Grew up in Harrow."),
    );
    const finished = await run({ templateId: sketch.id, notes: "Harrow" });

    expect(finished.sections[0]!.markdown).toBe("Grew up in Harrow.");
    expect(repairs(finished)).toEqual([
      "The prompt was too long for the model; trying again with less auto-context.",
      "The model stopped sending text; trying again.",
    ]);
  }, 10_000);

  it("stops a looping reply and retries at a lower temperature", async () => {
    const sketch = await template("## Background\n");
    script.push(say("She ran. " + "and then she ran again, ".repeat(40)), say("She ran."));
    const finished = await run({ templateId: sketch.id });

    expect(finished.sections[0]!.markdown).toBe("She ran.");
    expect(chats[1]!.body!.temperature).toBe(0.4);
  });

  it("stops the run when the server refuses the key", async () => {
    const sketch = await template("## Background\n\n## Skills\n");
    script.push(() => json({ error: { message: "Bad key" } }, 401));
    const finished = await run({ templateId: sketch.id });
    expect(finished).toMatchObject({ status: "error", error: "401: Bad key" });
    expect(finished.sections.map((section) => section.status)).toEqual(["pending", "pending"]);
  });

  it("says so when no model is set up", async () => {
    settings.baseUrl = "";
    expect(await run()).toMatchObject({ status: "error", error: "Set up a model in Settings first." });
  });
});

describe("control", () => {
  it("interrupts mid-request, then resumes with the author's message", async () => {
    const sketch = await template("## Background\n\n## Skills\n");
    let arrived!: () => void;
    const waiting = new Promise<void>((resolve) => (arrived = resolve));
    script.push(say("Farm girl."), ({ signal }) => {
      arrived();
      return sse([textDelta("Kni")], { hang: true, ...(signal && { signal }) });
    });
    const started = await orchestrator.start({ wikiId, kind: "draft", pageTitle: "Mira", mode: "strict", templateId: sketch.id });
    await waiting;
    orchestrator.interrupt(started.id);
    await orchestrator.settled(started.id);

    const paused = (await db.runs.get(started.id))!;
    expect(paused.status).toBe("interrupted");
    expect(paused.sections.map((section) => section.status)).toEqual(["proposed", "pending"]);

    script.push(say("Knives."));
    await orchestrator.resume(started.id, "Make her a knife fighter.");
    await orchestrator.settled(started.id);
    const resumed = (await db.runs.get(started.id))!;
    expect(resumed.status).toBe("reviewing");
    expect(resumed.sections[1]!.markdown).toBe("Knives.");
    expect(messagesOf(chats.at(-1)!).at(-1)).toEqual({ role: "user", content: "A message from the author: Make her a knife fighter." });
  });

  it("retries one section with the author's note and its last try", async () => {
    const sketch = await template("## Background\n");
    script.push(say("Farm girl."));
    const finished = await run({ templateId: sketch.id });

    script.push(say("Miner's daughter."));
    await orchestrator.retrySection(finished.id, 0, "She grew up in the mines.");
    await orchestrator.settled(finished.id);
    expect((await db.runs.get(finished.id))!.sections[0]!.markdown).toBe("Miner's daughter.");
    expect(messagesOf(chats.at(-1)!)[1]!.content).toContain("Your last try at this section:\n\nFarm girl.\n\nThe author's note on it: She grew up in the mines.");
  });

  it("marks runs cut off by a reload as interrupted, and keeps only the newest runs", async () => {
    const base = { wikiId, pageTitle: "Mira", kind: "draft" as const, mode: "strict" as const, input: {}, transcript: [] };
    await db.runs.add({ ...base, id: "cut", status: "running", sections: [{ heading: "A", status: "writing", sources: [] }], startedAt: 1 });
    await orchestrator.recover();
    expect(await db.runs.get("cut")).toMatchObject({ status: "interrupted", sections: [{ status: "pending" }] });

    for (let index = 0; index < KEEP_RUNS; index++) await db.runs.add({ ...base, id: `old${index}`, status: "done", sections: [], startedAt: 2 + index });
    settings.baseUrl = "";
    const newest = await run();
    const kept = await db.runs.where("wikiId").equals(wikiId).toArray();
    expect(kept).toHaveLength(KEEP_RUNS);
    expect(kept.map((entry) => entry.id)).toContain(newest.id);
    expect(kept.map((entry) => entry.id)).not.toContain("cut");
  });

  it("waits for each proposal's review in stepwise runs", async () => {
    const sketch = await template("## Background\n\n## Skills\n");
    script.push(say("Farm girl."), say("Knives."));
    const started = await orchestrator.start({ wikiId, kind: "draft", pageTitle: "Mira", mode: "strict", templateId: sketch.id, stepwise: true });
    await until(async () => (await db.runs.get(started.id))!.sections[0]?.status === "proposed");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(chats).toHaveLength(1);

    await review.discard(started.id, 0);
    await orchestrator.settled(started.id);
    expect((await db.runs.get(started.id))!.sections.map((section) => section.status)).toEqual(["discarded", "proposed"]);
  });

  it("picks up a retry asked for while the run is still going", async () => {
    const sketch = await template("## Background\n\n## Skills\n");
    script.push(say("Farm girl."), say("Miner's daughter."), say("Knives."));
    const started = await orchestrator.start({ wikiId, kind: "draft", pageTitle: "Mira", mode: "strict", templateId: sketch.id, stepwise: true });
    await until(async () => (await db.runs.get(started.id))!.sections[0]?.status === "proposed");
    await orchestrator.retrySection(started.id, 0, "Mines.");
    await until(async () => (await db.runs.get(started.id))!.sections[0]?.markdown === "Miner's daughter.");
    await review.accept(started.id, [0]);
    await orchestrator.settled(started.id);
    expect((await db.runs.get(started.id))!.sections.map((section) => section.markdown)).toEqual(["Miner's daughter.", "Knives."]);
  });
});

async function until(check: () => Promise<boolean>): Promise<void> {
  for (let tries = 0; tries < 200; tries++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting");
}

describe("applying sections", () => {
  const body = "---\ntitle: Mira\n---\n\nLead.\n\n## Background\n\n<!-- Where? -->\n\n## Skills\n\nOld skills.\n";
  const plan = ["Appearance", "Background", "Personality", "Skills", "Trivia"];

  it("replaces a section's content by heading, hints included", () => {
    expect(applySections(body, [{ heading: "background", markdown: "Farm girl." }], plan)).toBe(
      "---\ntitle: Mira\n---\n\nLead.\n\n## Background\n\nFarm girl.\n\n## Skills\n\nOld skills.\n",
    );
    expect(applySections(body, [{ heading: "Skills", markdown: "Knives.\n" }], plan)).toBe(
      "---\ntitle: Mira\n---\n\nLead.\n\n## Background\n\n<!-- Where? -->\n\n## Skills\n\nKnives.\n",
    );
  });

  it("counts a section holding only hints and a pressure profile as empty, and keeps the profile when writing it", () => {
    const character = "## Personality\n\n<!-- How do they act? -->\n\n:::pressure\nTriggers:\n:::\n\n## Skills\n\nKnives.\n";
    expect(bodySections(character)).toEqual([
      { heading: "Personality", hints: ["How do they act?"], empty: true },
      { heading: "Skills", hints: [], empty: false },
    ]);
    expect(applySections(character, [{ heading: "Personality", markdown: "Blunt." }], [])).toBe(
      "## Personality\n\nBlunt.\n\n:::pressure\nTriggers:\n:::\n\n## Skills\n\nKnives.\n",
    );
  });

  it("adds new sections in plan order", () => {
    const result = applySections(
      body,
      [
        { heading: "Personality", markdown: "Blunt." },
        { heading: "Appearance", markdown: "Tall." },
        { heading: "Trivia", markdown: "Hums." },
      ],
      plan,
    );
    expect(result).toBe(
      "---\ntitle: Mira\n---\n\nLead.\n\n## Appearance\n\nTall.\n\n## Background\n\n<!-- Where? -->\n\n## Personality\n\nBlunt.\n\n## Skills\n\nOld skills.\n\n## Trivia\n\nHums.\n",
    );
    expect(applySections("", [{ heading: "Background", markdown: "Farm girl." }], plan)).toBe("## Background\n\nFarm girl.\n");
  });
});

describe("review", () => {
  it("creates a new page on the first accept, then saves later batches as Assistant edits", async () => {
    const body = "---\ncategories: [Characters]\n---\n\nLead.\n\n## Background\n\n<!-- Where? -->\n\n## Skills\n";
    script.push(say("Farm girl."), say("Knives."));
    const finished = await run({ body });
    expect(finished.sections.map((section) => section.heading)).toEqual(["Background", "Skills"]);
    expect(await pages.getByTitle(wikiId, "Mira")).toBeUndefined();

    const page = (await review.accept(finished.id, [0]))!;
    expect(page.body).toBe("---\ncategories: [Characters]\n---\n\nLead.\n\n## Background\n\nFarm girl.\n\n## Skills\n");
    expect(await db.runs.get(finished.id)).toMatchObject({ pageId: page.id, status: "reviewing" });

    await review.edit(finished.id, 1, "Two knives.");
    await review.acceptAll(finished.id);
    expect((await pages.get(page.id))!.body).toContain("## Skills\n\nTwo knives.\n");
    expect((await db.runs.get(finished.id))!.status).toBe("done");

    const history = await db.changes.where("pageId").equals(page.id).toArray();
    expect(history.map(({ kind, author, summary }) => [kind, author, summary])).toEqual([
      ["create", "llm", "Created page"],
      ["edit", "llm", "Drafted Skills"],
    ]);
  });

  it("retags Liberal sections and finishes once everything is decided", async () => {
    const wrapped = ":::canon{tier=maybe}\nA queen.\n:::";
    expect(sectionTag(wrapped)).toBe("maybe");
    expect(retagSection(wrapped, "soft")).toBe(":::canon{tier=soft}\nA queen.\n:::");
    expect(retagSection(wrapped, "none")).toBe("A queen.");
    expect(retagSection("A queen.", "hard")).toBe(":::canon{tier=hard}\nA queen.\n:::");
    expect(sectionTag("A queen.")).toBe("none");

    const sketch = await template("## Background\n\n## Skills\n");
    script.push(say("A queen."), say("Knives."));
    const finished = await run({ templateId: sketch.id, mode: "liberal" });
    await review.retag(finished.id, 0, "none");
    await review.accept(finished.id, [0]);
    await review.discard(finished.id, 1);
    const done = (await db.runs.get(finished.id))!;
    expect(done.status).toBe("done");
    expect((await pages.get(done.pageId!))!.body).toBe("## Background\n\nA queen.\n");
  });
});
