// Messaging transport. Real gRPC client wraps `api.messaging.*`; an in-memory mock lets the
// screens build before `pnpm gen` exposes the RPCs. Query-key helpers + the poll `subscribe()`
// seam are owned here so the view and cache invalidation never drift.
//
// gRPC swap: when `api.messaging.*` is generated, the `MessagingApi` cast below disappears and
// this file collapses to the `@ip/shared/messages.ts` re-export. Every screen/component stays
// byte-identical because they depend on the `MessagesClient` interface, not the transport.

import type { useAuth } from "../../lib/auth";
import type { MessageDTO, MessagesClient, SenderSide, ThreadDTO } from "./types";

export const USE_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";

const nz = (s: string | null | undefined): string | null => (s && s.length ? s : null);

// proto sends "" for absent read_at; normalize so the UI tests `readAt === null` for unread.
export function mapMessage(m: MessageDTO): MessageDTO {
  return { ...m, readAt: nz(m.readAt) };
}
function mapThread(t: ThreadDTO): ThreadDTO {
  return { ...t };
}

export const listQueryKey = () => ["messages", "threads"] as const;
export const threadQueryKey = (applicationId: string) =>
  ["messages", "thread", applicationId] as const;

type Api = ReturnType<typeof useAuth>["api"];

// The generated client doesn't carry `messaging` until `pnpm gen` runs; this is the seam the
// cast bridges. Shapes mirror the proto in messaging.md.
interface MessagingApi {
  messaging: {
    sendMessage(req: { applicationId: string; body: string }): Promise<MessageDTO>;
    listThreads(req: Record<string, never>): Promise<{ threads: ThreadDTO[] }>;
    listMessages(req: { applicationId: string }): Promise<{ messages: MessageDTO[] }>;
    markRead(req: { applicationId: string }): Promise<{ applicationId: string; unread: number }>;
  };
}

/** Real gRPC client. Wraps `api.messaging.*` directly until the shared package lands. */
export function createMessagesClient(api: Api): MessagesClient {
  const m = (api as unknown as MessagingApi).messaging;
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
