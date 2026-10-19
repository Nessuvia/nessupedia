import { beforeEach, describe, expect, it } from "vitest";
import { WikiDatabase } from "@/db/database";
import type { ModelSettings, Page } from "@/db/types";
import { LlmClient } from "@/llm/LlmClient";
import { defaultModelSettings } from "@/llm/providers";
import { TokenCounter } from "@/llm/TokenCounter";
import { parseMarkdown, renderMarkdown } from "@/markdown/pipeline";
import { ChangeLog } from "@/services/ChangeLog";
import { applyLinks, LinkSuggester, linkableText, parseLinkLines, unlinkedMentions } from "@/services/LinkSuggester";
import { LinkIndexer } from "@/services/LinkIndexer";
import { PageService } from "@/services/PageService";
import { TokenizerService } from "@/services/TokenizerService";
import { WikiService } from "@/services/WikiService";
import { fakeFetch, finish, sse, textDelta } from "./fakeLlm";

const ORIGIN = "http://kobold.test:5001";

let db: WikiDatabase;
let pages: PageService;
let wikiId: string;
let replies: string[];
let suggester: LinkSuggester;
let settings: ModelSettings;

beforeEach(async () => {
  db = new WikiDatabase(`test-${crypto.randomUUID()}`);
  pages = new PageService(db, new LinkIndexer(db), new ChangeLog(db));
  wikiId = (await new WikiService(db).create("Ashfall")).id;
  replies = [];
  const server = fakeFetch(ORIGIN, { "POST /v1/chat/completions": () => sse([textDelta(replies.shift() ?? ""), finish("stop")]) });
  const client = new LlmClient(server.fetch, { firstToken: 2000, idle: 2000 });
  settings = { ...defaultModelSettings("koboldcpp"), baseUrl: `${ORIGIN}/v1`, model: "gemma" };
  suggester = new LinkSuggester(db, pages, client, new TokenCounter(client, new TokenizerService(db)), async () => settings);
  await pages.create({ wikiId, title: "Mira", body: "---\naliases: [Mi]\n---\n\nA sellsword." });
  await pages.create({ wikiId, title: "Ember Quarter", body: "A district." });
  await pages.create({ wikiId, title: "Corin Vale", body: "A smith." });
});

const body = [
  "## Mira and the forge",
  "Theo met mi in the ember quarter, then Mira again. Corin Vale was there.",
  "`Mira` in code, [[Ember Quarter]] is linked below, and a [[Theo]] link.",
  ":::infobox\nSister: Mira\n:::",
].join("\n\n");

const theo = async () => pages.create({ wikiId, title: "Theo", body });
const all = () => pages.listForWiki(wikiId);

describe("unlinked mentions", () => {
  it("finds the first mention of each page, outside headings, code, links, and infoboxes, skipping linked pages", async () => {
    const page = await theo();
    const found = unlinkedMentions(page, await all());
    expect(found.map(({ text, title }) => [text, title])).toEqual([
      ["mi", "Mira"],
      ["Corin Vale", "Corin Vale"],
    ]);
    expect(body.slice(found[0]!.start, found[0]!.end)).toBe("mi");
    expect(linkableText("Text with a \\* star.").map(({ value }) => value)).toEqual([]);
  });

  it("links the words as written, and skips text that changed since", async () => {
    const page = await theo();
    const list = await all();
    const found = unlinkedMentions(page, list);
    const labelled = { start: body.indexOf("Corin"), end: body.indexOf("Corin") + 5, text: "Corin", title: "Corin Vale" };
    expect(applyLinks(body, [found[0]!, labelled], list)).toContain("Theo met [[mi]] in the ember quarter, then Mira again. [[Corin Vale|Corin]] Vale");
    expect(applyLinks("Changed.", found, list)).toBe("Changed.");
  });

  it("underlines marked ranges when rendering", () => {
    const source = "Theo met Mira, then *Mira* again.";
    const { html } = renderMarkdown(parseMarkdown(source).tree, { marks: [{ id: 3, start: 9, end: 13 }] });
    expect(html).toBe('<p data-start="0" data-end="33">Theo met <mark class="text-mark" data-mark="3">Mira</mark>, then <em>Mira</em> again.</p>');
  });
});

describe("Assistant suggestions", () => {
  it("keeps lines whose phrase is in unlinked text and whose title exists", async () => {
    const page = await theo();
    const reply = "Here you go:\n- \"the ember quarter\" -> Ember Quarter\nher -> Mira\nthe forge -> [[Corin Vale]]\nghost -> Nobody\nTheo -> Theo";
    const taken = unlinkedMentions(page, await all());
    expect(parseLinkLines(reply, page, await all(), taken).map(({ text, title }) => [text, title])).toEqual([]);

    const loose = { ...page, body: "Theo visited the old forge with his friend.\n\n[[Ember Quarter]]" } as Page;
    expect(parseLinkLines("the old forge -> Corin Vale\nhis friend -> Mi\nEmber Quarter -> Ember Quarter", loose, await all(), [])).toMatchObject([
      { text: "the old forge", title: "Corin Vale", byAssistant: true },
      { text: "his friend", title: "Mira", byAssistant: true },
    ]);
  });

  it("records the request as a run, and saves accepted links as one edit each by you and the Assistant", async () => {
    const page = await pages.create({ wikiId, title: "Theo", body: "Theo met Mira at the old forge." });
    replies.push("the old forge -> Corin Vale");
    const run = await suggester.askAssistant(page.id, []);
    expect(run).toMatchObject({ kind: "suggest-links", status: "done", linkSuggestions: [{ text: "the old forge", title: "Corin Vale", byAssistant: true }] });

    const local = await suggester.suggest(page.id);
    await suggester.accept(page.id, [...local, ...run.linkSuggestions!]);
    expect((await pages.get(page.id))!.body).toBe("Theo met [[Mira]] at [[Corin Vale|the old forge]].");
    const history = await db.changes.where("pageId").equals(page.id).toArray();
    expect(history.map(({ author, summary }) => [author, summary])).toEqual([
      ["human", "Created page"],
      ["human", "Linked Mira"],
      ["llm", "Linked Corin Vale"],
    ]);
  });

  it("asks once more when the reply has no lines, and stops with an error without a model", async () => {
    const page = await pages.create({ wikiId, title: "Theo", body: "Theo met someone." });
    replies.push("I couldn't say.", "NONE");
    expect(await suggester.askAssistant(page.id, [])).toMatchObject({ status: "done", linkSuggestions: [] });
    settings.baseUrl = "";
    expect(await suggester.askAssistant(page.id, [])).toMatchObject({ status: "error", error: "Set up a model in Settings first." });
  });
});
