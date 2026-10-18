import { onBeforeUnmount, type Ref } from "vue";
import { onBeforeRouteLeave, onBeforeRouteUpdate } from "vue-router";

// Asks before leaving the route with unsaved changes, and has the browser warn before closing the tab.
export function useLeaveGuard(dirty: Readonly<Ref<boolean>>): void {
  const confirmDiscard = () => !dirty.value || window.confirm("Discard your unsaved changes?");
  onBeforeRouteLeave(confirmDiscard);
  onBeforeRouteUpdate(confirmDiscard);

  const warnBeforeUnload = (event: BeforeUnloadEvent) => {
    if (dirty.value) event.preventDefault();
  };
  window.addEventListener("beforeunload", warnBeforeUnload);
  onBeforeUnmount(() => window.removeEventListener("beforeunload", warnBeforeUnload));
}
