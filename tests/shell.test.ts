import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";
import { useLiveQuery } from "@/composables/useLiveQuery";
import { db, WikiDatabase } from "@/db/database";
import { homeLocation } from "@/router";
import { changeLog, linkIndexer, pageService, wikiService } from "@/services";
import { MAIN_PAGE_TITLE, useWikiStore } from "@/stores/wiki";
import { relativeTime } from "@/utils/relativeTime";

beforeEach(async () => {
  await db.delete();
  await db.open();
  localStorage.clear();
  setActivePinia(createPinia());
});

describe("useLiveQuery", () => {
  it("follows writes and resets when its source changes", async () => {
    const local = new WikiDatabase(`test-${crypto.randomUUID()}`);
    await local.wikis.bulkAdd([
      { id: "a", name: "Ashfall", themeId: "fandom", voice: "fandom", createdAt: 0 },
      { id: "b", name: "Brightwater", themeId: "fandom", voice: "fandom", createdAt: 0 },
    ]);
    const selected = ref("a");
    const scope = effectScope();
    const wiki = scope.run(() => useLiveQuery((id) => local.wikis.get(id), selected))!;

    expect(wiki.value).toBeUndefined();
    await vi.waitFor(() => expect(wiki.value?.name).toBe("Ashfall"));

    await local.wikis.update("a", { name: "Ashfall Saga" });
    await vi.waitFor(() => expect(wiki.value?.name).toBe("Ashfall Saga"));

    selected.value = "b";
    await vi.waitFor(() => expect(wiki.value?.name).toBe("Brightwater"));
    scope.stop();
  });
});

describe("homeLocation", () => {
  it("sends a first-time user to wiki creation", async () => {
    expect(await homeLocation(null)).toEqual({ name: "new-wiki" });
  });

  it("opens the last wiki, or the first by name when the last is gone", async () => {
    const brightwater = await wikiService.create("Brightwater");
    const ashfall = await wikiService.create("Ashfall");

    expect(await homeLocation(brightwater.id)).toEqual({ name: "wiki", params: { wikiId: brightwater.id } });
    expect(await homeLocation("deleted")).toEqual({ name: "wiki", params: { wikiId: ashfall.id } });
  });
});

describe("wiki store", () => {
  it("creates a wiki with a Main Page that links to starter red links", async () => {
    const wiki = await useWikiStore().createWiki("Ashfall");

    const mainPage = await pageService.getByTitle(wiki.id, MAIN_PAGE_TITLE);
    expect(mainPage?.body).toContain("**Ashfall**");
    expect((await linkIndexer.redLinks(wiki.id)).map((link) => link.targetTitle)).toEqual(["Main Character", "Home Town"]);
  });

  it("remembers only wikis that exist", async () => {
    const store = useWikiStore();
    const wiki = await store.createWiki("Ashfall");

    store.currentWikiId = wiki.id;
    await vi.waitFor(() => expect(store.lastWikiId).toBe(wiki.id));

    store.currentWikiId = "missing";
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(store.lastWikiId).toBe(wiki.id);
  });
});

describe("ChangeLog.list", () => {
  it("limits after filtering out minor edits", async () => {
    const wiki = await wikiService.create("Ashfall");
    const page = await pageService.create({ wikiId: wiki.id, title: "Mira", body: "One" });
    await pageService.save(page.id, "Two", { summary: "Major" });
    await pageService.save(page.id, "Three", { minor: true });

    expect((await changeLog.list(wiki.id, { limit: 1 })).map((entry) => entry.summary)).toEqual(["Major"]);
  });
});

describe("relativeTime", () => {
  const now = Date.UTC(2026, 9, 17, 12);

  it("rounds to the largest fitting unit", () => {
    expect(relativeTime(now - 10_000, now)).toBe("just now");
    expect(relativeTime(now - 5 * 60_000, now)).toBe("5 minutes ago");
    expect(relativeTime(now - 26 * 3_600_000, now)).toBe("yesterday");
    expect(relativeTime(now - 3 * 7 * 86_400_000, now)).toBe("3 weeks ago");
  });
});
