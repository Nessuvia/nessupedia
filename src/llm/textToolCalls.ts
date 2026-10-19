import type { ToolCall } from "./LlmClient";

// Models without native tool calling, or servers that don't translate it, often write the call out as text instead.
// Recognized: <tool_call> tags, fenced or bare JSON with a name and arguments, and Python-style calls such as read_page(title="Mira").
export function parseTextToolCalls(text: string, toolNames: string[]): ToolCall[] {
  const known = new Set(toolNames);
  const calls: ToolCall[] = [];
  const add = (name: unknown, args: unknown) => {
    if (typeof name !== "string" || !known.has(name)) return;
    const argumentsText = typeof args === "string" ? args : JSON.stringify(args ?? {});
    calls.push({ id: `text_${calls.length}`, name, arguments: argumentsText });
  };

  for (const candidate of jsonCandidates(text)) {
    for (const value of [candidate].flat()) {
      const call = value as { name?: unknown; arguments?: unknown; parameters?: unknown; function?: { name?: unknown; arguments?: unknown } };
      if (call?.function) add(call.function.name, call.function.arguments);
      else add(call?.name, call?.arguments ?? call?.parameters);
    }
  }
  if (calls.length) return calls;

  const names = [...known].map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  if (!names) return calls;
  for (const match of text.matchAll(new RegExp(`\\b(${names})\\(([^()]*)\\)`, "g"))) {
    add(match[1], keywordArguments(match[2]!));
  }
  return calls;
}

function jsonCandidates(text: string): unknown[] {
  const sources = [
    ...[...text.matchAll(/<tool_call>([\s\S]*?)(?:<\/tool_call>|$)/g)].map((match) => match[1]!),
    ...[...text.matchAll(/```(?:json|tool_call|tool_code)?\s*\n([\s\S]*?)```/g)].map((match) => match[1]!),
  ];
  if (!sources.length && /^\s*[[{]/.test(text)) sources.push(text);
  return sources.flatMap((source) => {
    const value = parseJson(source);
    return value === undefined ? [] : [value];
  });
}

export function parseJson(source: string): unknown {
  return parseLooseJson(source)?.value;
}

// JSON as models write it, with trailing commas, single quotes, bare keys, or raw line breaks inside strings.
export function parseLooseJson(source: string): { value: unknown; repaired: boolean } | undefined {
  const trimmed = source.trim();
  try {
    return { value: JSON.parse(trimmed), repaired: false };
  } catch {
    try {
      return { value: JSON.parse(repairJson(trimmed)), repaired: true };
    } catch {
      return undefined;
    }
  }
}

const IDENTIFIER_START = /[A-Za-z_$]/;
const IDENTIFIER = /[\w$-]/;

function repairJson(text: string): string {
  let out = "";
  let at = 0;
  const nextVisible = (from: number) => {
    while (from < text.length && /\s/.test(text[from]!)) from++;
    return text[from];
  };
  const readString = (quote: string) => {
    let value = "";
    at++;
    while (at < text.length && text[at] !== quote) {
      const char = text[at]!;
      if (char === "\\" && at + 1 < text.length) {
        const escaped = text[at + 1]!;
        value += escaped === "'" ? "'" : char + escaped;
        at += 2;
        continue;
      }
      if (char === '"') value += '\\"';
      else if (char === "\n") value += "\\n";
      else if (char === "\r") value += "\\r";
      else if (char === "\t") value += "\\t";
      else value += char;
      at++;
    }
    at++;
    return `"${value}"`;
  };

  while (at < text.length) {
    const char = text[at]!;
    if (char === '"' || char === "'") {
      out += readString(char);
    } else if (char === "," && /[}\]]/.test(nextVisible(at + 1) ?? "")) {
      at++;
    } else if (IDENTIFIER_START.test(char) && /[{,]\s*$/.test(out)) {
      let end = at;
      while (end < text.length && IDENTIFIER.test(text[end]!)) end++;
      const word = text.slice(at, end);
      out += nextVisible(end) === ":" ? `"${word}"` : word;
      at = end;
    } else {
      out += char;
      at++;
    }
  }
  return out;
}

// Keyword arguments by name; positional ones under "0", "1", … for the tool to place.
function keywordArguments(source: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  let position = 0;
  for (const match of source.matchAll(/(?:(\w+)\s*=\s*)?(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|(-?\d+(?:\.\d+)?))/g)) {
    const value = match[4] !== undefined ? Number(match[4]) : (match[2] ?? match[3]!).replace(/\\(.)/g, "$1");
    args[match[1] ?? String(position++)] = value;
  }
  return args;
}
