import type { Continuity } from "@/db/types";
import { titleSegments } from "./subpages";
import { RELATIONSHIPS_TAB, titleKey } from "./wikilinks";

export function continuityNameError(name: string): string | undefined {
  if (!name.trim()) return "A continuity needs a name";
  if (/[[\]|#/]/.test(name)) return "Continuity names can't contain [ ] | # or /";
  if (titleKey(name) === titleKey(RELATIONSHIPS_TAB)) return `"${RELATIONSHIPS_TAB}" is kept for the generated tab`;
  return undefined;
}

export function findContinuity(continuities: readonly Continuity[], name: string): Continuity | undefined {
  return continuities.find((continuity) => titleKey(continuity.name) === titleKey(name));
}

export interface VersionTitle {
  main: string;
  continuity: Continuity;
}

// A title is a version when it's a top-level page's name followed by a continuity's: "Mira/Noir AU".
export function versionOf(title: string, continuities: readonly Continuity[]): VersionTitle | undefined {
  const segments = titleSegments(title);
  const continuity = segments.length === 2 ? findContinuity(continuities, segments[1]!) : undefined;
  return continuity && { main: segments[0]!, continuity };
}

// Continuity names under a page only work as the whole of a top-level page's version.
export function versionTitleError(title: string, continuities: readonly Continuity[]): string | undefined {
  const segments = titleSegments(title);
  const misplaced = segments.findIndex((segment, index) => index > 0 && !!findContinuity(continuities, segment) && (index !== 1 || segments.length !== 2));
  if (misplaced === -1) return undefined;
  return misplaced === 1
    ? `Versions can't have subpages; "${segments[1]}" is a continuity`
    : `Only top-level pages have versions; "${segments[misplaced]}" is a continuity`;
}
