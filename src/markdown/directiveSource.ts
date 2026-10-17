// Splits a container directive's source into its opening fence, body, and closing fence, so form
// editors can rewrite the body and keep whatever the fences carry.
export interface DirectiveParts {
  open: string;
  inner: string;
  close: string;
}

export function splitDirective(source: string, name: string): DirectiveParts {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const first = lines[0] ?? "";
  if (!new RegExp(`^:{3,}\\s*${name}\\b`).test(first)) return { open: `:::${name}`, inner: source, close: ":::" };
  const last = lines.length > 1 && /^\s*:{3,}\s*$/.test(lines[lines.length - 1]!) ? lines.pop()! : ":::";
  return { open: first, inner: lines.slice(1).join("\n"), close: last };
}

export function joinDirective({ open, inner, close }: DirectiveParts): string {
  return inner.trim() ? `${open}\n${inner.replace(/\s+$/, "")}\n${close}` : `${open}\n${close}`;
}
