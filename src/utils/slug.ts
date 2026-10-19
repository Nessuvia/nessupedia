// A wiki's name as a URL segment: lowercase letters and digits in any script, joined by hyphens.
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

// The slug, or the slug numbered "-2" and up, whichever isn't taken yet; claims it.
export function freeSlug(slug: string, taken: Set<string>): string {
  const base = slug || "wiki";
  let candidate = base;
  for (let n = 2; taken.has(candidate); n++) candidate = `${base}-${n}`;
  taken.add(candidate);
  return candidate;
}
