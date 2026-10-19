import type { WikiDatabase } from "@/db/database";
import type { Appearance, Wiki, WikiFont } from "@/db/types";
import { isHexColor } from "@/utils/color";
import { sha256 } from "./AssetService";

type Fetch = typeof globalThis.fetch;

export type FontRole = "heading" | "body";

export interface FontsourceFont {
  id: string;
  family: string;
  category: string;
}

interface FontsourceDetail extends FontsourceFont {
  weights: number[];
  styles: string[];
  subsets: string[];
  unicodeRange: Record<string, string>;
  variants: Record<string, Record<string, Record<string, { url: { woff2: string } }>>>;
}

const FONTSOURCE_API = "https://api.fontsource.org/v1/fonts";
const SUBSETS = ["latin", "latin-ext"];
const FONT_FILE_PREFIX = "assets/fonts/";

// The weight closest to the one wanted that the font has.
const nearest = (weights: number[], wanted: number) =>
  weights.reduce((best, weight) => (Math.abs(weight - wanted) < Math.abs(best - wanted) ? weight : best));

// A wiki's accent, fonts, and images. Fonts and images are stored as the wiki's assets, so exports carry them.
export class AppearanceService {
  private fontList?: Promise<FontsourceFont[]>;

  constructor(
    private readonly db: WikiDatabase,
    private readonly fetch: Fetch = (...args) => globalThis.fetch(...args),
  ) {}

  async setAccent(wikiId: string, accent: string | undefined): Promise<void> {
    if (accent !== undefined && !isHexColor(accent)) throw new Error(`${accent} isn't a #rrggbb color`);
    await this.update(wikiId, (appearance) => ({ ...appearance, accent: accent?.toLowerCase() }));
  }

  // Fontsource's whole catalog, fetched once per session.
  listFonts(): Promise<FontsourceFont[]> {
    this.fontList ??= this.json<FontsourceFont[]>(FONTSOURCE_API)
      .then((fonts) => fonts.map(({ id, family, category }) => ({ id, family, category })))
      .catch((error) => {
        this.fontList = undefined;
        throw error;
      });
    return this.fontList;
  }

  // Downloads regular and bold, plus italics for body text, in the Latin subsets; unset goes back to system fonts.
  async setFont(wikiId: string, role: FontRole, fontId: string | undefined): Promise<void> {
    const font = fontId === undefined ? undefined : await this.download(wikiId, role, fontId);
    await this.update(wikiId, (appearance) => ({ ...appearance, fonts: { ...appearance.fonts, [role]: font } }));
    await this.dropUnusedFonts(wikiId);
  }

  private async download(wikiId: string, role: FontRole, fontId: string): Promise<WikiFont> {
    const detail = await this.json<FontsourceDetail>(`${FONTSOURCE_API}/${encodeURIComponent(fontId)}`);
    const weights = [...new Set([400, 700].map((wanted) => nearest(detail.weights, wanted)))];
    const styles = role === "body" && detail.styles.includes("italic") ? (["normal", "italic"] as const) : (["normal"] as const);
    const subsets = SUBSETS.filter((subset) => detail.subsets.includes(subset));
    if (!subsets.length) subsets.push(detail.subsets[0]);

    const files: WikiFont["files"] = [];
    for (const weight of weights) {
      for (const style of styles) {
        for (const subset of subsets) {
          const url = detail.variants[weight]?.[style]?.[subset]?.url.woff2;
          if (!url) continue;
          const path = `${FONT_FILE_PREFIX}${detail.id}-${subset}-${weight}-${style}.woff2`;
          await this.storeFile(wikiId, path, url);
          files.push({ path, weight, style, unicodeRange: detail.unicodeRange[subset] });
        }
      }
    }
    if (!files.length) throw new Error(`${detail.family} has no web font files to download`);
    return { id: detail.id, family: detail.family, category: detail.category, files };
  }

  private async storeFile(wikiId: string, path: string, url: string): Promise<void> {
    if (await this.db.assets.where("[wikiId+path]").equals([wikiId, path]).count()) return;
    const response = await this.fetch(url);
    if (!response.ok) throw new Error(`Downloading the font failed (${response.status}).`);
    const blob = new Blob([await response.arrayBuffer()], { type: "font/woff2" });
    await this.db.assets.add({ id: crypto.randomUUID(), wikiId, path, mime: blob.type, blob, hash: await sha256(blob), createdAt: Date.now() });
  }

  private async dropUnusedFonts(wikiId: string): Promise<void> {
    const fonts = (await this.db.wikis.get(wikiId))?.appearance?.fonts;
    const used = new Set([fonts?.heading, fonts?.body].flatMap((font) => font?.files.map((file) => file.path) ?? []));
    await this.db.assets
      .where("wikiId")
      .equals(wikiId)
      .filter((asset) => asset.path.startsWith(FONT_FILE_PREFIX) && !used.has(asset.path))
      .delete();
  }

  private async update(wikiId: string, change: (appearance: Appearance) => Appearance): Promise<Wiki> {
    return this.db.transaction("rw", this.db.wikis, async () => {
      const wiki = await this.db.wikis.get(wikiId);
      if (!wiki) throw new Error("This wiki no longer exists");
      const updated = { ...wiki, appearance: change(wiki.appearance ?? {}) };
      await this.db.wikis.put(updated);
      return updated;
    });
  }

  private async json<T>(url: string): Promise<T> {
    let response: Response;
    try {
      response = await this.fetch(url);
    } catch {
      throw new Error("Couldn't reach Fontsource. Check your connection and try again.");
    }
    if (!response.ok) throw new Error(`Fontsource answered ${response.status}.`);
    return (await response.json()) as T;
  }
}
