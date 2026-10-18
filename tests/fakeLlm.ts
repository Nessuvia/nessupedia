// A fake OpenAI-compatible server for tests: routes map "METHOD /path" to handlers that get the parsed request.
export interface FakeRequest {
  method: string;
  path: string;
  body: Record<string, unknown> | undefined;
  headers: Record<string, string>;
  signal?: AbortSignal;
}

export type FakeHandler = (request: FakeRequest) => Response | Promise<Response>;

export function fakeFetch(origin: string, routes: Record<string, FakeHandler>) {
  const requests: FakeRequest[] = [];
  const fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input));
    if (url.origin !== origin) throw new TypeError("Failed to fetch");
    const method = init.method ?? "GET";
    const request: FakeRequest = {
      method,
      path: url.pathname,
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
      headers: (init.headers ?? {}) as Record<string, string>,
      ...(init.signal && { signal: init.signal }),
    };
    requests.push(request);
    const handler = routes[`${method} ${url.pathname}`];
    if (!handler) return json({ error: { message: "Not found" } }, 404);
    if (init.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return handler(request);
  };
  return { fetch: fetch as typeof globalThis.fetch, requests };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Streams each event as a `data:` line; `hang` leaves the stream open, as a stalled server would.
export function sse(events: unknown[], { hang = false, signal }: { hang?: boolean; signal?: AbortSignal } = {}): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      if (hang) {
        signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")));
        return;
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
}

export const textDelta = (content: string) => ({ choices: [{ index: 0, delta: { content } }] });

export function toolDelta(index: number, piece: { id?: string; name?: string; arguments?: string }) {
  return {
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [{ index, ...(piece.id && { id: piece.id }), function: { name: piece.name, arguments: piece.arguments } }],
        },
      },
    ],
  };
}

export const finish = (reason: string) => ({ choices: [{ index: 0, delta: {}, finish_reason: reason }] });
