"use client";

import { ArrowDown, Send, Sparkles, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Badge } from "./badge.js";
import { Button } from "./button.js";
import { cn } from "./cn.js";
import { Input } from "./input.js";

// Mirrors @ip/shared's ChatCitation, intentionally kept separate: @ip/ui is a pure
// presentational layer and must not depend on @ip/shared. Structurally identical so an
// app can pass a @ip/shared chat client straight into ChatWindow.send.
export interface ChatCitation {
  url: string;
  topic: string;
}

interface Turn {
  id: number;
  role: "user" | "assistant";
  content: string;
  citations: ChatCitation[];
}

export interface ChatWindowProps {
  /**
   * Streams one assistant turn: calls onText/onCitation as SSE events arrive.
   * An optional `signal` is passed so the caller can cancel a stalled stream on
   * component unmount — preventing `busy`/`inFlight` from pinning indefinitely.
   */
  send: (
    messages: { role: string; content: string }[],
    handlers: {
      onText: (text: string) => void;
      onCitation: (citation: ChatCitation) => void;
    },
    signal?: AbortSignal,
  ) => Promise<void>;
  placeholder?: string;
  emptyHint?: string;
}

export function ChatWindow({
  send,
  placeholder = "Ask a question…",
  emptyHint,
}: ChatWindowProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  // Ref-latch (not state) so a StrictMode double-invoke or same-tick resubmit can't
  // fire a second in-flight request before React re-renders.
  const inFlight = useRef(false);
  const nextId = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // Controller aborted on unmount so a stalled stream can't pin inFlight indefinitely.
  const abortCtrl = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortCtrl.current?.abort();
    };
  }, []);

  // Auto-stick to the bottom as new content streams in — but only when the user
  // hasn't scrolled up to read earlier messages.
  useEffect(() => {
    if (atBottom) endRef.current?.scrollIntoView({ block: "end" });
  }, [turns, atBottom]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
  }

  async function submit() {
    const text = input.trim();
    if (!text || inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setInput("");
    setAtBottom(true);

    // Replace any previous controller so a retry after an error can abort cleanly.
    abortCtrl.current?.abort();
    const ctrl = new AbortController();
    abortCtrl.current = ctrl;

    const history: Turn[] = [
      ...turns,
      { id: nextId.current++, role: "user", content: text, citations: [] },
    ];
    // Reserve the assistant turn we stream into.
    setTurns([
      ...history,
      { id: nextId.current++, role: "assistant", content: "", citations: [] },
    ]);

    const patchAssistant = (fn: (a: Turn) => Turn) =>
      setTurns((cur) => {
        const last = cur[cur.length - 1];
        if (!last) return cur;
        const next = [...cur];
        next[next.length - 1] = fn(last);
        return next;
      });

    try {
      await send(
        history.map((t) => ({ role: t.role, content: t.content })),
        {
          onText: (t) => patchAssistant((a) => ({ ...a, content: a.content + t })),
          onCitation: (c) =>
            patchAssistant((a) => ({ ...a, citations: [...a.citations, c] })),
        },
        ctrl.signal,
      );
    } catch (e) {
      // Suppress abort errors — the user navigated away, not a real failure.
      if (e instanceof Error && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Chat failed");
      // Roll the failed exchange back (the user turn + the reserved assistant turn) and
      // restore the message so a transient failure doesn't lose the user's question.
      setTurns((cur) => cur.slice(0, -2));
      setInput(text);
    } finally {
      inFlight.current = false;
    }
  }

  const last = turns[turns.length - 1];
  const streaming =
    inFlight.current && last?.role === "assistant" && last.content === "";

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-3">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1"
      >
        {turns.length === 0 && emptyHint && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Sparkles className="size-5" aria-hidden />
            </span>
            <p className="max-w-xs text-sm text-muted-foreground">{emptyHint}</p>
          </div>
        )}
        {turns.map((t) => {
          const isUser = t.role === "user";
          const isStreamingTurn =
            !isUser && t.id === last?.id && streaming;
          return (
            <div
              key={t.id}
              className={cn(
                "flex max-w-[90%] gap-2.5",
                isUser ? "flex-row-reverse self-end" : "self-start",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                  isUser
                    ? "bg-primary text-primary-foreground"
                    : "bg-primary/15 text-primary",
                )}
                aria-hidden
              >
                {isUser ? (
                  <User className="size-4" />
                ) : (
                  <Sparkles className="size-4" />
                )}
              </span>
              <div className={cn("min-w-0", isUser && "flex flex-col items-end")}>
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  {isUser ? "You" : "Assistant"}
                </span>
                <div
                  className={cn(
                    "rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                    isUser
                      ? "rounded-tr-sm bg-primary text-primary-foreground"
                      : "rounded-tl-sm bg-surface-muted text-foreground",
                  )}
                >
                  {isStreamingTurn ? (
                    <span className="flex items-center gap-1 py-0.5" aria-label="Assistant is typing">
                      <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
                    </span>
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{t.content}</p>
                  )}
                </div>
                {t.citations.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {t.citations.map((c) => (
                      <Badge key={`${c.url}-${c.topic}`} tone="info" variant="outline">
                        {c.topic || c.url}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {!atBottom && turns.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setAtBottom(true);
            endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
          }}
          aria-label="Scroll to latest"
          className="absolute bottom-16 left-1/2 inline-flex size-8 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground shadow-md transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowDown className="size-4" aria-hidden />
        </button>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Input
          value={input}
          placeholder={placeholder}
          onChange={(e) => setInput(e.target.value)}
        />
        <Button
          type="submit"
          size="icon"
          disabled={!input.trim()}
          aria-label="Send message"
        >
          <Send className="size-4" aria-hidden />
        </Button>
      </form>
    </div>
  );
}

function Dot({ delay = "0ms" }: { delay?: string }) {
  return (
    <span
      className="inline-block size-1.5 animate-bounce rounded-full bg-muted-foreground"
      style={{ animationDelay: delay }}
    />
  );
}
