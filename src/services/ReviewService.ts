import type { WikiDatabase } from "@/db/database";
import type { AgentRun, CanonTier, Page } from "@/db/types";
import { wrapIdea } from "@/llm/ReplyRepair";
import type { RunOrchestrator } from "@/llm/RunOrchestrator";
import { setCanonTier } from "@/markdown/canon";
import { applySections } from "@/markdown/sections";
import type { PageService } from "./PageService";

export type SectionTag = CanonTier | "none";

const IDEA_WRAPPER = /^(:{3,})canon\{[^}\n]*\}\n([\s\S]*)\n\1$/;

// The tier a whole-section canon wrapper gives, or "none" when the proposal isn't wrapped.
export function sectionTag(markdown: string): SectionTag {
  const wrapper = IDEA_WRAPPER.exec(markdown);
  if (!wrapper) return "none";
  const tier = /tier\s*=\s*(\w+)/.exec(markdown.slice(0, markdown.indexOf("\n")))?.[1];
  return tier === "soft" || tier === "likely" ? "soft" : tier === "hard" || tier === "canon" ? "hard" : "maybe";
}

// Rewrites a Liberal proposal's wrapper to another tier, or takes it off.
export function retagSection(markdown: string, tag: SectionTag): string {
  const wrapper = IDEA_WRAPPER.exec(markdown);
  if (tag === "none") return wrapper ? wrapper[2]! : markdown;
  return setCanonTier(wrapper ? markdown : wrapIdea(markdown), tag);
}

// Turns reviewed proposals into page edits. Each accepted batch is one change by the Assistant; a draft of a new page
// creates it on its first accept.
export class ReviewService {
  constructor(
    private readonly db: WikiDatabase,
    private readonly pages: PageService,
    private readonly runs: RunOrchestrator,
  ) {}

  get(runId: string): Promise<AgentRun | undefined> {
    return this.db.runs.get(runId);
  }

  // A wiki's runs, newest first.
  async list(wikiId: string): Promise<AgentRun[]> {
    return (await this.db.runs.where("wikiId").equals(wikiId).sortBy("startedAt")).reverse();
  }

  async accept(runId: string, indexes: readonly number[]): Promise<Page | undefined> {
    const run = await this.db.runs.get(runId);
    if (!run) return undefined;
    const chosen = [...new Set(indexes)].filter((index) => run.sections[index]?.status === "proposed" && run.sections[index]!.markdown !== undefined);
    if (chosen.length === 0) return undefined;

    const plan = run.sections.map((section) => section.heading);
    const sections = chosen.map((index) => ({ heading: run.sections[index]!.heading, markdown: run.sections[index]!.markdown! }));
    const summary = `${run.kind === "fill-template" ? "Filled" : "Drafted"} ${sections.map((section) => section.heading).join(", ")}`;
    const existing = (run.pageId ? await this.pages.get(run.pageId) : undefined) ?? (await this.pages.getByTitle(run.wikiId, run.pageTitle));
    const page = existing
      ? await this.pages.save(existing.id, applySections(existing.body, sections, plan), { author: "llm", summary })
      : await this.pages.create({
          wikiId: run.wikiId,
          title: run.pageTitle,
          body: applySections(run.input.body ?? "", sections, plan),
          ...(run.input.templateId && { templateId: run.input.templateId }),
          author: "llm",
        });

    await this.runs.update(runId, (current) => {
      current.pageId = page.id;
      for (const index of chosen) current.sections[index]!.status = "accepted";
      finishIfReviewed(current);
    });
    return page;
  }

  async acceptAll(runId: string): Promise<Page | undefined> {
    const run = await this.db.runs.get(runId);
    if (!run) return undefined;
    return this.accept(
      runId,
      run.sections.flatMap((section, index) => (section.status === "proposed" ? [index] : [])),
    );
  }

  async discard(runId: string, index: number): Promise<void> {
    await this.runs.update(runId, (run) => {
      const section = run.sections[index];
      if (!section || section.status === "writing" || section.status === "accepted") return;
      section.status = "discarded";
      finishIfReviewed(run);
    });
  }

  // Replaces a proposal with the author's edit of it.
  async edit(runId: string, index: number, markdown: string): Promise<void> {
    await this.runs.update(runId, (run) => {
      const section = run.sections[index];
      if (section?.status !== "proposed" || !markdown.trim()) return;
      section.markdown = markdown.trim();
    });
  }

  async retag(runId: string, index: number, tag: SectionTag): Promise<void> {
    await this.runs.update(runId, (run) => {
      const section = run.sections[index];
      if (section?.status === "proposed" && section.markdown) section.markdown = retagSection(section.markdown, tag);
    });
  }
}

// A stopped run whose every section is accepted or discarded is done.
function finishIfReviewed(run: AgentRun): void {
  if (run.status !== "running" && run.sections.every((section) => section.status === "accepted" || section.status === "discarded")) {
    run.status = "done";
  }
}
