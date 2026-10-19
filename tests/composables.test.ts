import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, effectScope, h, nextTick, ref } from "vue";
import { createMemoryHistory, createRouter, RouterView } from "vue-router";
import { appError, reportError } from "@/composables/useAppError";
import { useDismiss } from "@/composables/useDismiss";
import { useLeaveGuard } from "@/composables/useLeaveGuard";
import { useStoredRef } from "@/composables/useStoredRef";
import { useTemplateNameCheck } from "@/composables/useTemplateNameCheck";
import { db } from "@/db/database";
import { templateService, wikiService } from "@/services";

beforeEach(() => {
  localStorage.clear();
  appError.value = "";
});

// Mounts a page at /a whose setup runs the composable, with /b to navigate to.
async function mountRoute(setup: () => void) {
  const Page = defineComponent({ setup: () => (setup(), () => h("div")) });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/a", component: Page },
      { path: "/b", component: { render: () => null } },
    ],
  });
  await router.push("/a");
  const root = document.createElement("div");
  document.body.append(root);
  const app = createApp({ render: () => h(RouterView) });
  app.use(router).mount(root);
  await router.isReady();
  await nextTick();
  return { router, unmount: () => (app.unmount(), root.remove()) };
}

describe("useStoredRef", () => {
  it("starts from the stored value, saves changes, and falls back on bad JSON", async () => {
    localStorage.setItem("kept", JSON.stringify({ open: true }));
    localStorage.setItem("broken", "{");
    const scope = effectScope();
    const [kept, broken] = scope.run(() => [useStoredRef("kept", { open: false }), useStoredRef("broken", 3)])!;

    expect(kept.value).toEqual({ open: true });
    expect(broken.value).toBe(3);
    kept.value.open = false;
    await nextTick();
    expect(localStorage.getItem("kept")).toBe('{"open":false}');
    scope.stop();
  });
});

describe("reportError", () => {
  it("names a full disk, wrapped by Dexie or not, and ignores aborts", () => {
    reportError(Object.assign(new Error("stopped"), { name: "AbortError" }));
    expect(appError.value).toBe("");

    reportError({ name: "OpenFailedError", inner: { name: "QuotaExceededError" } });
    expect(appError.value).toContain("out of storage");

    reportError(new Error("Page not found"));
    expect(appError.value).toBe("Something went wrong: Page not found");
  });
});

describe("useDismiss", () => {
  it("closes on an outside click, Escape, or navigation, but not a click inside", async () => {
    const open = ref(false);
    const inside = document.createElement("div");
    document.body.append(inside);
    const { router, unmount } = await mountRoute(() => useDismiss(open, ref(inside)));
    open.value = true;
    await nextTick();

    inside.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(open.value).toBe(true);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(open.value).toBe(false);

    open.value = true;
    await nextTick();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(open.value).toBe(false);

    open.value = true;
    await router.push("/a?tab=2");
    await nextTick();
    expect(open.value).toBe(false);
    unmount();
    inside.remove();
  });
});

describe("useLeaveGuard", () => {
  it("asks before leaving with unsaved changes, and stays when the answer is no", async () => {
    const dirty = ref(true);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { router, unmount } = await mountRoute(() => useLeaveGuard(dirty));

    await router.push("/b");
    expect(confirm).toHaveBeenCalledOnce();
    expect(router.currentRoute.value.path).toBe("/a");

    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

    dirty.value = false;
    await router.push("/b");
    expect(confirm).toHaveBeenCalledOnce();
    expect(router.currentRoute.value.path).toBe("/b");
    unmount();
    confirm.mockRestore();
  });
});

describe("useTemplateNameCheck", () => {
  it("refuses a taken name except for the template's own, and bad characters", async () => {
    await db.delete();
    await db.open();
    const wiki = await wikiService.create("Ashfall");
    const villain = await templateService.create(wiki.id, "Villain", "## Motive\n");
    const scope = effectScope();
    const { templates, check } = scope.run(() => useTemplateNameCheck(() => wiki.id))!;
    await vi.waitFor(() => expect(templates.value?.some(({ id }) => id === villain.id)).toBe(true));

    expect(check("villain")).toBe('A template named "Villain" already exists.');
    expect(check("Villain", villain)).toBeUndefined();
    expect(check("Hero/Rival")).toBe("Template names can't contain [ ] | # or /");
    expect(check("Hero")).toBeUndefined();
    scope.stop();
  });
});
