/// <reference lib="webworker" />
import type { EncodedImage } from "./AssetService";

export interface EncodeRequest {
  id: number;
  image: Blob;
  maxEdge: number;
}

export interface EncodeResponse {
  id: number;
  result?: EncodedImage;
}

const WEBP_QUALITY = 0.85;

async function encode(image: Blob, maxEdge: number): Promise<EncodedImage | undefined> {
  const bitmap = await createImageBitmap(image);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) return undefined;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: "image/webp", quality: WEBP_QUALITY });
  // Browsers without a WebP encoder fall back to PNG, which is only worth it when the image shrank.
  if (blob.type !== "image/webp" && scale === 1) return undefined;
  return { blob, width, height, scaled: scale < 1 };
}

self.onmessage = async ({ data: { id, image, maxEdge } }: MessageEvent<EncodeRequest>) => {
  let result: EncodedImage | undefined;
  try {
    result = await encode(image, maxEdge);
  } catch {
    result = undefined;
  }
  self.postMessage({ id, result } satisfies EncodeResponse);
};
