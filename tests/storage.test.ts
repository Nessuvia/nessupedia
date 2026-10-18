import { describe, expect, it, vi } from "vitest";
import { StorageService } from "@/services/StorageService";

function fakeStorage({ persisted = false, grants = true } = {}) {
  let kept = persisted;
  return {
    persisted: vi.fn(async () => kept),
    persist: vi.fn(async () => (kept = kept || grants)),
  } as unknown as StorageManager & { persisted: ReturnType<typeof vi.fn>; persist: ReturnType<typeof vi.fn> };
}

describe("StorageService", () => {
  it("reports unsupported browsers as not persisted and never asks", async () => {
    const storage = new StorageService(undefined);
    expect(storage.supported).toBe(false);
    expect(await storage.persisted()).toBe(false);
    expect(await storage.request()).toBe(false);
    await storage.requestOnce();
  });

  it("asks once per session, however many saves follow", async () => {
    const manager = fakeStorage({ grants: false });
    const storage = new StorageService(manager);
    await storage.requestOnce();
    await storage.requestOnce();
    expect(manager.persist).toHaveBeenCalledTimes(1);
    expect(await storage.persisted()).toBe(false);
  });

  it("skips asking when storage is already persisted", async () => {
    const manager = fakeStorage({ persisted: true });
    await new StorageService(manager).requestOnce();
    expect(manager.persist).not.toHaveBeenCalled();
  });

  it("asks again on request, as the settings button does", async () => {
    const manager = fakeStorage();
    const storage = new StorageService(manager);
    expect(await storage.request()).toBe(true);
    expect(await storage.persisted()).toBe(true);
  });
});
