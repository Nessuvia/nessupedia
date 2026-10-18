const COMMENT = /^<!--([\s\S]*?)-->\s*$/;

// The text of an HTML comment that stands as its own block, which templates use as a writing hint.
export function hintText(html: string): string | undefined {
  const text = COMMENT.exec(html)?.[1]?.trim();
  return text || undefined;
}
