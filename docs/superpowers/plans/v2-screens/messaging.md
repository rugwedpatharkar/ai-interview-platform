# Screen: Messaging (candidate ↔ recruiter) — FE plan + BE contract

> Part of the [v2 build program](../2026-06-20-v2-build-program.md) (Wave 3).
> **Route:** `apps/candidate/app/messages/page.tsx` + `apps/candidate/app/messages/[applicationId]/page.tsx` + the company **applicant-view Messages tab** (`apps/company/app/jobs/[id]/applicants/[appId]/page.tsx`) · **Mockup:** `aptura_messaging` · **Pillar:** [messaging](../../v2/2026-06-19-messaging.md)
> **Goal:** A two-party message thread, **one per application**, scoped by `comp_id` + `application_id`. Candidates get an inbox of threads + a per-application conversation; recruiters reach the same thread from a Messages tab on the applicant detail. **Send** is a unary gRPC POST; **receive** is **short-poll** (TanStack `refetchInterval`) — no websockets, no SSE in v1.

This screen follows the authed-gRPC pattern (`"use client"` → `useAuth` → `useAuthedQuery`/`useQuery` → `@ip/ui`). It diverges from the assistant chat in one way: the live transcript is **poll-fetched** (a growing list of whole messages), not streamed — so it re-skins `@ip/ui`'s `ChatWindow` surface rather than reusing the node (see Part B, Task 3 grounding).

---

## A. Backend contract (hand this to a backend session)

**Status:** NEW · **Service:** `admin.messaging.v1` (authed gRPC-web `MessagingService` on **admin**, which owns Mongo). Mirrors `routes/decision.py` (servicer) over a new `resources/messaging.py` (the contract).

**Proto (`src/admin/app/routes/pb/messaging.proto` — NEW; mirror `decision.proto` shape):**
```proto
syntax = "proto3";
package admin.messaging.v1;

service MessagingService {
  rpc SendMessage(SendMessageRequest)   returns (MessageDTO);
  rpc ListThreads(ListThreadsRequest)   returns (ListThreadsResponse);
  rpc ListMessages(ListMessagesRequest) returns (ListMessagesResponse);
  rpc MarkRead(MarkReadRequest)         returns (MarkReadResponse);
}
message SendMessageRequest  { string application_id = 1; string body = 2; }
message MessageDTO {
  string id = 1; string application_id = 2; string sender_role = 3;   // "candidate" | "recruiter"
  string sender_user_id = 4; string body = 5; string created_at = 6; string read_at = 7;  // ISO; "" when unread
}
message ThreadDTO {
  string application_id = 1; string candidate_user_id = 2; string recruiter_user_id = 3;
  string job_title = 4; string company_name = 5;       // denormalized for the inbox row
  string last_message_at = 6; string last_snippet = 7; // first ~120 chars of the latest body
  int32  unread = 8;                                   // the CALLER's-side unread (candidate vs recruiter)
}
message ListThreadsRequest   { int32 page = 1; int32 page_size = 2; }
message ListThreadsResponse  { repeated ThreadDTO threads = 1; int32 page = 2; int32 page_size = 3; int32 total = 4; }
message ListMessagesRequest  { string application_id = 1; int32 page = 2; int32 page_size = 3; }
message ListMessagesResponse { repeated MessageDTO messages = 1; int32 page = 2; int32 page_size = 3; int32 total = 4; }
message MarkReadRequest      { string application_id = 1; }
message MarkReadResponse     { string application_id = 1; int32 unread = 2; }  // unread → 0 for the caller
```

**RPC contract the FE renders:**
- `SendMessage(application_id, body)` → `MessageDTO`. Lazy-creates the thread on first send (first sender is the creator). `body` is **candidate/recruiter input → validated at the boundary**: trimmed, non-empty, `len ≤ MAX_BODY` (**`MAX_BODY = 4096`**, a module constant in `resources/messaging.py`); over-cap → `ValidationError` → `INVALID_ARGUMENT`. `sender_user_id`/`sender_role` are set **from the token identity, never a client field** (no impersonation). Bumps the **recipient's** unread counter + `last_message_at` in one atomic thread update, then fires a **best-effort** `new_message` notification (see below).
- `ListThreads(page)` → `ListThreadsResponse`. Caller-scoped: a candidate sees only **their** threads; a recruiter sees only their **`comp_id`**'s threads. Sorted **desc by `last_message_at`** (server-sorted — the FE does not re-sort). `page_size` clamped (≤ 50). `unread` is the caller's-side counter.
- `ListMessages(application_id, page)` → `ListMessagesResponse`, the thread's messages in order (server returns thread order; the view renders ascending). `page_size` clamped. **Authz reused** (non-owner candidate → `PERMISSION_DENIED`; wrong-tenant recruiter → `NOT_FOUND`).
- `MarkRead(application_id)` → `MarkReadResponse` with the caller's `unread` now **0**. Sets the caller's own counter to 0 **and** stamps `read_at=now` on the other side's previously-unread rows (advisory). The **counter is the badge truth; `read_at` is advisory** — the FE derives the badge only from `unread`.

**Auth/scope:** bearer required on every RPC (`caller_identity`). Candidate path authorizes via `aptitude._owned(identity, application_id, applications)`; recruiter path via `decision._require_manager(identity)` + `decision._scoped(identity, application_id, applications)`. **Authorize against the application** — the thread is 1:1 with it. Do **not** invent a new authz primitive.

**Backed by:** `resources/messaging.py` (all logic: authz + tenancy + unread bookkeeping + DTO + best-effort notify) over `model/message.py` (`MessageThread`, `Message`) + two repos:
- `message_threads` — one doc per application: `comp_id`, `application_id`, `candidate_user_id`, `recruiter_user_id`, `last_message_at`, `unread_candidate:int=0`, `unread_recruiter:int=0`, `created_at`.
- `messages` (append-only) — `thread_id`, `comp_id`, `application_id`, `sender_role`, `sender_user_id`, `body`, `created_at`, `read_at:datetime|None`.
- Indexes (`infra/db.py` `INDEXES` — the single index authority):
  ```python
  IndexSpec("message_threads", "application_id", {"unique": True}),                  # the 1:1 invariant authz relies on
  IndexSpec("message_threads", [("candidate_user_id", 1), ("last_message_at", -1)]), # candidate inbox
  IndexSpec("message_threads", [("comp_id", 1), ("last_message_at", -1)]),           # company inbox
  IndexSpec("messages", [("thread_id", 1), ("created_at", 1)]),                       # thread read path
  IndexSpec("messages", "application_id"),                                            # erasure cascade + tenant purge
  ```
- **Erasure cascade:** threads + messages join the `CandidateEraser` cascade (delete by `application_id`); the recruiter loses the chat by design (application tombstone + funnel/audit survive).
- **Best-effort notify:** after the durable write, call the notifications center's `notify_event(user_id=<other party>, comp_id, kind="new_message", link="/messages/{application_id}", dedup_key=<message id>)` wrapped in `try/except Exception: log.exception(...)` — a raising notifier never fails the send. (The notification **row + email** assertions live in [notifications.md](./notifications.md); here we only fire the call.)

**Excluded from the DTO (grep-test):** internal Mongo handles, the opposite side's unread counter, `aptitude_config`/funnel internals — only the fields above ship.

**Funnel untouched:** no new `ApplicationState`/`FunnelEvent`, no CAS path. Messaging is a side-table keyed by `application_id`.

**FE mock shape** (`apps/candidate/app/messages/types.ts`) — the FE codes against this until `pnpm gen` exposes the real `api.messaging.*`:
```ts
export type SenderSide = "candidate" | "recruiter";

export interface MessageDTO {
  id: string; applicationId: string; senderRole: SenderSide; senderUserId: string;
  body: string; createdAt: string; readAt: string | null;   // normalize proto "" → null
}
export interface ThreadDTO {
  applicationId: string; candidateUserId: string; recruiterUserId: string;
  jobTitle: string; companyName: string;
  lastMessageAt: string; lastSnippet: string; unread: number;  // caller's-side unread
}
export interface ListThreadsResult  { threads: ThreadDTO[];  total: number; page: number; pageSize: number; }
export interface ListMessagesResult { messages: MessageDTO[]; total: number; page: number; pageSize: number; }
export interface MarkReadResult     { applicationId: string; unread: number; }

/** The seam both the real (gRPC) and mock clients satisfy. */
export interface MessagesClient {
  send(applicationId: string, body: string): Promise<MessageDTO>;
  listThreads(): Promise<ThreadDTO[]>;
  listMessages(applicationId: string): Promise<MessageDTO[]>;
  markRead(applicationId: string): Promise<MarkReadResult>;
  listQueryKey(): readonly unknown[];
  threadQueryKey(applicationId: string): readonly unknown[];
  subscribe(applicationId: string): { queryKey: readonly unknown[]; queryFn: () => Promise<MessageDTO[]> };
}
export const MAX_BODY = 4096;   // mirror the server cap (server stays the authority)
```

---

## B. Frontend plan (TDD, bite-sized)

**Files:**
- Create: `apps/candidate/app/messages/types.ts` (the contract shape above + `MessagesClient` seam + `MAX_BODY`).
- Create: `apps/candidate/app/messages/messages-client.ts` (real `createMessagesClient(api)` over gRPC + `makeMockMessagesClient()`; query-key helpers + the `subscribe()` poll seam owned here).
- Create: `apps/candidate/app/messages/messages-client.test.ts` (DTO mapping `"" → null`, query-key shape, mock send appends + bumps unread).
- Create: `apps/candidate/lib/use-thread-messages.ts` (poll + optimistic-send + mark-read hook — the shared data seam).
- Create: `apps/candidate/components/message-thread-view.tsx` (app-local chat re-skin fed by the hook; **NOT** a `ChatWindow` wrapper).
- Create: `apps/candidate/app/messages/page.tsx` (inbox: thread list, list-cadence poll, unread badges).
- Create: `apps/candidate/app/messages/[applicationId]/page.tsx` (a thread → `MessageThreadView side="candidate"`).
- Modify: `apps/candidate/components/candidate-shell.tsx` (`/messages` nav entry + total-unread `Badge`).
- Company side — Create: `apps/company/app/messages/messages-client.ts` + `lib/use-thread-messages.ts` + `components/message-thread-view.tsx` (thin duplicates; **hook body identical**, only `side` defaults differ — per the repo's app-local-component convention, do not promote to `@ip/shared` in this screen).
- Modify: `apps/company/app/jobs/[id]/applicants/[appId]/page.tsx` (wrap the existing `ReportView` in `Tabs`: **Report** + **Messages** → `MessageThreadView side="recruiter"`; tab unread `Badge`).

> **Reuse-vs-duplicate note:** the *behavior* (poll/optimistic/mark-read) lives once in `use-thread-messages.ts` and the *transport* lives once per app in `messages-client.ts`; only the thin presentational `MessageThreadView` is duplicated per app (it differs by `side` defaults and attribution copy). When the BE lands and `@ip/api-client` exposes `messaging`, the client moves to `@ip/shared/messages.ts` and the two `messages-client.ts` files collapse to a re-export — flag at handoff. **Until then** the gRPC client wraps `useAuth().api.messaging.*` directly.

**Components:** new `MessageThreadView`, inbox `ThreadRow`; reuse `@ip/ui` `Card`, `Badge`, `Avatar`, `Button`, `Input`, `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`, `LoadingState`/`ErrorState`/`EmptyState`, `Skeleton`, `toast`. **`@ip/ui` is untouched** (presentation-only; its passing typecheck proves no coupling).
**Query keys:** `["messages","threads"]` (inbox) · `["messages","thread",applicationId]` (a conversation) — owned in `messages-client.ts` so the view and cache invalidation never drift.

### Task 1: Contract types + messages client (mapping + query keys, testable)

- [ ] **Step 1: Write the failing test** — `apps/candidate/app/messages/messages-client.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mapMessage, makeMockMessagesClient } from "./messages-client";

describe("mapMessage", () => {
  it("normalizes empty read_at/created_at strings to null", () => {
    const dto = mapMessage({ id: "m1", applicationId: "a1", senderRole: "recruiter",
      senderUserId: "u2", body: "hi", createdAt: "2026-06-20T00:00:00Z", readAt: "" });
    expect(dto.readAt).toBeNull();
  });
});
describe("makeMockMessagesClient", () => {
  it("send appends a self message and the next listMessages returns it", async () => {
    const c = makeMockMessagesClient("a1", "candidate");
    const before = (await c.listMessages("a1")).length;
    const sent = await c.send("a1", "  hello  ");
    expect(sent.body).toBe("hello");              // trimmed
    expect(sent.senderRole).toBe("candidate");
    expect((await c.listMessages("a1")).length).toBe(before + 1);
  });
  it("threadQueryKey is stable + scoped to the application", () => {
    const c = makeMockMessagesClient("a1", "candidate");
    expect(c.threadQueryKey("a1")).toEqual(["messages", "thread", "a1"]);
  });
});
```
- [ ] **Step 2: Run it, verify it fails** — `npx pnpm@9.15.0 --filter @ip/candidate test messages-client` → FAIL (module not defined). *(If the app has no test runner wired, add `vitest` + a `test` script to `apps/candidate` devDeps first — fold into this task; mirror the marketplace screen's test bootstrap.)*
- [ ] **Step 3: Implement `types.ts`** (paste the Part-A shape) **and** `messages-client.ts`:
```ts
import type { useAuth } from "../../lib/auth";
import type { MessageDTO, ThreadDTO, MessagesClient, SenderSide } from "./types";

const nz = (s: string | null | undefined): string | null => (s && s.length ? s : null);

// proto sends "" for absent read_at; normalize so the UI tests `readAt === null` for unread.
export function mapMessage(m: MessageDTO): MessageDTO {
  return { ...m, readAt: nz(m.readAt), createdAt: m.createdAt };
}
function mapThread(t: ThreadDTO): ThreadDTO { return { ...t, lastMessageAt: t.lastMessageAt }; }

export const listQueryKey = () => ["messages", "threads"] as const;
export const threadQueryKey = (applicationId: string) =>
  ["messages", "thread", applicationId] as const;

type Api = ReturnType<typeof useAuth>["api"];

/** Real gRPC client. Wraps `api.messaging.*` directly until the shared package lands. */
export function createMessagesClient(api: Api): MessagesClient {
  return {
    async send(applicationId, body) {
      // The server is the authority on the cap + identity; we send the trimmed body.
      return mapMessage(await api.messaging.sendMessage({ applicationId, body: body.trim() }));
    },
    async listThreads() { return (await api.messaging.listThreads({})).threads.map(mapThread); },
    async listMessages(applicationId) {
      return (await api.messaging.listMessages({ applicationId })).messages.map(mapMessage);
    },
    async markRead(applicationId) {
      const r = await api.messaging.markRead({ applicationId });
      return { applicationId: r.applicationId, unread: r.unread };
    },
    listQueryKey, threadQueryKey,
    // v1 = short-poll; swapping to SSE (pillar §3.4) replaces ONLY this body — it would open
    // ai-agents `/messages/{id}/stream`, parse frames like chat.ts, and feed the same cache.
    // The write path, query keys, and MessageThreadView stay untouched.
    subscribe(applicationId) {
      return { queryKey: threadQueryKey(applicationId), queryFn: () => this.listMessages(applicationId) };
    },
  };
}
```
- [ ] **Step 4:** Add `makeMockMessagesClient(applicationId, side)` to `messages-client.ts` (lets the screen build before `pnpm gen`):
```ts
import type { MessageDTO, ThreadDTO, MessagesClient, SenderSide } from "./types";

export function makeMockMessagesClient(applicationId: string, side: SenderSide): MessagesClient {
  const now = () => new Date().toISOString();
  const other: SenderSide = side === "candidate" ? "recruiter" : "candidate";
  let seq = 2;
  const msgs: MessageDTO[] = [
    { id: "m1", applicationId, senderRole: other, senderUserId: "u-other", body:
      "Thanks for applying — a couple of quick questions before we schedule.", createdAt: now(), readAt: now() },
  ];
  const threads: ThreadDTO[] = [
    { applicationId, candidateUserId: "u-cand", recruiterUserId: "u-rec",
      jobTitle: "Senior Frontend Engineer", companyName: "Northwind",
      lastMessageAt: now(), lastSnippet: "Thanks for applying…", unread: side === "candidate" ? 1 : 0 },
  ];
  const client: MessagesClient = {
    async send(appId, body) {
      const m: MessageDTO = { id: `m${seq++}`, applicationId: appId, senderRole: side,
        senderUserId: "self", body: body.trim(), createdAt: now(), readAt: null };
      msgs.push(m);
      return m;
    },
    async listThreads() { return threads; },
    async listMessages() { return [...msgs]; },
    async markRead(appId) { threads[0].unread = 0; return { applicationId: appId, unread: 0 }; },
    listQueryKey, threadQueryKey,
    subscribe(appId) { return { queryKey: threadQueryKey(appId), queryFn: () => client.listMessages(appId) }; },
  };
  return client;
}
export const USE_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";
```
- [ ] **Step 5: Run test, verify it passes** — `npx pnpm@9.15.0 --filter @ip/candidate test messages-client` → PASS.
- [ ] **Step 6: Verify typecheck** — `npx pnpm@9.15.0 --filter @ip/candidate typecheck` clean. **(Until `pnpm gen` adds `messaging` to `ApiClients`, the real `createMessagesClient` references `api.messaging` — keep it behind the `USE_MOCK` toggle so the screen builds against the mock; the real path typechecks once the proto regenerates.)**

### Task 2: `useThreadMessages` hook (poll + optimistic send + mark-read — the shared data seam)

- [ ] **Step 1:** Create `apps/candidate/lib/use-thread-messages.ts`. Encapsulates the receive/send/read behavior so both apps reuse **identical** data logic:
```tsx
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { errorMessage, toast } from "@ip/ui";      // toast re-exported from @ip/ui
import { useAuth } from "./auth";
import { createMessagesClient, makeMockMessagesClient, USE_MOCK } from "../app/messages/messages-client";
import type { MessageDTO, SenderSide } from "../app/messages/types";

interface Optimistic { id: string; senderRole: SenderSide; body: string; pending: true; }

export function useThreadMessages(applicationId: string, side: SenderSide) {
  const { api } = useAuth();
  const qc = useQueryClient();
  const client = useMemo(
    () => (USE_MOCK ? makeMockMessagesClient(applicationId, side) : createMessagesClient(api)),
    [api, applicationId, side],
  );

  // Receive: 5s open cadence, paused on a hidden tab (the liveness/idle-cost requirement).
  const q = useQuery({
    ...client.subscribe(applicationId),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });

  const [optimistic, setOptimistic] = useState<Optimistic[]>([]);
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);           // ref-latch — survives same-tick double-submit / StrictMode

  async function send(body: string) {
    const text = body.trim();
    if (!text || inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    const tmpId = `tmp-${Date.now()}`;
    setOptimistic((c) => [...c, { id: tmpId, senderRole: side, body: text, pending: true }]);
    try {
      await client.send(applicationId, text);
      await qc.invalidateQueries({ queryKey: client.threadQueryKey(applicationId) }); // real row arrives
      await qc.invalidateQueries({ queryKey: client.listQueryKey() });                // inbox last/unread
      setOptimistic((c) => c.filter((o) => o.id !== tmpId));
    } catch (e) {
      setOptimistic((c) => c.filter((o) => o.id !== tmpId));                          // roll back
      toast.error(errorMessage(e));                                                   // surface send-failed
      throw e;                                                                        // caller restores input text
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  // Mark-read on open / on new inbound — guarded so it doesn't loop on every poll tick.
  const lastSeen = useRef(0);
  useEffect(() => {
    const n = q.data?.length ?? 0;
    const inbound = (q.data ?? []).some((m: MessageDTO) => m.senderRole !== side && !m.readAt);
    if (n !== lastSeen.current && inbound) {
      lastSeen.current = n;
      void client
        .markRead(applicationId)
        .then(() => qc.invalidateQueries({ queryKey: client.listQueryKey() })) // clears nav/inbox badge
        .catch(() => {});                                                       // best-effort; never throw into render
    } else {
      lastSeen.current = n;
    }
  }, [applicationId, q.data, side, client, qc]);

  return {
    messages: q.data ?? [], optimistic,
    isLoading: q.isLoading, isError: q.isError, error: q.error, refetch: q.refetch,
    send, sending,
  };
}
```
- [ ] **Step 2: Verify** — `npx pnpm@9.15.0 --filter @ip/candidate typecheck` clean (adjust `toast`/`errorMessage` import source if they live in `@ip/shared` rather than `@ip/ui` — match the existing `dashboard.tsx` import).

### Task 3: `MessageThreadView` (app-local chat re-skin, fed by the hook)

> **Grounding (read before coding).** `@ip/ui`'s `ChatWindow` (`frontend/packages/ui/src/chat-window.tsx`) is **closed**: it owns `useState<Turn[]>([])` and exposes **only** a streaming `send(messages, handlers, signal)` prop — there is **no** way to inject a poll-fetched history. So messaging does **not** render the literal `ChatWindow`; `MessageThreadView` faithfully re-skins its surface — the bubble layout (`flex max-w-[90%] gap-2.5`, `flex-row-reverse self-end` for self / `self-start` for other), the bubble token classes (`rounded-tr-sm bg-primary text-primary-foreground` vs `rounded-tl-sm bg-surface-muted text-foreground`), `whitespace-pre-wrap break-words`, the `atBottom`/`onScroll`/`endRef` auto-stick logic + the "scroll to latest" affordance — but is driven by `useThreadMessages`. `@ip/ui` stays untouched. *(If a reviewer prefers a thin `messages` prop on `ChatWindow`, that is a separate `@ip/ui` change, out of scope here — flag at handoff.)*

- [ ] **Step 1:** Create `apps/candidate/components/message-thread-view.tsx` (`"use client"`):
```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { Building2, Send, User } from "lucide-react";          // lucide imported IN the app (the @ip/ui gotcha)
import { Button, Input, cn, EmptyState, ErrorState, LoadingState } from "@ip/ui";
import { errorMessage } from "@ip/shared";
import { useThreadMessages } from "../lib/use-thread-messages";
import { MAX_BODY, type SenderSide } from "../app/messages/types";

export function MessageThreadView({ applicationId, side }: { applicationId: string; side: SenderSide }) {
  const { messages, optimistic, isLoading, isError, error, refetch, send, sending } =
    useThreadMessages(applicationId, side);
  const [input, setInput] = useState("");
  const [atBottom, setAtBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const rows = [...messages, ...optimistic];                    // optimistic appended after real
  useEffect(() => { if (atBottom) endRef.current?.scrollIntoView({ block: "end" }); }, [rows.length, atBottom]);
  function onScroll() {
    const el = scrollRef.current; if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
  }
  const otherLabel = side === "candidate" ? "Hiring team" : "Candidate";

  async function submit() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");                                               // optimistic clear
    setAtBottom(true);
    try { await send(text); } catch { setInput(text); }         // hook toasts; restore the lost text
  }

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState message={errorMessage(error)} retry={() => refetch()} />;

  return (
    <div className="flex h-[28rem] min-h-0 flex-col gap-3">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        role="log" aria-live="polite" aria-relevant="additions"
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1"
      >
        {rows.length === 0 && (
          <EmptyState title="No messages yet" description="Start the conversation below." />
        )}
        {rows.map((m) => {
          const isSelf = m.senderRole === side;
          const pending = "pending" in m && m.pending;
          return (
            <div key={m.id} className={cn("flex max-w-[90%] gap-2.5", isSelf ? "flex-row-reverse self-end" : "self-start", pending && "opacity-60")}>
              <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                isSelf ? "bg-primary text-primary-foreground" : "bg-surface-muted text-muted-foreground")} aria-hidden>
                {isSelf ? <User className="size-4" /> : <Building2 className="size-4" />}
              </span>
              <div className={cn("min-w-0", isSelf && "flex flex-col items-end")}>
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  {isSelf ? "You" : otherLabel}
                </span>
                <div className={cn("rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                  isSelf ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm bg-surface-muted text-foreground")}>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Input
          value={input}
          maxLength={MAX_BODY}                                  // client guard mirrors the server cap
          placeholder="Write a message…"
          onChange={(e) => setInput(e.target.value)}
        />
        <Button type="submit" size="icon" disabled={!input.trim() || sending} aria-label="Send message">
          <Send className="size-4" aria-hidden />
        </Button>
      </form>
    </div>
  );
}
```
- [ ] **Step 2: Verify** — `npx pnpm@9.15.0 --filter @ip/candidate typecheck` clean (reconcile `EmptyState`/`ErrorState`/`LoadingState` prop names — `retry` vs `onRetry` — with the real `@ip/ui` API; match `marketplace.tsx`/the report page).

### Task 4: Candidate inbox (`/messages`) + a conversation (`/messages/[applicationId]`)

- [ ] **Step 1:** Create `apps/candidate/app/messages/page.tsx` (`"use client"`, inside `CandidateShell`, slower 30s list cadence):
```tsx
"use client";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Badge, Card, EmptyState, ErrorState, LoadingState, PageHeader } from "@ip/ui";
import { errorMessage } from "@ip/shared";
import { CandidateShell } from "../../components/candidate-shell";
import { useAuth } from "../../lib/auth";
import { createMessagesClient, makeMockMessagesClient, USE_MOCK, listQueryKey } from "./messages-client";

export default function MessagesPage() {
  const { api, token } = useAuth();
  const client = useMemo(
    () => (USE_MOCK ? makeMockMessagesClient("a1", "candidate") : createMessagesClient(api)),
    [api],
  );
  const q = useQuery({
    queryKey: listQueryKey(),
    queryFn: () => client.listThreads(),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  if (!token) return null;
  return (
    <CandidateShell>
      <PageHeader title="Messages" />
      {q.isLoading && <LoadingState />}
      {q.isError && <ErrorState message={errorMessage(q.error)} retry={() => q.refetch()} />}
      {q.data && q.data.length === 0 && (
        <EmptyState title="No messages" description="When a recruiter messages you about an application, it'll show up here." />
      )}
      {q.data && q.data.length > 0 && (
        <div className="flex flex-col gap-3">
          {q.data.map((t) => (              // server sorts desc by last_message_at — do not re-sort
            <Link key={t.applicationId} href={`/messages/${t.applicationId}`}>
              <Card className="flex items-start justify-between gap-3 p-4 hover:border-border-strong transition-colors">
                <div className="min-w-0">
                  <h3 className="truncate font-display text-base font-medium text-foreground">{t.jobTitle}</h3>
                  <p className="truncate text-sm text-muted-foreground">{t.companyName}</p>
                  <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{t.lastSnippet}</p>
                </div>
                {t.unread > 0 && <Badge tone="info">{t.unread > 9 ? "9+" : t.unread}</Badge>}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </CandidateShell>
  );
}
```
- [ ] **Step 2:** Create `apps/candidate/app/messages/[applicationId]/page.tsx` (`"use client"`, inside `CandidateShell` which already enforces `useRequireAuth`/role):
```tsx
"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useParams } from "next/navigation";
import { buttonVariants, PageHeader } from "@ip/ui";
import { CandidateShell } from "../../../components/candidate-shell";
import { MessageThreadView } from "../../../components/message-thread-view";

export default function ThreadPage() {
  const { applicationId } = useParams<{ applicationId: string }>();
  return (
    <CandidateShell>
      <Link href="/messages" className={buttonVariants({ variant: "ghost", size: "sm" })}>
        <ArrowLeft className="size-4" aria-hidden /> Messages
      </Link>
      <PageHeader title="Conversation" />
      <MessageThreadView applicationId={applicationId} side="candidate" />
    </CandidateShell>
  );
}
```
- [ ] **Step 3: Verify build + preview** — `NEXT_PUBLIC_MOCK=1 npx pnpm@9.15.0 --filter @ip/candidate build` clean; then via the preview loop: start dev, load `/messages` (inbox row renders), open a thread, type + send (bubble appears optimistically then reconciles), confirm **no console errors** and that polling stops on a hidden tab (Network panel / a `document.hidden` log). Screenshot.

### Task 5: Nav entry + total-unread badge in `candidate-shell.tsx`

- [ ] **Step 1:** Add `{ href: "/messages", label: "Messages" }` to `NAV`. Compute a total-unread badge from a lightweight query and render a small `Badge` next to the "Messages" `NavLink` label when `> 0` (cap at `9+`). Keep it resilient — on error the badge simply doesn't render (never throw in the shell):
```tsx
const messages = useMemo(
  () => (USE_MOCK ? makeMockMessagesClient("a1", "candidate") : createMessagesClient(api)),
  [api],
);
const unread = useQuery({
  queryKey: listQueryKey(),
  queryFn: () => messages.listThreads(),
  refetchInterval: 60_000,
  refetchIntervalInBackground: false,
  enabled: !!token,
});
const totalUnread = (unread.data ?? []).reduce((s, t) => s + t.unread, 0);
// …in NAV render: {item.href === "/messages" && totalUnread > 0 && (
//   <Badge tone="info" className="ml-1">{totalUnread > 9 ? "9+" : totalUnread}</Badge>)}
```
- [ ] **Step 2: Verify** — `npx pnpm@9.15.0 --filter @ip/candidate build` clean; the badge shows in the nav and clears after opening a thread (the hook's `markRead` invalidates `listQueryKey()`).

### Task 6: Company applicant-view Messages tab (+ recruiter-side unread)

- [ ] **Step 1:** Create the company thin duplicates — `apps/company/app/messages/messages-client.ts`, `apps/company/lib/use-thread-messages.ts`, `apps/company/components/message-thread-view.tsx` — by copying the candidate trio; the **hook body is identical**, only the `side` defaults to `"recruiter"` and the attribution copy differs (`otherLabel = "Candidate"`; own/team messages may show the per-message `senderUserId` handle). Do **not** promote to `@ip/shared`/`@ip/ui` in this screen (repo app-local convention).
- [ ] **Step 2:** Wrap the applicant detail in `Tabs`. `apps/company/app/jobs/[id]/applicants/[appId]/page.tsx` currently renders only `ReportView`. Wrap it (mirroring `jobs/[id]/page.tsx`'s `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`) with **Report** (the existing `ReportView` + its `notReady`/poll logic, unchanged) and **Messages** → `<MessageThreadView applicationId={appId} side="recruiter" />`. The resource enforces `comp_id` scoping; any manager of the company sees the thread (attribution is per-message).
- [ ] **Step 3:** Recruiter-side unread affordance — show the recruiter-side `thread.unread` as a `Badge` on the **Messages `TabsTrigger`**. Read it from the thread the view already polls (a cheap `listThreads` find), not a second per-tab query — keep it a single source. On open, `MessageThreadView`'s `markRead` clears it. *(No company-app nav badge in v1 — the recruiter inbox lives per-applicant, not as a global nav surface; note this so a reviewer doesn't expect a `CompanyShell` badge.)*
- [ ] **Step 4: Verify build + cross-app E2E** — `npx pnpm@9.15.0 --filter @ip/company build` green; then (with the BE up, or both apps on the same mock fixture) open an applicant → Messages tab → send → it appears in the candidate's `/messages/<id>` within one poll interval; the candidate nav badge increments; the candidate replies → the recruiter tab updates and the tab badge clears on open.
- [ ] **Step 5: Full FE gate** — `npx pnpm@9.15.0 --filter @ip/candidate build` + `--filter @ip/company build` + `--filter @ip/{ui,shared,api-client} typecheck` all green (`@ip/ui` typechecks though untouched — proves no accidental coupling). Flag at handoff whether the `new_message` notify is wired to the real `notify_event` or a local stub (depends on increment ordering), and whether a reviewer wanted the `ChatWindow` prop-injection alternative (deferred here).

---

## C. States & acceptance

- **States (every surface):** loading (`LoadingState`/`Skeleton`), empty (inbox: `EmptyState "No messages"`; thread: `EmptyState "No messages yet"`), error (`ErrorState` + retry), success. **Send-failed** → `toast.error(errorMessage(err))` **and** the input text is re-filled (not lost). A pre-message application is absent from `ListThreads` and its surface shows the empty state.
- **Optimistic send + reconciliation:** the sent bubble appears immediately (reduced opacity while `pending`); on success the `threadQueryKey` + `listQueryKey` invalidations swap in the real `MessageDTO` and refresh the inbox `last_message_at`/unread; on failure the optimistic row is dropped and the text restored. The **ref-latch** (`inFlight`) blocks same-tick double-submit / StrictMode double-fire.
- **Unread reconciliation:** the badge derives **only** from the thread's caller-side `unread` counter (never computed from `read_at`). `markRead` fires on open / on new inbound (guarded against per-poll-tick loops), zeroes the caller's counter server-side, and invalidates `listQueryKey()` so the nav/inbox/tab badge clears. Counter races (two managers + a candidate) self-heal on the next `MarkRead` — advisory, no locking.
- **Poll cadence:** thread 5s, inbox 30s, nav badge 60s; **all pause on a hidden tab** (`refetchIntervalInBackground: false`). SSE is the documented upgrade — `subscribe()` is the only swap point (do not build SSE here).
- **Responsive:** the conversation panel is full-bleed on mobile; the inbox rows stack; the company Messages tab fills the tab panel (`h-full`).
- **Dark mode:** tokens only (the re-skin reuses `ChatWindow`'s violet/dark classes) — automatic.
- **A11y:** the message list is `role="log" aria-live="polite" aria-relevant="additions"` so newly-polled inbound messages are announced; the composer is a `<form>`; the send `Button` carries `aria-label="Send message"`; bubbles use `whitespace-pre-wrap break-words` (pasted markup is inert plain text).
- **Acceptance:** matches the `aptura_messaging` mockup; sends are unary gRPC, receive is poll; `body` capped at 4096 both client (guard) and server (authority); authz reuses `_owned` / `_scoped`+`_require_manager`; works against the mock today (`NEXT_PUBLIC_MOCK=1`) and against `MessagingService` once `pnpm gen` lands (flip the toggle / collapse `messages-client.ts` to the `@ip/shared` re-export); both app builds + all four typechecks green.
