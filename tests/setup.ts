import "fake-indexeddb/auto";
import { Blob as NodeBlob } from "node:buffer";

// fake-indexeddb clones values with Node's structuredClone, which turns jsdom's Blob into a plain object. Node's own survives, as real IndexedDB keeps blobs.
globalThis.Blob = NodeBlob as unknown as typeof Blob;
