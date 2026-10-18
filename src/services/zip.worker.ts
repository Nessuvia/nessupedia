/// <reference lib="webworker" />
import type { Unzipped } from "fflate";
import { syncZipper, transferables, type ZipEntries } from "./zipper";

export type ZipJob = { op: "zip"; entries: ZipEntries } | { op: "unzip"; data: Uint8Array };

export type ZipRequest = { id: number } & ZipJob;

export interface ZipResponse {
  id: number;
  result?: Uint8Array | Unzipped;
  error?: string;
}

self.onmessage = async ({ data: request }: MessageEvent<ZipRequest>) => {
  try {
    const result = request.op === "zip" ? await syncZipper.zip(request.entries) : await syncZipper.unzip(request.data);
    const buffers = transferables(result instanceof Uint8Array ? [result] : Object.values(result));
    self.postMessage({ id: request.id, result } satisfies ZipResponse, buffers);
  } catch (cause) {
    self.postMessage({ id: request.id, error: cause instanceof Error ? cause.message : String(cause) } satisfies ZipResponse);
  }
};
