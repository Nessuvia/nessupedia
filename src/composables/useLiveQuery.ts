import { liveQuery } from "dexie";
import { shallowRef, watch, type Ref, type WatchSource } from "vue";

// Re-runs the query whenever the source changes or the tables it read are written; undefined until the first result.
export function useLiveQuery<T, S = null>(
  query: (source: S) => T | Promise<T>,
  source: WatchSource<S> = () => null as S,
): Readonly<Ref<T | undefined>> {
  const result = shallowRef<T>();

  watch(
    source,
    (value, _previous, onCleanup) => {
      result.value = undefined;
      const subscription = liveQuery(() => query(value)).subscribe({
        next: (next) => (result.value = next),
        error: (error) => console.error(error),
      });
      onCleanup(() => subscription.unsubscribe());
    },
    { immediate: true },
  );

  return result;
}
