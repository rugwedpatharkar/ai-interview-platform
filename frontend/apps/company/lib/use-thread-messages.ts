"use client";

import { errorMessage } from "@ip/shared";
import { toast } from "@ip/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  USE_MOCK,
  createMessagesClient,
  makeMockMessagesClient,
} from "../app/messages/messages-client";
import type { MessageDTO, SenderSide } from "../app/messages/types";
import { useAuth } from "./auth";

export interface OptimisticMessage {
  id: string;
  senderRole: SenderSide;
  body: string;
  pending: true;
}

/** The shared receive/send/read data seam. Body is identical to the candidate app's — only the
 *  `side` defaults differ at the call site. Receive is a 5s poll (paused on a hidden tab); send is
 *  optimistic with rollback; mark-read fires on open / on new inbound, guarded against per-tick loops. */
export function useThreadMessages(applicationId: string, side: SenderSide) {
  const { api } = useAuth();
  const qc = useQueryClient();
  const client = useMemo(
    () => (USE_MOCK ? makeMockMessagesClient(applicationId, side) : createMessagesClient(api)),
    [api, applicationId, side],
  );

  const q = useQuery({
    ...client.subscribe(applicationId),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });

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
      await qc.invalidateQueries({ queryKey: client.threadQueryKey(applicationId) });
      await qc.invalidateQueries({ queryKey: client.listQueryKey() });
      setOptimistic((c) => c.filter((o) => o.id !== tmpId));
    } catch (e) {
      setOptimistic((c) => c.filter((o) => o.id !== tmpId)); // roll back
      toast.error(errorMessage(e)); // surface send-failed
      throw e; // caller restores the input text
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  const lastSeen = useRef(0);
  useEffect(() => {
    const n = q.data?.length ?? 0;
    const inbound = (q.data ?? []).some((m: MessageDTO) => m.senderRole !== side && !m.readAt);
    if (n !== lastSeen.current && inbound) {
      lastSeen.current = n;
      void client
        .markRead(applicationId)
        .then(() => qc.invalidateQueries({ queryKey: client.listQueryKey() }))
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
