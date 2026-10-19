import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";
import { useLiveQuery } from "@/composables/useLiveQuery";
import { db, WikiDatabase } from "@/db/database";
import { createAppRouter, homeLocation } from "@/router";
import { changeLog, linkIndexer, pageService, wikiService } from "@/services";
import { MAIN_PAGE_TITLE, useWikiStore } from "@/stores/wiki";
import { highlightParts } from "@/utils/highlight";
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
      { id: "a", name: "Ashfall", slug: "ashfall", themeId: "fandom", voice: "fandom", createdAt: 0 },
      { id: "b", name: "Brightwater", slug: "brightwater", themeId: "fandom", voice: "fandom", createdAt: 0 },
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

    expect(await homeLocation(brightwater.id)).toEqual({ name: "wiki", params: { wiki: brightwater.slug } });
    expect(await homeLocation("deleted")).toEqual({ name: "wiki", params: { wiki: ashfall.slug } });
  });
});

describe("wiki URLs", () => {
  it("sends an ID link to the wiki's slug and keeps the slug for links inside the wiki", async () => {
    const wiki = await wikiService.create("Ashfall Saga");
    const router = createAppRouter(createPinia());

    await router.push(`/w/${wiki.id}/special/all-pages?sort=new`);
    expect(router.currentRoute.value.fullPath).toBe("/w/ashfall-saga/special/all-pages?sort=new");

    await router.push({ name: "categories" });
    expect(router.currentRoute.value.path).toBe("/w/ashfall-saga/special/categories");
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

describe("highlightParts", () => {
  const marked = (text: string, query: string) =>
    highlightParts(text, query)
      .map((part) => (part.match ? `[${part.text}]` : part.text))
      .join("");

  it("marks every term case-insensitively, longest first", () => {
    expect(marked("The Archivist keeps the archive", "ARCH archive the")).toBe("[The] [Arch]ivist keeps [the] [archive]");
  });

  it("treats regex characters literally and leaves text alone for blank queries", () => {
    expect(marked("Costs $5 (maybe)", "$5 (maybe)")).toBe("Costs [$5] [(maybe)]");
    expect(marked("Mira", "  ")).toBe("Mira");
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
