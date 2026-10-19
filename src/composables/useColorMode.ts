import { computed, ref, watchEffect } from "vue";
import { useStoredRef } from "./useStoredRef";

// Light or dark follows the system until the toggle stores a choice for this device. The state is
// shared, and the root's data-mode is set as soon as this module loads.
const query = window.matchMedia?.("(prefers-color-scheme: dark)");
const systemDark = ref(query?.matches ?? false);
query?.addEventListener("change", (event) => (systemDark.value = event.matches));

const chosen = useStoredRef<"light" | "dark" | null>("oc-wiki:color-mode", null);
const mode = computed(() => chosen.value ?? (systemDark.value ? "dark" : "light"));
watchEffect(() => (document.documentElement.dataset.mode = mode.value));

export function useColorMode() {
  return { mode, toggle: () => (chosen.value = mode.value === "dark" ? "light" : "dark") };
}
