import { onBeforeUnmount, watchEffect, type Ref } from "vue";
import type { Wiki, WikiFont } from "@/db/types";
import { db } from "@/db/database";
import { DEFAULT_ACCENT, isHexColor, textOn } from "@/utils/color";

const FALLBACKS: Record<string, string> = {
  serif: 'Georgia, "Times New Roman", serif',
  monospace: "ui-monospace, Consolas, monospace",
};
const SYSTEM = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// Font files register once per session; the family is namespaced so it can't pick up an installed font.
const registered = new Map<string, Promise<void>>();
function register(wikiId: string, font: WikiFont): string {
  const family = `wiki-${font.id}`;
  for (const file of font.files) {
    const key = `${wikiId}\n${file.path}`;
    if (registered.has(key)) continue;
    const loading = db.assets
      .where("[wikiId+path]")
      .equals([wikiId, file.path])
      .first()
      .then(async (asset) => {
        if (!asset) return;
        const face = new FontFace(family, await asset.blob.arrayBuffer(), {
          weight: String(file.weight),
          style: file.style,
          ...(file.unicodeRange && { unicodeRange: file.unicodeRange }),
        });
        document.fonts.add(await face.load());
      })
      .catch((error) => console.error(error));
    registered.set(key, loading);
  }
  return `"${family}", ${FALLBACKS[font.category] ?? SYSTEM}`;
}

// Puts the wiki's accent and fonts on the root, so the theme's derived colors and dialogs outside the layout follow them.
export function useWikiAppearance(wiki: Readonly<Ref<Wiki | undefined>>): void {
  const root = document.documentElement.style;
  const set = (name: string, value: string | undefined) => (value ? root.setProperty(name, value) : root.removeProperty(name));

  watchEffect(() => {
    const appearance = wiki.value?.appearance;
    const accent = isHexColor(appearance?.accent) ? appearance.accent : DEFAULT_ACCENT;
    set("--accent", accent);
    set("--accent-text", textOn(accent));
    const { heading, body } = appearance?.fonts ?? {};
    set("--font-body", wiki.value && body ? register(wiki.value.id, body) : undefined);
    set("--font-heading", wiki.value && heading ? register(wiki.value.id, heading) : undefined);
  });

  onBeforeUnmount(() => ["--accent", "--accent-text", "--font-body", "--font-heading"].forEach((name) => root.removeProperty(name)));
}
