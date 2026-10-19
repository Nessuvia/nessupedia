import { cardSource, normalizeCard, parseCardSource, readCardFile, writeCardPng, type CharacterCard } from "@/cards/cardFile";
import type { WikiDatabase } from "@/db/database";
import type { Card, ChangeEntry } from "@/db/types";
import type { AssetService } from "./AssetService";
import type { ChangeLog } from "./ChangeLog";

export interface CardDownload {
  data: Uint8Array<ArrayBuffer>;
  fileName: string;
  type: string;
}

export interface SaveCardOptions {
  author?: ChangeEntry["author"];
  minor?: boolean;
  summary?: string;
}

// Avatars are stored like any image, usually as WebP, so a PNG card redraws them.
async function canvasPng(image: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(image);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.convertToBlob({ type: "image/png" });
}

const bytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

function fileName(name: string, extension: string): string {
  const safe = name.replace(/[\\/:*?"<>|]/g, "-").trim() || "card";
  return `${safe}.${extension}`;
}

// Character cards attached to pages. Every change is recorded in the page's history as a card change,
// diffed as the card's JSON, so cards restore like pages do.
export class CardService {
  constructor(
    private readonly db: WikiDatabase,
    private readonly assets: AssetService,
    private readonly changes: ChangeLog,
    private readonly toPng: (image: Blob) => Promise<Blob> = canvasPng,
  ) {}

  get(pageId: string): Promise<Card | undefined> {
    return this.db.cards.get(pageId);
  }

  listForWiki(wikiId: string): Promise<Card[]> {
    return this.db.cards.where("wikiId").equals(wikiId).toArray();
  }

  // Adds a .png or .json card to a page, replacing the one it has.
  async upload(pageId: string, file: Blob, { author = "human" }: Pick<SaveCardOptions, "author"> = {}): Promise<Card> {
    const { card, png } = readCardFile(await bytes(file));
    const existing = await this.get(pageId);
    const image = png && (await this.assets.addImage(await this.wikiOf(pageId), new Blob([png as Uint8Array<ArrayBuffer>], { type: "image/png" }), card.data.name));
    // A JSON card has no image, so it keeps the one the page's card had.
    return this.write(pageId, card, image?.path ?? existing?.avatar, {
      kind: existing ? "edit" : "create",
      author,
      minor: false,
      summary: existing ? "Replaced the card" : "Added a card",
    });
  }

  save(pageId: string, card: CharacterCard, avatar: string | undefined, { author = "human", minor = false, summary = "Edited the card" }: SaveCardOptions = {}): Promise<Card> {
    return this.write(pageId, normalizeCard(card), avatar, { kind: "edit", author, minor, summary });
  }

  async setAvatar(pageId: string, image: Blob): Promise<Card> {
    const card = await this.require(pageId);
    const asset = await this.assets.addImage(card.wikiId, image, card.card.data.name);
    return this.save(pageId, card.card, asset.path, { summary: "Changed the card's image" });
  }

  // Brings back a card as it was in an earlier change, also when it was removed.
  restore(pageId: string, source: string, summary = "Restored an earlier card"): Promise<Card> {
    const { card, avatar } = parseCardSource(source);
    return this.write(pageId, card, avatar, { kind: "restore", author: "human", minor: false, summary });
  }

  async remove(pageId: string, { author = "human" }: Pick<SaveCardOptions, "author"> = {}): Promise<void> {
    await this.db.transaction("rw", this.db.cards, this.db.pages, this.db.changes, async () => {
      const existing = await this.require(pageId);
      const page = await this.db.pages.get(pageId);
      await this.db.cards.delete(pageId);
      await this.changes.record({
        wikiId: existing.wikiId,
        pageId,
        pageTitle: page?.title ?? existing.card.data.name,
        kind: "delete",
        subject: "card",
        author,
        minor: false,
        summary: "Removed the card",
        before: cardSource(existing.card, existing.avatar),
        after: "",
      });
    });
  }

  // A plain V3 card with no history: a PNG when it has an image, JSON otherwise.
  async download(pageId: string): Promise<CardDownload> {
    const { card, avatar, wikiId } = await this.require(pageId);
    const asset = avatar ? await this.assets.find(wikiId, avatar) : undefined;
    if (!asset) {
      return { data: new TextEncoder().encode(`${JSON.stringify(card, null, 2)}\n`), fileName: fileName(card.data.name, "json"), type: "application/json" };
    }
    const png = asset.mime === "image/png" ? asset.blob : await this.toPng(asset.blob);
    return { data: writeCardPng(await bytes(png), card) as Uint8Array<ArrayBuffer>, fileName: fileName(card.data.name, "png"), type: "image/png" };
  }

  private async write(
    pageId: string,
    card: CharacterCard,
    avatar: string | undefined,
    { kind, author, minor, summary }: Required<SaveCardOptions> & { kind: ChangeEntry["kind"] },
  ): Promise<Card> {
    return this.db.transaction("rw", this.db.cards, this.db.pages, this.db.changes, async () => {
      const page = await this.db.pages.get(pageId);
      if (!page) throw new Error(`Page ${pageId} not found`);
      const existing = await this.get(pageId);
      const saved: Card = { pageId, wikiId: page.wikiId, card, ...(avatar && { avatar }), updatedAt: Date.now() };
      await this.db.cards.put(saved);
      await this.changes.record({
        wikiId: page.wikiId,
        pageId,
        pageTitle: page.title,
        kind,
        subject: "card",
        author,
        minor,
        summary,
        before: existing ? cardSource(existing.card, existing.avatar) : "",
        after: cardSource(card, avatar),
      });
      return saved;
    });
  }

  private async require(pageId: string): Promise<Card> {
    const card = await this.get(pageId);
    if (!card) throw new Error("This page has no card");
    return card;
  }

  private async wikiOf(pageId: string): Promise<string> {
    const page = await this.db.pages.get(pageId);
    if (!page) throw new Error(`Page ${pageId} not found`);
    return page.wikiId;
  }
}
