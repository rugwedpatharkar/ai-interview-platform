// Recruiting-assistant chat lives on ai-agents' REST API as a Server-Sent Events stream
// (NOT gRPC-web — the in-house translator is unary-only). Bearer token via authedFetch, so a
// token expiry on the opening request refreshes + retries instead of dropping the user. (A
// 401 only arrives as the initial non-streamed response; mid-stream `error` frames still
// throw.) Privacy is enforced server-side; the UI just renders the scoped text + citations.
import { authedFetch, restAuthFor } from "./authed-fetch.js";
import { HttpError } from "./errors.js";
import type { TokenStore } from "./tokens.js";

export interface ChatCitation {
  url: string;
  topic: string;
}

export interface ChatMessage {
  role: string;
  content: string;
}

export interface ChatHandlers {
  onText: (text: string) => void;
  onCitation: (citation: ChatCitation) => void;
}

function handleFrame(frame: string, handlers: ChatHandlers): void {
  const event = /^event: (.*)$/m.exec(frame)?.[1];
  const data = /^data: (.*)$/m.exec(frame)?.[1];
  if (!event || data === undefined) return;
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(data) as Record<string, unknown>;
  } catch {
    // A frame with a non-JSON data line means a corrupted/truncated stream — surface a clean
    // error so ChatWindow rolls back rather than letting a raw SyntaxError bubble.
    throw new Error("Chat stream sent malformed data.");
  }
  if (event === "text") handlers.onText(String(payload.text ?? ""));
  else if (event === "citation")
    handlers.onCitation({
      url: String(payload.url ?? ""),
      topic: String(payload.topic ?? ""),
    });
  else if (event === "error")
    // A mid-stream failure — throw so ChatWindow rolls back + restores the message.
    throw new Error(String(payload.detail ?? "Chat failed"));
  // "done" needs no handling — the stream simply ends.
}

export function createChatClient(baseUrl: string, store: TokenStore) {
  const auth = restAuthFor(store);
  async function send(
    messages: ChatMessage[],
    handlers: ChatHandlers,
    signal?: AbortSignal,
  ): Promise<void> {
    const res = await authedFetch(
      `${baseUrl}/chat/turn`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages }),
      },
      auth,
      signal,
    );
    if (!res.ok || !res.body) {
      const body = (await res.json().catch(() => null)) as { detail?: string } | null;
      const message = body?.detail ?? `Chat failed (${res.status})`;
      // !res.ok carries a real HTTP status to classify; an ok-but-bodyless response (rare,
      // e.g. a proxy stripping the stream) has no status to act on, so stays a plain Error.
      throw res.ok ? new Error(message) : new HttpError(res.status, message, body?.detail);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    // try/finally so a throw from handleFrame (mid-stream `error` frame or malformed data)
    // still releases the connection — without cancel() the lock leaks until GC.
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE frames are blank-line separated; process each whole frame as it arrives.
        let sep = buffer.indexOf("\n\n");
        while (sep !== -1) {
          handleFrame(buffer.slice(0, sep), handlers);
          buffer = buffer.slice(sep + 2);
          sep = buffer.indexOf("\n\n");
        }
      }
      // Flush a trailing frame with no terminating blank line. The backend always ends
      // with \n\n, but a proxy could strip it — don't silently drop the last event.
      buffer += decoder.decode();
      if (buffer.trim()) handleFrame(buffer, handlers);
    } finally {
      // No-op once the stream drained naturally; cancels a still-open body on early throw.
      await reader.cancel().catch(() => {});
    }
  }

  return { send };
}
