import { ref, watch, type Ref } from "vue";
import { assetService } from "@/services";

// An object URL for a wiki's asset, or undefined while it loads or when there's no path.
export function useAssetUrl(source: () => [wikiId: string | undefined, path: string | undefined]): Readonly<Ref<string | undefined>> {
  const url = ref<string>();
  watch(
    source,
    async ([wikiId, path], _previous, onCleanup) => {
      let current = true;
      onCleanup(() => (current = false));
      url.value = undefined;
      if (!wikiId || !path) return;
      const resolved = await assetService.objectUrl(wikiId, path);
      if (current) url.value = resolved;
    },
    { immediate: true },
  );
  return url;
}
