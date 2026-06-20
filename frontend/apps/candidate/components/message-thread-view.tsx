"use client";

import { errorMessage } from "@ip/shared";
import { Button, EmptyState, ErrorState, Input, Skeleton, cn } from "@ip/ui";
import { Building2, MessageSquare, Send, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useThreadMessages } from "../lib/use-thread-messages";
import { MAX_BODY, type SenderSide } from "../app/messages/types";

/** App-local chat re-skin fed by `useThreadMessages`. Faithfully re-skins `@ip/ui`'s ChatWindow
 *  surface (bubble layout/tokens, auto-stick scroll) but is driven by a poll-fetched history
 *  rather than a stream — so it does NOT render the closed `ChatWindow` node. */
export function MessageThreadView({
  applicationId,
  side,
}: {
  applicationId: string;
  side: SenderSide;
}) {
  const { messages, optimistic, isLoading, isError, error, refetch, send, sending } =
    useThreadMessages(applicationId, side);
  const [input, setInput] = useState("");
  const [atBottom, setAtBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const rows = [...messages, ...optimistic]; // optimistic appended after real
  useEffect(() => {
    if (atBottom) endRef.current?.scrollIntoView({ block: "end" });
  }, [rows.length, atBottom]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
  }

  const otherLabel = side === "candidate" ? "Hiring team" : "Candidate";

  async function submit() {
    const text = input.trim();
    if (!text || sending) return;
    setInput(""); // optimistic clear
    setAtBottom(true);
    try {
      await send(text);
    } catch {
      setInput(text); // hook toasts; restore the lost text
    }
  }

  if (isLoading) return <ThreadSkeleton />;
  if (isError) return <ErrorState message={errorMessage(error)} retry={() => refetch()} />;

  return (
    <div className="flex h-[28rem] min-h-0 flex-col gap-3">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1"
      >
        {rows.length === 0 && (
          <EmptyState
            icon={MessageSquare}
            title="No messages yet"
            description="Start the conversation below — the hiring team will see your reply."
          />
        )}
        {rows.map((m) => {
          const isSelf = m.senderRole === side;
          const pending = "pending" in m && m.pending;
          return (
            <div
              key={m.id}
              className={cn(
                "flex max-w-[90%] gap-2.5",
                isSelf ? "flex-row-reverse self-end" : "self-start",
                pending && "opacity-60",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                  isSelf
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface-muted text-muted-foreground",
                )}
                aria-hidden
              >
                {isSelf ? <User className="size-4" /> : <Building2 className="size-4" />}
              </span>
              <div className={cn("min-w-0", isSelf && "flex flex-col items-end")}>
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  {isSelf ? "You" : otherLabel}
                </span>
                <div
                  className={cn(
                    "rounded-2xl px-3.5 py-2 text-sm",
                    isSelf
                      ? "rounded-tr-sm bg-primary text-primary-foreground"
                      : "rounded-tl-sm border border-border bg-surface-muted text-foreground",
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Input
          value={input}
          maxLength={MAX_BODY} // client guard mirrors the server cap
          placeholder="Write a message…"
          onChange={(e) => setInput(e.target.value)}
        />
        <Button
          type="submit"
          size="icon"
          disabled={!input.trim() || sending}
          aria-label="Send message"
        >
          <Send className="size-4" aria-hidden />
        </Button>
      </form>
    </div>
  );
}

/** Bubble-shaped placeholders mirroring the chat layout while history loads. */
function ThreadSkeleton() {
  return (
    <div
      className="flex h-[28rem] flex-col gap-4 p-1"
      aria-busy="true"
      aria-label="Loading conversation"
    >
      {[false, true, false, true].map((self, i) => (
        <div key={i} className={cn("flex gap-2.5", self ? "flex-row-reverse self-end" : "self-start")}>
          <Skeleton className="size-7 shrink-0 rounded-full" />
          <Skeleton className={cn("h-12 rounded-2xl", self ? "w-44" : "w-56")} />
        </div>
      ))}
    </div>
  );
}
