import type { ImageEncoder } from "./AssetService";
import type { EncodeRequest, EncodeResponse } from "./imageEncoder.worker";

// Decoding and encoding large images runs in a worker so the editor stays responsive.
let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<number, (response: EncodeResponse) => void>();

function encoderWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./imageEncoder.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<EncodeResponse>) => {
      pending.get(data.id)?.(data);
      pending.delete(data.id);
    };
    // A worker that fails to start would leave requests hanging, so they fall back to storing images as given.
    worker.onerror = () => {
      for (const [id, resolve] of pending) resolve({ id });
      pending.clear();
      worker = undefined;
    };
  }
  return worker;
}

export const encodeImage: ImageEncoder = (image, maxEdge) => {
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return Promise.resolve(undefined);
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, ({ result }) => resolve(result));
    encoderWorker().postMessage({ id, image, maxEdge } satisfies EncodeRequest);
  });
};
