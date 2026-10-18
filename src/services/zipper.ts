import { unzipSync, zipSync, type Unzipped, type ZipOptions } from "fflate";
import type { ZipJob, ZipRequest, ZipResponse } from "./zip.worker";

export type ZipEntries = Record<string, [Uint8Array, ZipOptions]>;

export interface Zipper {
  zip(entries: ZipEntries): Promise<Uint8Array<ArrayBuffer>>;
  unzip(data: Uint8Array): Promise<Unzipped>;
}

// fflate types its output loosely, but it always allocates plain ArrayBuffers, which Blob needs.
export const syncZipper: Zipper = {
  zip: async (entries) => zipSync(entries) as Uint8Array<ArrayBuffer>,
  unzip: async (data) => unzipSync(data),
};

// Buffers move to the other thread instead of being copied, so a large wiki isn't held twice.
export function transferables(arrays: Iterable<Uint8Array>): ArrayBuffer[] {
  return [...new Set([...arrays].map((array) => array.buffer as ArrayBuffer))];
}

let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<number, { resolve: (result: never) => void; reject: (error: Error) => void }>();

function zipWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./zip.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<ZipResponse>) => {
      const job = pending.get(data.id);
      pending.delete(data.id);
      if (data.error !== undefined) job?.reject(new Error(data.error));
      else job?.resolve(data.result as never);
    };
    // The files were handed to the worker, so jobs can't fall back to this thread and fail instead.
    worker.onerror = () => {
      for (const job of pending.values()) job.reject(new Error("The ZIP worker stopped; try again"));
      pending.clear();
      worker = undefined;
    };
  }
  return worker;
}

function run<T>(job: ZipJob, transfer: ArrayBuffer[]): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (result: never) => void, reject });
    zipWorker().postMessage({ id, ...job } satisfies ZipRequest, transfer);
  });
}

// Zipping a wiki's images can take seconds, so it runs off the main thread wherever workers exist.
export const workerZipper: Zipper =
  typeof Worker === "undefined"
    ? syncZipper
    : {
        zip: (entries) => run({ op: "zip", entries }, transferables(Object.values(entries).map(([data]) => data))),
        unzip: (data) => run({ op: "unzip", data }, transferables([data])),
      };
