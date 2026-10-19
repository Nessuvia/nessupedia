import { ref } from "vue";

// The last error nothing else caught, shown in a toast so a failed save isn't silent.
export const appError = ref("");

export function reportError(cause: unknown): void {
  const error = cause as { name?: string; message?: string; inner?: { name?: string } } | null | undefined;
  if (error?.name === "AbortError") return;
  const quota = error?.name === "QuotaExceededError" || error?.inner?.name === "QuotaExceededError";
  appError.value = quota
    ? "This device is out of storage, so the last change wasn't saved. Free up space, or export a wiki and delete it here."
    : `Something went wrong: ${error?.message ?? String(cause)}`;
}
