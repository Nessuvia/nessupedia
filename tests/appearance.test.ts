import { beforeEach, describe, expect, it, vi } from "vitest";
import { WikiDatabase } from "@/db/database";
import { AppearanceService } from "@/services/AppearanceService";
import { WikiService } from "@/services/WikiService";

const cdn = (id: string, subset: string, weight: number, style: string) =>
  `https://cdn.test/${id}/${subset}-${weight}-${style}.woff2`;

function detail(id: string, family: string, weights: number[], styles: string[], subsets: string[]) {
  const variants: Record<number, Record<string, Record<string, { url: { woff2: string } }>>> = {};
  for (const weight of weights)
    for (const style of styles)
      for (const subset of subsets) ((variants[weight] ??= {})[style] ??= {})[subset] = { url: { woff2: cdn(id, subset, weight, style) } };
  const unicodeRange = Object.fromEntries(subsets.map((subset) => [subset, `U+${subset}`]));
  return { id, family, category: "sans-serif", weights, styles, subsets, unicodeRange, variants };
}

const FONTS = {
  rubik: detail("rubik", "Rubik", [300, 400, 500, 700], ["normal", "italic"], ["cyrillic", "latin", "latin-ext"]),
  lobster: detail("lobster", "Lobster", [400], ["normal"], ["latin"]),
};

let db: WikiDatabase;
let wikiId: string;
let fetch: ReturnType<typeof vi.fn>;
let appearance: AppearanceService;

beforeEach(async () => {
  db = new WikiDatabase(`test-${crypto.randomUUID()}`);
  wikiId = (await new WikiService(db).create("Ashfall")).id;
  fetch = vi.fn(async (url: string) => {
    const id = url.match(/fonts\/([^/]+)$/)?.[1] as keyof typeof FONTS | undefined;
    if (id) return FONTS[id] ? Response.json(FONTS[id]) : new Response("", { status: 404 });
    if (url.endsWith("/fonts")) return Response.json(Object.values(FONTS));
    return new Response(new Uint8Array([1, 2, 3]));
  });
  appearance = new AppearanceService(db, fetch as unknown as typeof globalThis.fetch);
});

const fontPaths = async () => (await db.assets.where("wikiId").equals(wikiId).toArray()).map((asset) => asset.path).sort();

describe("AppearanceService", () => {
  it("stores a lowercase accent and refuses anything but #rrggbb", async () => {
    await appearance.setAccent(wikiId, "#E63462");
    expect((await db.wikis.get(wikiId))?.appearance?.accent).toBe("#e63462");
    await expect(appearance.setAccent(wikiId, "pink")).rejects.toThrow();
  });

  it("downloads regular, bold, and italics for body text in the Latin subsets", async () => {
    await appearance.setFont(wikiId, "body", "rubik");
    const font = (await db.wikis.get(wikiId))?.appearance?.fonts?.body;
    expect(font?.family).toBe("Rubik");
    expect(font?.files).toHaveLength(8);
    expect(font?.files.find((file) => file.path.endsWith("latin-400-normal.woff2"))?.unicodeRange).toBe("U+latin");
    expect(await fontPaths()).toContain("assets/fonts/rubik-latin-ext-700-italic.woff2");
    expect(await fontPaths()).not.toContain("assets/fonts/rubik-cyrillic-400-normal.woff2");
  });

  it("takes the nearest weights a font has, and only normal style for headings", async () => {
    await appearance.setFont(wikiId, "heading", "lobster");
    expect(await fontPaths()).toEqual(["assets/fonts/lobster-latin-400-normal.woff2"]);
  });

  it("drops a font's files once neither role uses it", async () => {
    await appearance.setFont(wikiId, "heading", "rubik");
    await appearance.setFont(wikiId, "body", "rubik");
    await appearance.setFont(wikiId, "heading", "lobster");
    expect((await fontPaths()).some((path) => path.startsWith("assets/fonts/rubik-"))).toBe(true);
    await appearance.setFont(wikiId, "body", undefined);
    expect(await fontPaths()).toEqual(["assets/fonts/lobster-latin-400-normal.woff2"]);
    expect((await db.wikis.get(wikiId))?.appearance?.fonts?.body).toBeUndefined();
  });

  it("keeps the old font when a download fails", async () => {
    await appearance.setFont(wikiId, "heading", "lobster");
    await expect(appearance.setFont(wikiId, "heading", "missing")).rejects.toThrow("404");
    expect((await db.wikis.get(wikiId))?.appearance?.fonts?.heading?.family).toBe("Lobster");
  });
});
