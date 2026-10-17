import { beforeEach, describe, expect, it, vi } from "vitest";
import { WikiDatabase } from "@/db/database";
import { AssetService, MAX_IMAGE_EDGE, type ImageEncoder } from "@/services/AssetService";
import { WikiService } from "@/services/WikiService";

let db: WikiDatabase;
let wikis: WikiService;
let wikiId: string;

const png = (bytes: number[]) => new Blob([new Uint8Array(bytes)], { type: "image/png" });
const webp = (size: number) => new Blob([new Uint8Array(size)], { type: "image/webp" });

const encoder = (result: Awaited<ReturnType<ImageEncoder>>) => vi.fn<ImageEncoder>(async () => result);

beforeEach(async () => {
  db = new WikiDatabase(`test-${crypto.randomUUID()}`);
  wikis = new WikiService(db);
  wikiId = (await wikis.create("Ashfall")).id;
});

describe("AssetService", () => {
  it("stores the WebP encoding under a name and content hash", async () => {
    const encode = encoder({ blob: webp(2), width: 2048, height: 1024, scaled: true });
    const assets = new AssetService(db, encode);

    const asset = await assets.addImage(wikiId, png([1, 2, 3, 4]), "Mira's Portrait (final).PNG");
    expect(encode).toHaveBeenCalledWith(expect.any(Blob), MAX_IMAGE_EDGE);
    expect(asset).toMatchObject({ mime: "image/webp", width: 2048, height: 1024 });
    expect(asset.path).toMatch(/^assets\/mira-s-portrait-final-[0-9a-f]{10}\.webp$/);
    expect(asset.original).toBeUndefined();
    expect(await assets.find(wikiId, asset.path)).toMatchObject({ id: asset.id });
  });

  it("keeps the given file when encoding neither shrinks nor scales it", async () => {
    const assets = new AssetService(db, encoder({ blob: webp(10), width: 4, height: 4, scaled: false }));
    const asset = await assets.addImage(wikiId, png([1, 2, 3]), "tiny.png");
    expect(asset).toMatchObject({ mime: "image/png", width: 4, height: 4 });
    expect(asset.path).toMatch(/\.png$/);
  });

  it("stores GIFs and SVGs as they are", async () => {
    const encode = encoder(undefined);
    const assets = new AssetService(db, encode);
    const gif = await assets.addImage(wikiId, new Blob(["GIF89a"], { type: "image/gif" }), "dance.gif");
    expect(gif.path).toMatch(/^assets\/dance-[0-9a-f]{10}\.gif$/);
    expect(encode).not.toHaveBeenCalled();
  });

  it("keeps the original when the wiki asks for it", async () => {
    await wikis.setKeepOriginalImages(wikiId, true);
    const assets = new AssetService(db, encoder({ blob: webp(2), width: 1, height: 1, scaled: true }));
    const asset = await assets.addImage(wikiId, png([9, 9, 9]), "big.png");
    expect(asset.original?.type).toBe("image/png");
  });

  it("stores identical images once per wiki", async () => {
    const encode = encoder({ blob: webp(1), width: 1, height: 1, scaled: true });
    const assets = new AssetService(db, encode);
    const first = await assets.addImage(wikiId, png([5, 6]), "a.png");
    const again = await assets.addImage(wikiId, png([5, 6]), "b.png");
    const other = await assets.addImage((await wikis.create("Other")).id, png([5, 6]), "a.png");

    expect(again.id).toBe(first.id);
    expect(other.id).not.toBe(first.id);
    expect(encode).toHaveBeenCalledTimes(2);
  });

  it("rejects files that aren't images", async () => {
    const assets = new AssetService(db, encoder(undefined));
    await expect(assets.addImage(wikiId, new Blob(["hi"], { type: "text/plain" }))).rejects.toThrow("only images");
  });

  it("finds bare file names inside assets/", async () => {
    const assets = new AssetService(db, encoder(undefined));
    await db.assets.add({ id: "x", wikiId, path: "assets/cat.png", mime: "image/png", blob: png([1]), hash: "h", createdAt: 0 });
    expect(await assets.find(wikiId, "cat.png")).toMatchObject({ id: "x" });
    expect(await assets.find(wikiId, "assets/dog.png")).toBeUndefined();
  });

  it("is removed with its wiki", async () => {
    const assets = new AssetService(db, encoder(undefined));
    await assets.addImage(wikiId, png([1]), "a.png");
    await wikis.delete(wikiId);
    expect(await db.assets.count()).toBe(0);
  });
});
