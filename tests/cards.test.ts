import { beforeEach, describe, expect, it } from "vitest";
import { cardSource, cardToV2, emptyCard, normalizeCard, readCardFile, writeCardPng, type CharacterCard } from "@/cards/cardFile";
import { WikiDatabase } from "@/db/database";
import { sectionUserPrompt } from "@/llm/prompts";
import { WikiTools } from "@/llm/tools";
import { parseInfobox, serializeInfobox } from "@/markdown/fields";
import { parseMarkdown, renderMarkdown } from "@/markdown/pipeline";
import { ArchiveService } from "@/services/ArchiveService";
import { RelationshipService } from "@/services/RelationshipService";
import { SearchService } from "@/services/SearchService";
import { AssetService } from "@/services/AssetService";
import { CardService } from "@/services/CardService";
import { ChangeLog, rebuildVersions } from "@/services/ChangeLog";
import { LinkIndexer } from "@/services/LinkIndexer";
import { PageService } from "@/services/PageService";
import { WikiService } from "@/services/WikiService";

// A 1×1 PNG.
const PIXEL = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

const v2Card = {
  spec: "chara_card_v2",
  spec_version: "2.0",
  data: {
    name: "Damien",
    description: "A widower in Seattle.",
    first_mes: "Damien sits alone on the park bench.",
    alternate_greetings: ["He glances at the clock."],
    character_book: { name: "Damien's lore", entries: [{ keys: ["Lucas"], content: "His son." }] },
    extensions: { gallery: ["big"] },
    custom_field: 7,
  },
};

const fileOf = (bytes: Uint8Array, type: string) => new Blob([bytes as Uint8Array<ArrayBuffer>], { type });
const jsonFile = (value: unknown) => fileOf(new TextEncoder().encode(JSON.stringify(value)), "application/json");
const textChunks = (png: Uint8Array) => {
  const view = new DataView(png.buffer, png.byteOffset);
  let count = 0;
  for (let at = 8; at < png.length; at += 12 + view.getUint32(at)) if (String.fromCharCode(...png.subarray(at + 4, at + 8)) === "tEXt") count++;
  return count;
};

describe("card files", () => {
  it("reads V1 and V2 cards as V3, keeping the lorebook, extensions, and unknown fields", () => {
    expect(normalizeCard({ name: "Mira", description: "Flat" })).toMatchObject({ spec: "chara_card_v3", data: { name: "Mira", description: "Flat", tags: [] } });
    const card = normalizeCard(v2Card);
    expect(card.spec).toBe("chara_card_v3");
    expect(card.data).toMatchObject({ name: "Damien", personality: "", custom_field: 7, extensions: { gallery: ["big"] } });
    expect(card.data.character_book?.entries).toHaveLength(1);
  });

  it("refuses files that aren't cards", () => {
    expect(() => readCardFile(new TextEncoder().encode("hello"))).toThrow("neither a PNG nor JSON");
    expect(() => readCardFile(PIXEL)).toThrow("no character card");
    expect(() => normalizeCard({ data: {}, spec: "chara_card_v2" })).toThrow("no name");
  });

  it("writes V2 and V3 chunks into a PNG and reads the V3 one back, replacing any card it held", () => {
    const card = normalizeCard({ ...v2Card, data: { ...v2Card.data, nickname: "Dame", description: "Ünïcode ✓" } });
    const once = writeCardPng(PIXEL, card);
    const twice = writeCardPng(once, card);
    expect(textChunks(twice)).toBe(2);
    expect(readCardFile(twice).card).toEqual(card);
    expect(cardToV2(card)).toMatchObject({ spec: "chara_card_v2", data: { name: "Damien" } });
    expect((cardToV2(card).data as Record<string, unknown>).nickname).toBeUndefined();
  });
});

describe("infobox chat button", () => {
  const html = (markdown: string, chatWith?: string) =>
    renderMarkdown(parseMarkdown(markdown).tree, chatWith === undefined ? {} : { chatWith }).blocks.map((block) => block.html).join("");

  it("shows only with a card, with the infobox's own text when it sets one", () => {
    expect(html(":::infobox\ntitle: Damien\n:::\n")).not.toContain("infobox-chat");
    expect(html(":::infobox\ntitle: Damien\n:::\n", "Damien")).toContain(">Chat with Damien</button>");
    expect(html(":::infobox\nchat: Talk to Damien!\n:::\n", "Damien")).toContain(">Talk to Damien!</button>");
    expect(html(":::infobox\nchat: Talk to Damien!\n:::\n")).not.toContain("Talk to");
    expect(serializeInfobox(parseInfobox("title: Damien\nchat: Talk!\nAge: 41"))).toBe("title: Damien\nchat: Talk!\nAge: 41");
  });
});

describe("CardService", () => {
  let db: WikiDatabase;
  let pages: PageService;
  let changes: ChangeLog;
  let cards: CardService;
  let wikiId: string;
  let pageId: string;

  beforeEach(async () => {
    db = new WikiDatabase(`test-${crypto.randomUUID()}`);
    changes = new ChangeLog(db);
    pages = new PageService(db, new LinkIndexer(db), changes);
    cards = new CardService(db, new AssetService(db, async () => undefined), changes, async (blob) => blob);
    wikiId = (await new WikiService(db).create("Ashfall")).id;
    pageId = (await pages.create({ wikiId, title: "Damien", body: "Lead.\n" })).id;
  });

  it("adds a PNG card with its image and records it as a card change", async () => {
    const card = await cards.upload(pageId, fileOf(writeCardPng(PIXEL, normalizeCard(v2Card)), "image/png"));
    expect(card.avatar).toMatch(/^assets\/damien-[0-9a-f]{10}\.png$/);
    expect(card.card.data.first_mes).toBe("Damien sits alone on the park bench.");
    const [entry] = await changes.listForPage(pageId, "card");
    expect(entry).toMatchObject({ kind: "create", subject: "card", summary: "Added a card" });
    expect((await changes.listForPage(pageId)).map((change) => change.kind)).toEqual(["create"]);
  });

  it("keeps card edits apart from page edits and restores earlier cards", async () => {
    await cards.upload(pageId, jsonFile(v2Card));
    await pages.save(pageId, "Lead, edited.\n");
    const edited: CharacterCard = { ...(await cards.get(pageId))!.card };
    edited.data = { ...edited.data, personality: "Steady." };
    await cards.save(pageId, edited, undefined);
    await pages.save(pageId, "Lead, edited again.\n");

    const pageEntries = await changes.listForPage(pageId);
    expect(rebuildVersions(pageEntries, "Lead, edited again.\n").get(pageEntries.at(-1)!.id!)).toBe("Lead.\n");

    const cardEntries = await changes.listForPage(pageId, "card");
    expect(cardEntries.map((entry) => entry.kind)).toEqual(["edit", "create"]);
    const versions = rebuildVersions(cardEntries, cardSource((await cards.get(pageId))!.card));
    await cards.restore(pageId, versions.get(cardEntries[1]!.id!)!);
    expect((await cards.get(pageId))!.card.data.personality).toBe("");
  });

  it("goes with its page when the page is deleted and comes back when it's restored", async () => {
    await cards.upload(pageId, jsonFile(v2Card));
    await pages.delete(pageId);
    expect(await cards.get(pageId)).toBeUndefined();
    expect((await changes.listForPage(pageId))[0]).toMatchObject({ kind: "delete" });

    await pages.restore(pageId, "Lead.\n");
    expect((await cards.get(pageId))!.card.data.name).toBe("Damien");
    expect((await changes.listForPage(pageId, "card"))[0]).toMatchObject({ kind: "restore" });
  });

  it("downloads a plain V3 card: a PNG with an image, JSON without", async () => {
    await cards.upload(pageId, jsonFile(v2Card));
    const json = await cards.download(pageId);
    expect(json).toMatchObject({ fileName: "Damien.json", type: "application/json" });
    expect(JSON.parse(new TextDecoder().decode(json.data))).toMatchObject({ spec: "chara_card_v3", data: { name: "Damien" } });

    await cards.setAvatar(pageId, fileOf(PIXEL, "image/png"));
    const png = await cards.download(pageId);
    expect(png).toMatchObject({ fileName: "Damien.png", type: "image/png" });
    expect(readCardFile(png.data).card.data.name).toBe("Damien");
  });

  it("removes a card and records the removal", async () => {
    await cards.upload(pageId, jsonFile(emptyCard("Damien")));
    await cards.remove(pageId);
    expect(await cards.get(pageId)).toBeUndefined();
    expect((await changes.listForPage(pageId, "card"))[0]).toMatchObject({ kind: "delete", summary: "Removed the card" });
  });

  it("is read by the read_card tool, and a version without a card reads its main page's", async () => {
    await cards.upload(pageId, jsonFile(v2Card));
    const links = new LinkIndexer(db);
    const tools = new WikiTools(db, links, new SearchService(db), new RelationshipService(db, links));
    const read = await tools.run(wikiId, { name: "read_card", arguments: '{"title": "Damien"}' });
    expect(read.content).toContain("# Character card of Damien");
    expect(read.content).toContain("First message:\nDamien sits alone");
    expect(read.content).not.toContain("His son.");

    await db.wikis.update(wikiId, { continuities: [{ id: "noir", name: "Noir AU", description: "" }] });
    await pages.create({ wikiId, title: "Damien/Noir AU" });
    expect((await tools.run(wikiId, { name: "read_card", arguments: '{"title": "Damien/Noir AU"}' })).content).toContain("Damien sits alone");
    expect(sectionUserPrompt({ heading: "Background", pageTitle: "Damien", autoContext: [], written: [], hints: [], cardText: "Name:\nDamien" })).toContain(
      "## The page's character card",
    );
  });

  it("travels in wiki exports with its history", async () => {
    await cards.upload(pageId, jsonFile(v2Card));
    const archive = new ArchiveService(db, new LinkIndexer(db));
    const files = await archive.serialize(wikiId);
    expect(Object.keys(files)).toContain("cards/Damien.json");

    const [copy] = await archive.importZip(await archive.exportZip([wikiId]));
    const page = (await db.pages.where("wikiId").equals(copy!.id).first())!;
    expect((await cards.get(page.id))!.card.data.character_book?.entries).toHaveLength(1);
    expect((await changes.listForPage(page.id, "card")).map((entry) => entry.kind)).toEqual(["create"]);
  });
});
