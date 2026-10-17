import type { WikiDatabase } from "@/db/database";
import type { Asset } from "@/db/types";

export interface EncodedImage {
  blob: Blob;
  width: number;
  height: number;
  scaled: boolean;
}

// Returns undefined when the image can't be decoded or re-encoded, in which case it is stored as given.
export type ImageEncoder = (image: Blob, maxEdge: number) => Promise<EncodedImage | undefined>;

export const MAX_IMAGE_EDGE = 2048;

const EXTENSIONS: Record<string, string> = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/avif": "avif",
  "image/bmp": "bmp",
};

// Animated GIFs would lose their frames and SVGs would lose their scaling, so both stay as they are.
const KEEP_AS_IS = new Set(["image/gif", "image/svg+xml"]);

export const isSupportedImage = (file: Blob) => file.type in EXTENSIONS;

function baseName(name: string): string {
  const stem = name.replace(/\.[^.]*$/, "");
  const slug = stem
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return slug || "image";
}

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class AssetService {
  private readonly urls = new Map<string, Promise<string | undefined>>();

  constructor(
    private readonly db: WikiDatabase,
    private readonly encode: ImageEncoder,
  ) {}

  async addImage(wikiId: string, file: Blob, name = "image"): Promise<Asset> {
    if (!isSupportedImage(file)) throw new Error(`Can't add ${file.type || "this file"}: only images are supported`);

    const hash = await sha256(file);
    const existing = await this.db.assets.where("[wikiId+hash]").equals([wikiId, hash]).first();
    if (existing) return existing;

    let blob = file;
    let size: Pick<Asset, "width" | "height"> = {};
    if (!KEEP_AS_IS.has(file.type)) {
      const encoded = await this.encode(file, MAX_IMAGE_EDGE);
      if (encoded) {
        size = { width: encoded.width, height: encoded.height };
        if (encoded.scaled || encoded.blob.size < file.size) blob = encoded.blob;
      }
    }

    const wiki = await this.db.wikis.get(wikiId);
    const asset: Asset = {
      id: crypto.randomUUID(),
      wikiId,
      path: `assets/${baseName(name)}-${hash.slice(0, 10)}.${EXTENSIONS[blob.type] ?? "bin"}`,
      mime: blob.type,
      blob,
      hash,
      ...size,
      ...(wiki?.keepOriginalImages && blob !== file && { original: file }),
      createdAt: Date.now(),
    };
    await this.db.assets.add(asset);
    return asset;
  }

  // Bare file names, as Obsidian writes them, also resolve inside assets/.
  async find(wikiId: string, path: string): Promise<Asset | undefined> {
    const exact = await this.db.assets.where("[wikiId+path]").equals([wikiId, path]).first();
    if (exact || path.startsWith("assets/")) return exact;
    return this.db.assets.where("[wikiId+path]").equals([wikiId, `assets/${path}`]).first();
  }

  // Paths never change once written, so object URLs live for the session. Misses aren't cached.
  objectUrl(wikiId: string, path: string): Promise<string | undefined> {
    const key = `${wikiId}\n${path}`;
    let url = this.urls.get(key);
    if (!url) {
      url = this.find(wikiId, path).then((asset) => {
        if (!asset) this.urls.delete(key);
        return asset && URL.createObjectURL(asset.blob);
      });
      this.urls.set(key, url);
    }
    return url;
  }
}
