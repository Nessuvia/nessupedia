import { computed, ref } from "vue";
import { useStoredRef } from "./useStoredRef";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<{ outcome: "accepted" | "dismissed" }>;
}

// The browser fires this once, often before any component mounts, so it's caught when the module loads.
const deferred = ref<BeforeInstallPromptEvent>();
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferred.value = event as BeforeInstallPromptEvent;
});
window.addEventListener("appinstalled", () => (deferred.value = undefined));

const standalone =
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

// Chromium browsers offer an Install button; iOS Safari has no prompt, so it gets the Share menu steps instead.
export function useInstallPrompt() {
  const dismissed = useStoredRef("oc-wiki:install-dismissed", false);
  const mode = computed(() => {
    if (standalone || dismissed.value) return undefined;
    if (deferred.value) return "button";
    return ios ? "ios" : undefined;
  });

  async function install() {
    const event = deferred.value;
    if (!event) return;
    deferred.value = undefined;
    if ((await event.prompt()).outcome === "dismissed") dismissed.value = true;
  }

  return { mode, install, dismiss: () => (dismissed.value = true) };
}
