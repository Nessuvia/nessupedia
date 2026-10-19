import { titleKey } from "@/markdown/wikilinks";

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length]!;
}

// 1 for the same key, falling toward 0 as more characters differ. A name containing the other scores at least 0.6.
export function similarity(a: string, b: string): number {
  const [left, right] = [titleKey(a), titleKey(b)];
  if (!left || !right) return 0;
  if (left === right) return 1;
  const ratio = 1 - editDistance(left, right) / Math.max(left.length, right.length);
  return left.includes(right) || right.includes(left) ? Math.max(ratio, 0.6) : ratio;
}

// The names most like the query, best first, leaving out poor matches.
export function closestNames(query: string, names: readonly string[], { limit = 3, threshold = 0.5 } = {}): string[] {
  const best = new Map<string, number>();
  for (const name of names) {
    const score = similarity(query, name);
    if (score >= threshold && score > (best.get(name) ?? 0)) best.set(name, score);
  }
  return [...best.entries()]
    .sort(([nameA, a], [nameB, b]) => b - a || nameA.localeCompare(nameB))
    .slice(0, limit)
    .map(([name]) => name);
}
