import type { WikiDatabase } from "@/db/database";
import type { AgentRun, AssumptionMode, ModelSettings, Page, RunSection, TranscriptEntry } from "@/db/types";
import { contextText } from "@/markdown/autoContext";
import { bodySections } from "@/markdown/sections";
import { versionOf } from "@/markdown/versions";
import { titleKey } from "@/markdown/wikilinks";
import type { TemplateService } from "@/services/TemplateService";
import type { AutoContext } from "./AutoContext";
import { LlmError, type ChatMessage, type ChatResult, type LlmClient, type ToolCall } from "./LlmClient";
import { parseHeadings, PLAN_SYSTEM_PROMPT, planUserPrompt, sectionSystemPrompt, sectionUserPrompt } from "./prompts";
import { isRepeating, repairReply, wrapIdea } from "./ReplyRepair";
import { parseLooseJson, parseTextToolCalls } from "./textToolCalls";
import { promptBudget, type TokenCounter } from "./TokenCounter";
import { WIKI_TOOLS, type WikiTools } from "./tools";

export interface StartRunInput {
  wikiId: string;
  kind: "draft" | "fill-template";
  pageTitle: string;
  pageId?: string;
  mode: AssumptionMode;
  notes?: string;
  rules?: string;
  templateId?: string;
  body?: string;
  stepwise?: boolean;
}

export interface RunActivity {
  runId: string;
  // What the run is doing, as the run panel's status line shows it.
  text: string;
  section?: number;
  // The reply so far while one streams in.
  reply?: string;
}

export interface RunDependencies {
  db: WikiDatabase;
  client: LlmClient;
  counter: TokenCounter;
  autoContext: AutoContext;
  tools: WikiTools;
  templates: TemplateService;
  settings: () => Promise<ModelSettings>;
}

export const MAX_TOOL_CALLS = 8;
export const KEEP_RUNS = 20;
export const FALLBACK_TEMPLATE_ID = "bundled:character";
const PLAN_ATTEMPTS = 2;
const MAX_TRIMS = 2;
const RETRY_TEMPERATURE = 0.4;
// With tools on, auto-context leaves part of the budget for what the tools bring back.
const AUTO_CONTEXT_SHARE_WITH_TOOLS = 0.6;
// Tool results are cut by characters; three per token stays clear of the budget for most text.
const CHARS_PER_TOKEN_SAFE = 3;
const MIN_TOOL_ROOM = 150;
const LOOP_CHECK_EVERY = 200;

class Interrupted extends Error {}

// A failure every later request would hit too, such as a refused key, so the run stops.
class RunStopped extends Error {}

class ReplyLooped extends Error {
  constructor(readonly text: string) {
    super("The reply kept repeating itself.");
  }
}

interface LiveRun {
  run: AgentRun;
  controller: AbortController;
  messages: string[];
  stopping: boolean;
  // Set when only these sections are being written, as for a retry.
  only?: Set<number>;
  // Wakes a stepwise run waiting on a review.
  wake?: () => void;
}

interface Attempt {
  trim: number;
  temperature?: number;
  problem?: string;
  retry?: { note?: string; previous?: string };
}

interface Reply {
  content: string;
  problem?: string;
}

// Drives Assistant runs: plans the sections, writes each in a fresh short conversation, repairs replies, and recovers
// from failures section by section. The run is saved after every step, so the review fills in as proposals arrive.
export class RunOrchestrator {
  private readonly live = new Map<string, LiveRun>();
  private readonly listeners = new Set<(activity: RunActivity) => void>();
  private readonly finished = new Map<string, Promise<void>>();

  constructor(private readonly deps: RunDependencies) {}

  onActivity(listener: (activity: RunActivity) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  isActive(runId: string): boolean {
    return this.live.has(runId);
  }

  // Resolves when the run stops: done writing, interrupted, or failed.
  settled(runId: string): Promise<void> {
    return this.finished.get(runId) ?? Promise.resolve();
  }

  async start(input: StartRunInput): Promise<AgentRun> {
    const run: AgentRun = {
      id: crypto.randomUUID(),
      wikiId: input.wikiId,
      ...(input.pageId && { pageId: input.pageId }),
      pageTitle: input.pageTitle,
      kind: input.kind,
      mode: input.mode,
      input: {
        ...(input.notes?.trim() && { notes: input.notes.trim() }),
        ...(input.rules?.trim() && { rules: input.rules.trim() }),
        ...(input.templateId && { templateId: input.templateId }),
        ...(input.body !== undefined && { body: input.body }),
        ...(input.stepwise && { stepwise: true }),
      },
      status: "running",
      sections: [],
      transcript: [],
      startedAt: Date.now(),
    };
    await this.deps.db.runs.add(run);
    await this.prune(run.wikiId);
    this.drive(run);
    return run;
  }

  // Stops the request in flight; the run pauses as interrupted and keeps what it has written.
  interrupt(runId: string): void {
    const live = this.live.get(runId);
    if (!live) return;
    live.stopping = true;
    live.controller.abort();
    live.wake?.();
  }

  // A message from the author, joined to the run's next request.
  send(runId: string, message: string): void {
    if (message.trim()) this.live.get(runId)?.messages.push(message.trim());
  }

  // Carries on with the sections not yet written, optionally with a message for the next request.
  async resume(runId: string, message?: string): Promise<void> {
    if (this.live.has(runId)) return;
    const run = await this.deps.db.runs.get(runId);
    if (!run || (run.status !== "interrupted" && run.status !== "error")) return;
    run.status = "running";
    delete run.error;
    this.drive(run, undefined, message);
  }

  // Writes one section again, with the author's note. A run still going picks it up after its current section.
  async retrySection(runId: string, index: number, note?: string): Promise<void> {
    const live = this.live.get(runId);
    const run = live?.run ?? (await this.deps.db.runs.get(runId));
    const section = run?.sections[index];
    if (!run || !section || section.status === "writing") return;
    section.status = "pending";
    if (note?.trim()) section.note = note.trim();
    else delete section.note;
    delete section.problem;
    if (live) {
      live.only?.add(index);
      await this.save(run);
      live.wake?.();
      return;
    }
    run.status = "running";
    delete run.error;
    this.drive(run, new Set([index]));
  }

  // Changes a run through the orchestrator, so a run being written never overwrites the change.
  async update(runId: string, change: (run: AgentRun) => void): Promise<AgentRun | undefined> {
    const live = this.live.get(runId);
    const run = live?.run ?? (await this.deps.db.runs.get(runId));
    if (!run) return undefined;
    change(run);
    await this.save(run);
    live?.wake?.();
    return run;
  }

  // Runs cut off by a reload can't carry on by themselves; they're marked interrupted, keeping their proposals.
  async recover(): Promise<void> {
    const stale = await this.deps.db.runs.filter((run) => run.status === "running" && !this.live.has(run.id)).toArray();
    for (const run of stale) {
      run.status = "interrupted";
      for (const section of run.sections) if (section.status === "writing") section.status = "pending";
      await this.deps.db.runs.put(run);
    }
  }

  private drive(run: AgentRun, only?: Set<number>, message?: string): void {
    const live: LiveRun = {
      run,
      controller: new AbortController(),
      messages: message?.trim() ? [message.trim()] : [],
      stopping: false,
      ...(only && { only }),
    };
    this.live.set(run.id, live);
    this.finished.set(run.id, this.work(live));
  }

  private async work(live: LiveRun): Promise<void> {
    const { run } = live;
    try {
      await this.save(run);
      const settings = await this.deps.settings();
      if (!settings.baseUrl.trim()) throw new RunStopped("Set up a model in Settings first.");
      if (run.sections.length === 0) {
        run.sections = await this.plan(live, settings);
        await this.save(run);
      }
      for (let index = nextPending(live); index !== -1; index = nextPending(live)) {
        if (live.stopping) throw new Interrupted();
        await this.writeSection(live, index, settings);
        if (run.input.stepwise) await this.awaitReview(live, index);
      }
      // A retry of one section leaves the rest of an interrupted run where it was.
      run.status = run.sections.some((section) => section.status === "pending") ? "interrupted" : "reviewing";
      this.emit({ runId: run.id, text: run.status === "reviewing" ? "Ready for review" : "Interrupted" });
    } catch (cause) {
      for (const section of run.sections) if (section.status === "writing") section.status = "pending";
      if (cause instanceof Interrupted || live.stopping) {
        run.status = "interrupted";
        this.emit({ runId: run.id, text: "Interrupted" });
      } else {
        run.status = "error";
        run.error = cause instanceof Error ? cause.message : String(cause);
        this.emit({ runId: run.id, text: run.error });
      }
    } finally {
      this.live.delete(run.id);
      await this.save(run);
    }
  }

  // In stepwise runs, the next section waits until this one is accepted, discarded, or sent back.
  private async awaitReview(live: LiveRun, index: number): Promise<void> {
    const section = live.run.sections[index]!;
    if (section.status !== "proposed" || nextPending(live) === -1) return;
    this.emit({ runId: live.run.id, section: index, text: `Waiting for your review of ${section.heading}` });
    while (section.status === "proposed" && !live.stopping) {
      await new Promise<void>((resolve) => (live.wake = resolve));
    }
    delete live.wake;
    if (live.stopping) throw new Interrupted();
  }

  private async plan(live: LiveRun, settings: ModelSettings): Promise<RunSection[]> {
    const { run } = live;
    const page = run.pageId ? await this.deps.db.pages.get(run.pageId) : undefined;
    const toSections = (sections: { heading: string; hints: string[] }[]) =>
      sections.map(({ heading, hints }): RunSection => ({ heading, status: "pending", sources: [], ...(hints.length > 0 && { hints }) }));

    if (run.kind === "fill-template") {
      const empty = page ? bodySections(page.body).filter((section) => section.empty) : [];
      if (empty.length === 0) throw new RunStopped("This page has no empty sections to fill.");
      return toSections(empty);
    }

    const fromBody = run.input.body === undefined ? [] : bodySections(run.input.body);
    if (fromBody.length > 0) return toSections(fromBody);
    const template = run.input.templateId ? await this.deps.templates.get(run.input.templateId) : undefined;
    if (template) return toSections(bodySections(template.body));

    this.emit({ runId: run.id, text: "Planning sections" });
    const context = await this.deps.autoContext.build({
      wikiId: run.wikiId,
      input: [run.input.notes ?? "", run.pageTitle],
      ...(page && { exclude: [page.id] }),
      budget: Math.floor(promptBudget(settings, "estimate") / 2),
      count: (text) => this.deps.counter.estimate(settings, text),
    });
    const messages: ChatMessage[] = [
      { role: "system", content: PLAN_SYSTEM_PROMPT },
      {
        role: "user",
        content: planUserPrompt(run.pageTitle, run.input.notes, context.entries.map((entry) => entry.text), page && (await this.pageText(page))),
      },
    ];
    messages.forEach((message) => this.log(run, { kind: "message", role: message.role as "system" | "user", content: message.content }));
    for (let attempt = 1; attempt <= PLAN_ATTEMPTS; attempt++) {
      try {
        const result = await this.ask(live, settings, messages, {});
        this.log(run, { kind: "message", role: "assistant", content: result.content });
        const headings = parseHeadings(result.content);
        if (headings.length > 0) return headings.map((heading): RunSection => ({ heading, status: "pending", sources: [] }));
        this.log(run, { kind: "repair", text: "The plan wasn't a list of headings." });
      } catch (cause) {
        this.rethrowFatal(cause);
        this.log(run, { kind: "repair", text: `Planning failed: ${cause instanceof Error ? cause.message : String(cause)}` });
      }
    }
    const fallback = await this.deps.templates.get(FALLBACK_TEMPLATE_ID);
    this.log(run, { kind: "repair", text: `Using the ${fallback?.name ?? "Character"} template's sections instead.` });
    return toSections(fallback ? bodySections(fallback.body) : []);
  }

  private async writeSection(live: LiveRun, index: number, settings: ModelSettings): Promise<void> {
    const { run } = live;
    const section = run.sections[index]!;
    const attempt: Attempt = { trim: 1 };
    if (section.note || section.markdown) {
      attempt.retry = { ...(section.note && { note: section.note }), ...(section.markdown && { previous: section.markdown }) };
    }
    section.status = "writing";
    section.sources = [];
    delete section.problem;
    await this.save(run);
    this.emit({ runId: run.id, section: index, text: `Drafting ${section.heading}` });

    const names = (await this.deps.db.pages.where("wikiId").equals(run.wikiId).toArray()).flatMap((page) => [page.title, ...page.aliases]);
    const retried = new Set<string>();
    const retryOnce = (kind: string, text: string) => {
      if (retried.has(kind)) return false;
      retried.add(kind);
      this.log(run, { kind: "repair", section: index, text });
      return true;
    };
    let trims = 0;

    for (;;) {
      let reply: Reply;
      try {
        reply = await this.converse(live, index, settings, attempt);
      } catch (cause) {
        this.rethrowFatal(cause);
        if (cause instanceof ReplyLooped) {
          if (retryOnce("loop", "The reply kept repeating itself, so it was stopped; trying again at a lower temperature.")) {
            attempt.temperature = RETRY_TEMPERATURE;
            continue;
          }
          return this.fail(run, index, cause.message, cause.text);
        }
        if (cause instanceof LlmError && cause.kind === "context" && trims < MAX_TRIMS) {
          trims++;
          attempt.trim /= 2;
          this.log(run, { kind: "repair", section: index, text: "The prompt was too long for the model; trying again with less auto-context." });
          continue;
        }
        if (cause instanceof LlmError && cause.kind === "timeout" && retryOnce("timeout", "The model stopped sending text; trying again.")) continue;
        if (cause instanceof LlmError && cause.kind === "server" && retryOnce("server", `The server failed (${cause.message}); trying again.`)) continue;
        return this.fail(run, index, cause instanceof Error ? cause.message : String(cause));
      }

      const repaired = repairReply(reply.content, { heading: section.heading, names });
      for (const fix of repaired.fixes) this.log(run, { kind: "repair", section: index, text: fix });
      const problem = reply.problem ?? repaired.problem;
      if (problem) {
        if (retryOnce("unusable", `${problem} Asking again.`)) {
          attempt.problem = problem;
          continue;
        }
        return this.fail(run, index, problem, reply.content);
      }

      section.markdown = run.mode === "liberal" ? wrapIdea(repaired.markdown) : repaired.markdown;
      section.raw = reply.content;
      if (repaired.unknownLinks.length > 0) section.unknownLinks = repaired.unknownLinks;
      else delete section.unknownLinks;
      section.status = "proposed";
      await this.save(run);
      return;
    }
  }

  private async fail(run: AgentRun, index: number, problem: string, raw?: string): Promise<void> {
    const section = run.sections[index]!;
    section.status = "failed";
    section.problem = problem;
    if (raw !== undefined) section.raw = raw;
    delete section.markdown;
    this.log(run, { kind: "repair", section: index, text: `Gave up on this section: ${problem}` });
    await this.save(run);
  }

  // One section's conversation: the prompt, a short tool loop, then the reply that holds the section.
  private async converse(live: LiveRun, index: number, settings: ModelSettings, attempt: Attempt): Promise<Reply> {
    const { run } = live;
    const section = run.sections[index]!;
    const { messages, budget, used: promptTokens, sources } = await this.prompt(live, index, settings, attempt);
    section.sources = sources;
    messages.forEach((message) => this.log(run, { kind: "message", section: index, role: message.role as "system" | "user", content: message.content }));

    let used = promptTokens;
    let calls = 0;
    const seen = new Map<string, { result: string; entry: Extract<TranscriptEntry, { kind: "tool-call" }> }>();
    const toolNames = WIKI_TOOLS.map((tool) => tool.name);

    for (;;) {
      const toolsOn = settings.tools && calls < MAX_TOOL_CALLS && budget - used > MIN_TOOL_ROOM;
      const message = live.messages.splice(0).join("\n\n");
      if (message) {
        messages.push({ role: "user", content: `A message from the author: ${message}` });
        this.log(run, { kind: "message", section: index, role: "user", content: messages.at(-1)!.content as string });
      }

      const result = await this.ask(live, settings, messages, { tools: toolsOn, temperature: attempt.temperature, section: index });
      this.log(run, { kind: "message", section: index, role: "assistant", content: result.content });
      const promptChars = messages.reduce((sum, entry) => sum + entry.content.length, 0);
      if (result.usage) this.deps.counter.calibrate(settings, promptChars, result.usage.promptTokens);
      used = result.usage ? result.usage.promptTokens + result.usage.completionTokens : used + this.deps.counter.estimate(settings, result.content);

      let toolCalls = result.toolCalls;
      const written = toolCalls.length === 0 && settings.tools ? parseTextToolCalls(result.content, toolNames) : [];
      if (!toolsOn) {
        if (toolCalls.length > 0 || written.length > 0) return { content: result.content, problem: "The reply was a lookup, not the section." };
        return { content: result.content };
      }
      if (written.length > 0) {
        this.log(run, { kind: "repair", section: index, text: "Read a tool call the model wrote as text." });
        toolCalls = written;
      }
      if (toolCalls.length === 0) return { content: result.content };

      const native = written.length === 0;
      messages.push(native ? { role: "assistant", content: result.content, toolCalls } : { role: "assistant", content: result.content });
      const textResults: string[] = [];
      for (const call of toolCalls) {
        const content = await this.callTool(live, index, call, calls >= MAX_TOOL_CALLS, Math.max(0, budget - used) * CHARS_PER_TOKEN_SAFE, seen, sources);
        calls++;
        if (native) messages.push({ role: "tool", toolCallId: call.id, content });
        else textResults.push(`Result of ${call.name}:\n${content}`);
        used += this.deps.counter.estimate(settings, content);
      }
      section.sources = sources;
      if (!native) messages.push({ role: "user", content: textResults.join("\n\n") });
      if (calls >= MAX_TOOL_CALLS || budget - used <= MIN_TOOL_ROOM) {
        messages.push({ role: "user", content: `That's all the lookups for this section. Write the ${section.heading} section now.` });
        this.log(run, { kind: "repair", section: index, text: "Reached the lookup limit; asking for the section without tools." });
      }
      await this.save(run);
    }
  }

  private async callTool(
    live: LiveRun,
    index: number,
    call: ToolCall,
    overLimit: boolean,
    maxChars: number,
    seen: Map<string, { result: string; entry: Extract<TranscriptEntry, { kind: "tool-call" }> }>,
    sources: string[],
  ): Promise<string> {
    const { run } = live;
    const args = parseLooseJson(call.arguments)?.value ?? call.arguments;
    if (overLimit) return "Lookup limit reached. Write the section now.";

    const key = callKey(call.name, args);
    const earlier = seen.get(key);
    if (earlier) {
      earlier.entry.repeat = (earlier.entry.repeat ?? 1) + 1;
      this.emit({ runId: run.id, section: index, text: `${activityLabel(call.name, args)} ×${earlier.entry.repeat}` });
      return `${earlier.result}\n\n(You already looked this up. If you have what you need, write the section now.)`;
    }

    this.emit({ runId: run.id, section: index, text: activityLabel(call.name, args) });
    const continuity = await this.continuityOf(run);
    const outcome = await this.deps.tools.run(run.wikiId, call, { ...(continuity && { continuity }), maxChars });
    if (outcome.repaired) this.log(run, { kind: "repair", section: index, text: `Fixed the arguments of a ${call.name} call.` });
    for (const title of outcome.pages) if (!sources.includes(title)) sources.push(title);
    const entry = this.log(run, {
      kind: "tool-call",
      section: index,
      name: call.name,
      args,
      result: outcome.content,
      ...(outcome.error && { error: true }),
    }) as Extract<TranscriptEntry, { kind: "tool-call" }>;
    seen.set(key, { result: outcome.content, entry });
    return outcome.content;
  }

  private async prompt(live: LiveRun, index: number, settings: ModelSettings, attempt: Attempt) {
    const { run } = live;
    const { db, counter, autoContext } = this.deps;
    const section = run.sections[index]!;
    const wiki = await db.wikis.get(run.wikiId);
    const page = run.pageId ? await db.pages.get(run.pageId) : undefined;
    const pageText = page ? await this.pageText(page) : undefined;
    const continuity = await this.continuityOf(run);

    const system = sectionSystemPrompt({ mode: run.mode, tools: settings.tools, wikiRules: wiki?.assistantRules, runRules: run.input.rules });
    const userInput = {
      heading: section.heading,
      pageTitle: run.pageTitle,
      notes: run.input.notes,
      ...(run.kind === "fill-template" && { instructions: true }),
      ...(pageText !== undefined && { pageText }),
      written: run.sections.filter((other, at) => at !== index && (other.status === "proposed" || other.status === "accepted")).map((other) => other.heading),
      hints: section.hints ?? [],
      ...(attempt.retry && { retry: attempt.retry }),
      ...(attempt.problem && { problem: attempt.problem }),
    };
    const fixed = await counter.count(settings, [system, sectionUserPrompt({ ...userInput, autoContext: [] }), settings.tools ? JSON.stringify(WIKI_TOOLS) : ""].join("\n"), live.controller.signal);
    const budget = promptBudget(settings, fixed.method);
    const share = settings.tools ? AUTO_CONTEXT_SHARE_WITH_TOOLS : 1;
    const context = await autoContext.build({
      wikiId: run.wikiId,
      input: [run.input.notes ?? "", run.input.rules ?? "", wiki?.assistantRules ?? "", pageText ?? "", run.pageTitle, section.heading],
      budget: Math.max(0, Math.floor((budget - fixed.tokens) * share * attempt.trim)),
      count: async (text) => (await counter.count(settings, text, live.controller.signal)).tokens,
      ...(page && { exclude: [page.id] }),
      ...(continuity && { continuity }),
    });
    if (context.leftOut.length > 0) {
      this.log(run, { kind: "repair", section: index, text: `Left out of auto-context for room: ${context.leftOut.map((entry) => entry.title).join(", ")}.` });
    }
    const messages: ChatMessage[] = [
      { role: "system", content: system },
      { role: "user", content: sectionUserPrompt({ ...userInput, autoContext: context.entries.map((entry) => entry.text) }) },
    ];
    return { messages, budget, used: fixed.tokens + context.tokens, sources: context.entries.map((entry) => entry.title) };
  }

  private async pageText(page: Page): Promise<string> {
    const continuities = (await this.deps.db.wikis.get(page.wikiId))?.continuities ?? [];
    const main = versionOf(page.title, continuities);
    const mainPage = main && (await this.deps.db.pages.where("[wikiId+titleKey]").equals([page.wikiId, titleKey(main.main)]).first());
    return contextText(page.body, "full", mainPage?.body);
  }

  private async continuityOf(run: AgentRun): Promise<string | undefined> {
    const continuities = (await this.deps.db.wikis.get(run.wikiId))?.continuities ?? [];
    return versionOf(run.pageTitle, continuities)?.continuity.name;
  }

  // One request, streamed. A reply that falls into a loop is stopped early.
  private async ask(
    live: LiveRun,
    settings: ModelSettings,
    messages: ChatMessage[],
    { tools = false, temperature, section }: { tools?: boolean; temperature?: number; section?: number },
  ): Promise<ChatResult> {
    const controller = new AbortController();
    const forward = () => controller.abort();
    live.controller.signal.addEventListener("abort", forward);
    let looped: string | undefined;
    let checkedAt = 0;
    try {
      const result = await this.deps.client.chat(settings, {
        messages,
        ...(tools && { tools: WIKI_TOOLS }),
        ...(temperature !== undefined && { temperature }),
        signal: controller.signal,
        onText: (text) => {
          this.emit({ runId: live.run.id, ...(section !== undefined && { section }), text: "Writing", reply: text });
          if (text.length - checkedAt < LOOP_CHECK_EVERY) return;
          checkedAt = text.length;
          if (isRepeating(text)) {
            looped = text;
            controller.abort();
          }
        },
      });
      // The reply can finish before an abort lands, or arrive in pieces too big to check along the way.
      if (looped !== undefined || isRepeating(result.content)) throw new ReplyLooped(looped ?? result.content);
      return result;
    } catch (cause) {
      if (cause instanceof ReplyLooped) throw cause;
      if (live.stopping) throw new Interrupted();
      if (looped !== undefined) throw new ReplyLooped(looped);
      throw cause;
    } finally {
      live.controller.signal.removeEventListener("abort", forward);
    }
  }

  private rethrowFatal(cause: unknown): void {
    if (cause instanceof Interrupted || cause instanceof RunStopped) throw cause;
    if (cause instanceof LlmError && (cause.kind === "aborted" || cause.kind === "network" || cause.kind === "auth" || cause.kind === "not-found" || cause.kind === "bad-request")) {
      throw cause.kind === "aborted" ? new Interrupted() : new RunStopped(cause.message);
    }
  }

  private log(run: AgentRun, entry: DistributiveOmit<TranscriptEntry, "at">): TranscriptEntry {
    const full = { ...entry, at: Date.now() } as TranscriptEntry;
    run.transcript.push(full);
    return full;
  }

  private emit(activity: RunActivity): void {
    for (const listener of this.listeners) listener(activity);
  }

  private async save(run: AgentRun): Promise<void> {
    await this.deps.db.runs.put(run);
  }

  // Keeps the newest runs of a wiki, never one still going.
  private async prune(wikiId: string): Promise<void> {
    const runs = await this.deps.db.runs.where("wikiId").equals(wikiId).sortBy("startedAt");
    const old = runs.slice(0, Math.max(0, runs.length - KEEP_RUNS)).filter((run) => !this.live.has(run.id));
    await this.deps.db.runs.bulkDelete(old.map((run) => run.id));
  }
}

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

function nextPending(live: LiveRun): number {
  return live.run.sections.findIndex((section, index) => section.status === "pending" && (!live.only || live.only.has(index)));
}

function callKey(name: string, args: unknown): string {
  const normalize = (value: unknown): unknown => {
    if (typeof value === "string") return titleKey(value);
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, inner]) => [key, normalize(inner)]));
    }
    return value;
  };
  return `${name}:${JSON.stringify(normalize(args))}`;
}

// The run panel's line for a lookup: "Reading Mira", "Searching for the Hollow Crown".
export function activityLabel(name: string, args: unknown): string {
  const record = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title : typeof record["0"] === "string" ? (record["0"] as string) : "";
  switch (name) {
    case "search_pages":
      return `Searching for ${typeof record.query === "string" ? record.query : (record["0"] ?? "")}`;
    case "read_section":
      return `Reading ${title}${typeof record.heading === "string" ? ` › ${record.heading}` : ""}`;
    case "list_backlinks":
      return `Finding links to ${title}`;
    case "get_relationships":
      return `Reading ${title}'s relationships`;
    case "get_canon":
      return `Checking canon on ${title}`;
    default:
      return `Reading ${title}`;
  }
}
