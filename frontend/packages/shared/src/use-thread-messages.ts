"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

/** The message shape the hook returns. The hook itself only reads `senderRole`/`readAt` (for the
 *  mark-read guard) but carries `body` through for the view that renders it. The app's `MessageDTO`
 *  satisfies this. */
export interface ThreadMessage {
  id: string;
  senderRole: string;
  body: string;
  readAt: string | null;
}

/** Minimal client surface the hook drives. The app's `MessagesClient` satisfies this. */
export interface ThreadMessagesClient {
  send(applicationId: string, body: string): Promise<unknown>;
  markRead(applicationId: string): Promise<unknown>;
  listQueryKey(): readonly unknown[];
  threadQueryKey(applicationId: string): readonly unknown[];
  subscribe(applicationId: string): {
    queryKey: readonly unknown[];
    queryFn: () => Promise<ThreadMessage[]>;
  };
}

export interface OptimisticMessage {
  id: string;
  senderRole: string;
  body: string;
  pending: true;
}

// Idle back-off ladder for the active poll (G5): start at 5s, then 15s, then 30s once the
// thread has been quiet for IDLE_STEP_AFTER consecutive ticks at each rung. Any new activity
// (message count change) resets to the fast cadence. Hidden-tab polling stays off.
const POLL_FAST = 5_000;
const POLL_STEPS = [POLL_FAST, 15_000, 30_000] as const;
const IDLE_STEP_AFTER = 4; // idle ticks at a rung before stepping to the next

/** The shared receive/send/read data seam. Both apps reuse identical logic — only the `side`
 *  and the resolved `client` differ at the call site. Receive is a back-off poll (5s→15s→30s on
 *  idle, paused on a hidden tab); send is optimistic with rollback; mark-read fires on open / on
 *  new inbound, guarded against per-poll-tick loops. */
export function useThreadMessages(
  applicationId: string,
  side: string,
  client: ThreadMessagesClient,
  // Surfaces a failed send (the app passes `toast.error(errorMessage(e))`). Kept as a callback
  // so @ip/shared stays decoupled from @ip/ui's toast layer. Fired before the re-throw, exactly
  // where the inlined toast used to be.
  onSendError?: (e: unknown) => void,
) {
  const qc = useQueryClient();

  // Back-off interval as state so a change re-arms react-query's poll. lastCount tracks the
  // previous tick's row count; idleTicks counts consecutive quiet ticks at the current rung.
  const [pollInterval, setPollInterval] = useState<number>(POLL_FAST);
  const lastCount = useRef(0);
  const idleTicks = useRef(0);

  const q = useQuery({
    ...client.subscribe(applicationId),
    refetchInterval: pollInterval,
    refetchIntervalInBackground: false,
  });

  // Drive the back-off ladder off the fetched row count: activity resets to fast; sustained
  // quiet steps the cadence down a rung at a time.
  useEffect(() => {
    const n = q.data?.length ?? 0;
    if (n !== lastCount.current) {
      lastCount.current = n;
      idleTicks.current = 0;
      setPollInterval(POLL_FAST); // activity → fast cadence (no-op if already fast)
      return;
    }
    idleTicks.current += 1;
    if (idleTicks.current >= IDLE_STEP_AFTER) {
      idleTicks.current = 0;
      setPollInterval((cur) => {
        const i = POLL_STEPS.indexOf(cur as (typeof POLL_STEPS)[number]);
        const next = POLL_STEPS[Math.min(i + 1, POLL_STEPS.length - 1)];
        return next ?? cur;
      });
    }
  }, [q.dataUpdatedAt, q.data]);

  const [optimistic, setOptimistic] = useState<OptimisticMessage[]>([]);
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false); // ref-latch — survives same-tick double-submit / StrictMode

  async function send(body: string) {
    const text = body.trim();
    if (!text || inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    const tmpId = `tmp-${Date.now()}`;
    setOptimistic((c) => [...c, { id: tmpId, senderRole: side, body: text, pending: true }]);
    try {
      await client.send(applicationId, text);
      await qc.invalidateQueries({ queryKey: client.threadQueryKey(applicationId) }); // real row
      await qc.invalidateQueries({ queryKey: client.listQueryKey() }); // inbox last/unread
      setOptimistic((c) => c.filter((o) => o.id !== tmpId));
    } catch (e) {
      setOptimistic((c) => c.filter((o) => o.id !== tmpId)); // roll back
      onSendError?.(e); // surface send-failed (app toasts)
      throw e; // caller restores the input text
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  // Mark-read on open / on new inbound — guarded so it doesn't loop on every poll tick.
  const lastSeen = useRef(0);
  useEffect(() => {
    const n = q.data?.length ?? 0;
    const inbound = (q.data ?? []).some((m) => m.senderRole !== side && !m.readAt);
    if (n !== lastSeen.current && inbound) {
      lastSeen.current = n;
      void client
        .markRead(applicationId)
        .then(() => qc.invalidateQueries({ queryKey: client.listQueryKey() })) // clears nav/inbox badge
        .catch(() => {}); // best-effort; never throw into render
    } else {
      lastSeen.current = n;
    }
  }, [applicationId, q.data, side, client, qc]);

  return {
    messages: q.data ?? [],
    optimistic,
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error,
    refetch: q.refetch,
    send,
    sending,
  };
}
