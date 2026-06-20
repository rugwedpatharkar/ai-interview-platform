# Message thread — BE contract

> **Screen:** Message thread (`/messages/[applicationId]` · company applicant-detail Messages tab).
> **FE consumer:** `frontend_message-thread.md`. **Status:** `EXISTING — reuse v2`, restated from
> `../../v2-screens/messaging.md` (`admin.messaging.v1`). **Real-vs-mock today:** `MessagingService` is the v2 NEW
> service; the FE codes against `makeMockMessagesClient` behind `NEXT_PUBLIC_MOCK` until `pnpm gen`. **The Midnight
> reskin changes nothing here.**

## Functionalities (what the BE provides for this page)

- **List** an application's messages in order (the transcript; poll target).
- **Send** a message in the application's thread (unary; lazy-creates the thread on first send).
- **Mark read** — zero the caller's unread counter for this thread on open / new inbound.

## Service & RPCs

**Service:** `admin.messaging.v1.MessagingService` (authed gRPC-web on **admin**; bearer required).

```proto
rpc ListMessages(ListMessagesRequest) returns (ListMessagesResponse);
rpc SendMessage(SendMessageRequest)   returns (MessageDTO);
rpc MarkRead(MarkReadRequest)         returns (MarkReadResponse);
```

- **`ListMessages(application_id, page)`** → the thread's messages in order (server returns thread order; the view
  renders ascending). `page_size` clamped ≤ 50. **Authz:** candidate via `aptitude._owned`; recruiter via
  `decision._require_manager` + `decision._scoped` — both **against the application** (thread is 1:1 with it).
- **`SendMessage(application_id, body)`** → `MessageDTO`. **Lazy-creates** the thread on first send (first sender is
  the creator). `body` is candidate/recruiter input → **validated at the boundary**: trimmed, non-empty, `len ≤
  MAX_BODY (4096)`; over-cap → `ValidationError` → `INVALID_ARGUMENT`. `sender_user_id`/`sender_role` set **from the
  token identity, never a client field**. Atomically bumps the **recipient's** `unread` + `last_message_at`, then fires
  a **best-effort** `new_message` notification (`notify_event(user_id=<other party>, comp_id, kind="new_message",
  link="/messages/{application_id}", dedup_key=<message id>)`, wrapped so a raising notifier never fails the send).
- **`MarkRead(application_id)`** → `MarkReadResponse{unread: 0}` for the caller. Zeros the caller's own counter **and**
  stamps `read_at=now` on the other side's previously-unread rows (advisory). **The counter is the badge truth;
  `read_at` is advisory** — the FE derives the badge only from `unread`.

## Request / Response structures

```proto
message ListMessagesRequest  { string application_id = 1; int32 page = 2; int32 page_size = 3; }
message MessageDTO {
  string id = 1; string application_id = 2; string sender_role = 3;   // "candidate" | "recruiter"
  string sender_user_id = 4; string body = 5; string created_at = 6; string read_at = 7;  // ISO; "" when unread
}
message ListMessagesResponse { repeated MessageDTO messages = 1; int32 page = 2; int32 page_size = 3; int32 total = 4; }
message SendMessageRequest   { string application_id = 1; string body = 2; }
message MarkReadRequest      { string application_id = 1; }
message MarkReadResponse     { string application_id = 1; int32 unread = 2; }  // unread → 0 for the caller
```

**FE mock shape** (camelCase, protobuf-es; `apps/candidate/app/messages/types.ts`):

```ts
export type SenderSide = "candidate" | "recruiter";
export interface MessageDTO {
  id: string; applicationId: string; senderRole: SenderSide; senderUserId: string;
  body: string; createdAt: string; readAt: string | null;   // normalize proto "" → null
}
export interface ListMessagesResult { messages: MessageDTO[]; total: number; page: number; pageSize: number; }
export interface MarkReadResult     { applicationId: string; unread: number; }
export const MAX_BODY = 4096;   // mirror the server cap (server stays the authority)
```

## Data required

- **`messages`** (append-only): `thread_id`, `comp_id`, `application_id`, `sender_role`, `sender_user_id`, `body`,
  `created_at`, `read_at:datetime|None`. **`message_threads`** (1:1 per application) holds `unread_candidate`/
  `unread_recruiter` + `last_message_at` (bumped on send).
- **Indexes** (`infra/db.py` `INDEXES`):
  - `("messages",[("thread_id",1),("created_at",1)])` — thread read path (order).
  - `("messages","application_id")` — erasure cascade + tenant purge.
  - `("message_threads","application_id",{unique:True})` — the 1:1 invariant authz relies on.
- **Erasure cascade:** threads + messages join the `CandidateEraser` cascade (delete by `application_id`); the
  recruiter loses the chat by design (application tombstone + funnel/audit survive).
- **Excluded from the DTO (grep-test):** internal Mongo handles, the opposite side's unread counter.

## Errors & edge cases

- **UNAUTHENTICATED** — missing/invalid bearer.
- **INVALID_ARGUMENT** — empty or over-`MAX_BODY` body on send.
- **PERMISSION_DENIED** — non-owner candidate on `ListMessages`/`MarkRead`. **NOT_FOUND** — wrong-tenant recruiter
  (thread not in their `comp_id`).
- **Send best-effort notify** never fails the durable write (try/except around `notify_event`).
- **Empty state** — a fresh thread (only the first send exists) lists just that message; a never-sent application has
  no thread (FE shows "No messages yet").

## Cross-references

- Restates `../../v2-screens/messaging.md` Part A (`MessagingService`).
- Pairs with `../messaging-inbox/backend_messaging-inbox.md` (`ListThreads`).
- The `new_message` notification row + email assertions live in `../../v2-screens/notifications.md` (this screen only
  **fires** the best-effort call). **Funnel untouched** (no `ApplicationState`/`FunnelEvent`/CAS).
