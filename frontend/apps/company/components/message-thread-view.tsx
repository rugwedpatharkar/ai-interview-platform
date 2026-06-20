"use client";

import { errorMessage } from "@ip/shared";
import { Button, EmptyState, ErrorState, Input, LoadingState, cn } from "@ip/ui";
import { Send, User, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useThreadMessages } from "../lib/use-thread-messages";
import { MAX_BODY, type SenderSide } from "../app/messages/types";

/** App-local chat re-skin fed by `useThreadMessages` — the company twin of the candidate view.
 *  Re-skins the @ip/ui ChatWindow surface (bubble layout/tokens, auto-stick scroll) driven by a
 *  poll-fetched history. For a recruiter, the other side is the candidate. */
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

  if (isLoading) return <LoadingState />;
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
          <EmptyState title="No messages yet" description="Start the conversation below." />
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
                {isSelf ? <User className="size-4" /> : <UserRound className="size-4" />}
              </span>
              <div className={cn("min-w-0", isSelf && "flex flex-col items-end")}>
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  {isSelf ? "You" : otherLabel}
                </span>
                <div
                  className={cn(
                    "rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                    isSelf
                      ? "rounded-tr-sm bg-primary text-primary-foreground"
                      : "rounded-tl-sm bg-surface-muted text-foreground",
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
