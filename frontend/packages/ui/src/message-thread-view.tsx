"use client";

import { Button } from "./button.js";
import { cn } from "./cn.js";
import { Input } from "./input.js";
import { EmptyState, ErrorState } from "./layout.js";
import { Skeleton } from "./skeleton.js";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SendIcon, UserIcon } from "./internal-icons.js";

function MessageSquareIcon(props: React.SVGAttributes<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

/** A rendered chat row — real or optimistic. The app's `MessageDTO`/optimistic message satisfy this. */
export interface ThreadMessage {
  id: string;
  senderRole: string;
  body: string;
  readAt?: string | null;
}
export interface ThreadOptimisticMessage {
  id: string;
  senderRole: string;
  body: string;
  pending: true;
}

export interface MessageThreadViewProps {
  /** The viewer's own side — a row is "self" when its senderRole matches. */
  side: string;
  /** Hook result (from `@ip/shared`'s `useThreadMessages`), wired by the app connector. */
  messages: ThreadMessage[];
  optimistic: ThreadOptimisticMessage[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
  send: (body: string) => Promise<void>;
  sending: boolean;
  /** Max body length — mirrors the server cap. */
  maxBody: number;
  /** Message shown for the error state (app maps its `error` via `errorMessage`). */
  errorMessage: string;
  /** Label for the other party ("Hiring team" / "Candidate"). */
  otherLabel: string;
  /** Icon for the other party's avatar (Building2 / UserRound). */
  peerIcon: LucideIcon;
  /** Empty-state body copy (differs per role). */
  emptyDescription: string;
  /** Extra classes on every bubble (company adds `shadow-sm`). */
  bubbleClassName?: string;
  /** Peer bubble classes (candidate adds a border; company doesn't). */
  peerBubbleClassName?: string;
}

/** Poll-fed chat re-skin of `@ip/ui`'s ChatWindow surface (bubble layout/tokens, auto-stick
 *  scroll). Driven by a poll-fetched history rather than a stream, so it does NOT render the
 *  closed `ChatWindow` node. Per-app copy/icon/bubble deltas come in as props. */
export function MessageThreadView({
  side,
  messages,
  optimistic,
  isLoading,
  isError,
  error: _error,
  refetch,
  send,
  sending,
  maxBody,
  errorMessage,
  otherLabel,
  peerIcon: PeerIcon,
  emptyDescription,
  bubbleClassName,
  peerBubbleClassName = "rounded-tl-sm bg-surface-muted text-foreground",
}: MessageThreadViewProps) {
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
  if (isError) return <ErrorState message={errorMessage} retry={() => refetch()} />;

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
            icon={MessageSquareIcon}
            title="No messages yet"
            description={emptyDescription}
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
                {isSelf ? <UserIcon className="size-4" /> : <PeerIcon className="size-4" />}
              </span>
              <div className={cn("min-w-0", isSelf && "flex flex-col items-end")}>
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  {isSelf ? "You" : otherLabel}
                </span>
                <div
                  className={cn(
                    "rounded-2xl px-3.5 py-2 text-sm",
                    bubbleClassName,
                    isSelf
                      ? "rounded-tr-sm bg-primary text-primary-foreground"
                      : peerBubbleClassName,
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
          maxLength={maxBody} // client guard mirrors the server cap
          placeholder="Write a message…"
          onChange={(e) => setInput(e.target.value)}
        />
        <Button
          type="submit"
          size="icon"
          disabled={!input.trim() || sending}
          aria-label="Send message"
        >
          <SendIcon className="size-4" aria-hidden />
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
