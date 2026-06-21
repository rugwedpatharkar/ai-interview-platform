// Messaging transport. Real gRPC client wraps `api.messaging.*`; an in-memory mock keeps the
// screens runnable when NEXT_PUBLIC_MOCK=1. Query-key helpers + the poll `subscribe()` seam are
// owned here so the view and cache invalidation never drift.
//
// Wired 2026-06-21 — `api.messaging.*` is live (admin transport via createGrpcWebTransport).
// Field names are camelCase off the wire (protobuf-es). The DTO shapes diverge from proto only
// in two places: `senderRole` widens from string → `SenderSide` (server emits "candidate" |
// "recruiter") and `readAt: ""` → `null` (the `mapMessage` normalizer below).

import type { useAuth } from "../../lib/auth";
import type {
  MessageDTO as ProtoMessage,
  ThreadDTO as ProtoThread,
} from "@ip/api-client";
import type { MessageDTO, MessagesClient, SenderSide, ThreadDTO } from "./types";

export const USE_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";

const nz = (s: string | null | undefined): string | null => (s && s.length ? s : null);

// proto sends "" for absent read_at; normalize so the UI tests `readAt === null` for unread.
export function mapMessage(m: ProtoMessage | MessageDTO): MessageDTO {
  return {
    id: m.id,
    applicationId: m.applicationId,
    senderRole: m.senderRole as SenderSide,
    senderUserId: m.senderUserId,
    body: m.body,
    createdAt: m.createdAt,
    readAt: nz(m.readAt),
  };
}
function mapThread(t: ProtoThread | ThreadDTO): ThreadDTO {
  return {
    applicationId: t.applicationId,
    candidateUserId: t.candidateUserId,
    recruiterUserId: t.recruiterUserId,
    jobTitle: t.jobTitle,
    companyName: t.companyName,
    lastMessageAt: t.lastMessageAt,
    lastSnippet: t.lastSnippet,
    unread: t.unread,
  };
}

export const listQueryKey = () => ["messages", "threads"] as const;
export const threadQueryKey = (applicationId: string) =>
  ["messages", "thread", applicationId] as const;

type Api = ReturnType<typeof useAuth>["api"];

/** Real gRPC client over `api.messaging.*`. The MessagesClient seam is what consumers depend on;
 *  this adapter just owns the proto ↔ DTO mapping (normalize empty strings, narrow senderRole). */
export function createMessagesClient(api: Api): MessagesClient {
  const m = api.messaging;
  const client: MessagesClient = {
    async send(applicationId, body) {
      // The server is the authority on the cap + identity; we send the trimmed body.
      return mapMessage(await m.sendMessage({ applicationId, body: body.trim() }));
    },
    async listThreads() {
      return (await m.listThreads({})).threads.map(mapThread);
    },
    async listMessages(applicationId) {
      return (await m.listMessages({ applicationId })).messages.map(mapMessage);
    },
    async markRead(applicationId) {
      const r = await m.markRead({ applicationId });
      return { applicationId: r.applicationId, unread: r.unread };
    },
    listQueryKey,
    threadQueryKey,
    // v1 = short-poll; swapping to SSE replaces ONLY this body. The write path, query keys, and
    // MessageThreadView stay untouched.
    subscribe(applicationId) {
      return {
        queryKey: threadQueryKey(applicationId),
        queryFn: () => client.listMessages(applicationId),
      };
    },
  };
  return client;
}

/** In-memory mock so the screens build + demo before `pnpm gen`. One seeded inbound message. */
export function makeMockMessagesClient(applicationId: string, side: SenderSide): MessagesClient {
  const now = () => new Date().toISOString();
  const other: SenderSide = side === "candidate" ? "recruiter" : "candidate";
  let seq = 2;
  const msgs: MessageDTO[] = [
    {
      id: "m1",
      applicationId,
      senderRole: other,
      senderUserId: "u-other",
      body: "Thanks for applying — a couple of quick questions before we schedule.",
      createdAt: now(),
      readAt: now(),
    },
  ];
  const threads: ThreadDTO[] = [
    {
      applicationId,
      candidateUserId: "u-cand",
      recruiterUserId: "u-rec",
      jobTitle: "Senior Frontend Engineer",
      companyName: "Northwind",
      lastMessageAt: now(),
      lastSnippet: "Thanks for applying — a couple of quick questions before we schedule.",
      unread: side === "candidate" ? 1 : 0,
    },
  ];
  const client: MessagesClient = {
    async send(appId, body) {
      const m: MessageDTO = {
        id: `m${seq++}`,
        applicationId: appId,
        senderRole: side,
        senderUserId: "self",
        body: body.trim(),
        createdAt: now(),
        readAt: null,
      };
      msgs.push(m);
      const t = threads[0];
      if (t) {
        t.lastMessageAt = m.createdAt;
        t.lastSnippet = m.body.slice(0, 120);
      }
      return m;
    },
    async listThreads() {
      return threads.map((t) => ({ ...t }));
    },
    async listMessages() {
      return msgs.map((m) => ({ ...m }));
    },
    async markRead(appId) {
      const t = threads[0];
      if (t) t.unread = 0;
      return { applicationId: appId, unread: 0 };
    },
    listQueryKey,
    threadQueryKey,
    subscribe(appId) {
      return { queryKey: threadQueryKey(appId), queryFn: () => client.listMessages(appId) };
    },
  };
  return client;
}
