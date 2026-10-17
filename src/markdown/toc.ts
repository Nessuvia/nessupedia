import type { RenderedHeading } from "./pipeline";

export interface TocEntry extends RenderedHeading {
  level: number;
  number: string;
}

// Numbers headings 1, 1.1, 1.1.1 by relative depth, so skipped or out-of-order levels still number in sequence.
export function buildToc(headings: RenderedHeading[]): TocEntry[] {
  const stack: { depth: number; count: number }[] = [];

  return headings.map((heading) => {
    let closed: { depth: number; count: number } | undefined;
    while (stack.length > 0 && stack[stack.length - 1]!.depth > heading.depth) closed = stack.pop();

    const top = stack[stack.length - 1];
    if (top?.depth === heading.depth) top.count++;
    else stack.push({ depth: heading.depth, count: (closed?.count ?? 0) + 1 });

    return { ...heading, level: stack.length - 1, number: stack.map(({ count }) => count).join(".") };
  });
}
