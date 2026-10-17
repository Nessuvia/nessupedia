import type { CanonTier } from "@/db/types";

export const CANON_TIERS: CanonTier[] = ["maybe", "soft", "hard"];

export const TIER_LABELS: Record<CanonTier, string> = { hard: "Canon", soft: "Likely", maybe: "Idea" };

const TIER_NAMES: Record<string, CanonTier> = {
  hard: "hard",
  canon: "hard",
  soft: "soft",
  likely: "soft",
  maybe: "maybe",
  idea: "maybe",
};

export function canonTier(value: unknown): CanonTier {
  return (typeof value === "string" && TIER_NAMES[value.trim().toLowerCase()]) || "hard";
}

export function shiftTier(tier: CanonTier, step: 1 | -1): CanonTier | undefined {
  return CANON_TIERS[CANON_TIERS.indexOf(tier) + step];
}

const TIER_ATTRIBUTE = /(\btier\s*=\s*)("[^"]*"|'[^']*'|[^\s}]+)/;

function withTier(attributes: string | undefined, tier: CanonTier): string {
  if (!attributes) return `{tier=${tier}}`;
  if (TIER_ATTRIBUTE.test(attributes)) return attributes.replace(TIER_ATTRIBUTE, `$1${tier}`);
  return attributes.replace(/\}$/, attributes.length > 2 ? ` tier=${tier}}` : `tier=${tier}}`);
}

// Rewrites only the tier attribute of a `:::canon` block or `:canon[…]` mark, given its exact source.
export function setCanonTier(source: string, tier: CanonTier): string {
  if (source.startsWith(":::")) {
    const lineEnd = source.search(/\r?\n|$/);
    const fence = /^(:{3,}\s*canon(?:\[[^\]\n]*\])?)(\{[^}\n]*\})?(.*)$/.exec(source.slice(0, lineEnd));
    if (!fence) return source;
    return `${fence[1]}${withTier(fence[2], tier)}${fence[3]}${source.slice(lineEnd)}`;
  }
  const mark = /^(:canon\[[\s\S]*\])(\{[^}]*\})?$/.exec(source);
  return mark ? `${mark[1]}${withTier(mark[2], tier)}` : source;
}
