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
  const trimmed = source.trim();
  for (const attempt of [trimmed, trimmed.replace(/,\s*([}\]])/g, "$1")]) {
    try {
      return JSON.parse(attempt);
    } catch {
      // Try the next repair.
    }
  }
  return undefined;
}

function keywordArguments(source: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const match of source.matchAll(/(\w+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|(-?\d+(?:\.\d+)?))/g)) {
    args[match[1]!] = match[4] !== undefined ? Number(match[4]) : (match[2] ?? match[3]!).replace(/\\(.)/g, "$1");
  }
  return args;
}
