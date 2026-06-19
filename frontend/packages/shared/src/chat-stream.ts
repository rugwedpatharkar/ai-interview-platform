// Bridges the gRPC server-streaming ChatService.Chat into ChatWindow's onText/onCitation
// callback contract, so @ip/ui stays a pure presentational layer. Replaces the old SSE
// chat client. Token-delta `text` events stream in; `citation` events collect; `error`
// throws (ChatWindow rolls back + restores the message); `done` ends the stream.
import type { ApiClients } from "@ip/api-client";
import { Code, ConnectError } from "@connectrpc/connect";

export interface ChatCitation {
  url: string;
  topic: string;
}

export interface ChatStreamHandlers {
  onText: (text: string) => void;
  onCitation: (citation: ChatCitation) => void;
}

/**
 * Stream one assistant turn over gRPC. Auth fails BEFORE any token is emitted (the servicer
 * checks identity first), so an expired access token surfaces as Unauthenticated with no
 * partial output — the unary refresh interceptor can't see a streaming trailer error, so we
 * prime a refresh with a cheap unary call and retry the stream exactly once. Cancellation
 * (unmount) is normalized to an AbortError so ChatWindow suppresses it like the old fetch.
 */
export async function streamAssistantChat(
  api: ApiClients,
  messages: { role: string; content: string }[],
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const run = async () => {
    for await (const ev of api.chat.chat({ messages }, { signal })) {
      switch (ev.event.case) {
        case "text":
          handlers.onText(ev.event.value);
          break;
        case "citation":
          handlers.onCitation({
            url: ev.event.value.url,
            topic: ev.event.value.topic,
          });
          break;
        case "error":
          throw new Error(ev.event.value || "Chat failed");
        // "done" / undefined: the stream simply ends.
      }
    }
  };

  try {
    try {
      await run();
    } catch (err) {
      if (err instanceof ConnectError && err.code === Code.Unauthenticated) {
        await api.auth.me({}).catch(() => {});
        await run();
        return;
      }
      throw err;
    }
  } catch (err) {
    if (signal?.aborted || (err instanceof ConnectError && err.code === Code.Canceled)) {
      const aborted = new Error("aborted");
      aborted.name = "AbortError";
      throw aborted;
    }
    throw err;
  }
}
