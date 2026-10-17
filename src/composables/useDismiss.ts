import { onScopeDispose, watch, type Ref } from "vue";
import { useRoute } from "vue-router";

// Closes a popup on an outside click, Escape, or navigation.
export function useDismiss(open: Ref<boolean>, root: Readonly<Ref<HTMLElement | null | undefined>>): void {
  const route = useRoute();

  const onPointerDown = (event: PointerEvent) => {
    if (!root.value?.contains(event.target as Node)) open.value = false;
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") open.value = false;
  };
  const listen = (on: boolean) => {
    const method = on ? document.addEventListener.bind(document) : document.removeEventListener.bind(document);
    method("pointerdown", onPointerDown);
    method("keydown", onKeyDown);
  };

  watch(open, listen);
  watch(
    () => route.fullPath,
    () => (open.value = false),
  );
  onScopeDispose(() => listen(false));
}
