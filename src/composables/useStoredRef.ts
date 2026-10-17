import { ref, watch, type Ref } from "vue";

function read<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : (JSON.parse(stored) as T);
  } catch {
    return fallback;
  }
}

export function useStoredRef<T>(key: string, fallback: T): Ref<T> {
  const value = ref(read(key, fallback)) as Ref<T>;
  watch(value, (next) => localStorage.setItem(key, JSON.stringify(next)), { deep: true });
  return value;
}
