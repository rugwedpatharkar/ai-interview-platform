# Notifications — BE contract

> **Screen:** Notifications (`/notifications` · `/company/notifications`) + the header bell. **FE consumer:**
> `frontend_notifications.md`. **Status:** `EXISTING — reuse v2`, restated from `../../v2-screens/notifications.md`
> (`admin.notification.v1`). **Real-vs-mock today:** `NotificationService` is the v2 NEW read/ack service (the write
> side evolves `TransitionNotifier`); the FE codes against `makeMockNotificationsClient()` behind `NEXT_PUBLIC_MOCK`
> until `pnpm gen`. **The Midnight reskin changes nothing here.**

## Functionalities (what the BE provides for this page)

- **List** the caller's notifications (recipient-scoped, desc by `created_at`, optional `unread_only`), with an
  **always-fresh** unread count.
- **Mark read** one notification (returns the fresh post-ack count).
- **Mark all read** for the caller (returns 0).

(Company kind-scoping is a **FE render-filter** — `filterCompanyKinds`/`COMPANY_KINDS`; the service is
recipient-scoped only. The candidate and recruiter each read their **own** rows.)

## Service & RPCs

**Service:** `admin.notification.v1.NotificationService` (authed gRPC-web on **admin**; bearer required; **every RPC
recipient-scoped to `identity["id"]`** — no comp-scoping at the service).

```proto
rpc ListNotifications(ListRequest)   returns (ListResponse);
rpc MarkRead(MarkReadRequest)        returns (MarkReadResponse);
rpc MarkAllRead(MarkAllReadRequest)  returns (MarkReadResponse);
```

- **`ListNotifications(unread_only, page, page_size)`** — desc by `created_at`, `page_size` clamped ≤ 50,
  `unread_only` filters `read_at is None`. **`unread_count` is ALWAYS a fresh `count_documents({user_id, read_at:
  None})`** (the freshness contract — never a cached counter).
- **`MarkRead(notification_id)`** → `MarkReadResponse{unread_count}` (fresh post-ack count). **`NOT_FOUND`** if the id
  isn't the caller's.
- **`MarkAllRead()`** → `MarkReadResponse{unread_count: 0}`.

## Request / Response structures

```proto
message NotificationDTO {
  string id = 1; string kind = 2; string subject = 3; string body = 4;
  string link = 5; string created_at = 6; string read_at = 7;   // ISO; "" when absent/unread
}
message ListRequest        { int32 page = 1; int32 page_size = 2; bool unread_only = 3; }
message ListResponse       { repeated NotificationDTO notifications = 1; int32 unread_count = 2;
                             int32 page = 3; int32 page_size = 4; int32 total = 5; }
message MarkReadRequest    { string notification_id = 1; }
message MarkAllReadRequest {}
message MarkReadResponse   { int32 unread_count = 1; }   // fresh post-ack count, for an instant badge
```

**FE mock shape** (camelCase, protobuf-es; `apps/candidate/app/notifications/types.ts`):

```ts
export type NotificationKind =
  | "interview_pending" | "aptitude_pending" | "gated_out" | "shortlisted" | "hired" | "rejected"
  | "assessment_review" | "new_message" | "assessment_ready" | "practice_complete";
export interface Notification {
  id: string; kind: NotificationKind | string; subject: string; body: string;
  link: string | null; createdAt: string; readAt: string | null;   // normalize proto "" → null
}
export interface NotificationsPage {
  notifications: Notification[]; unreadCount: number; total: number; page: number; pageSize: number;
}
export const POLL_INTERVAL = 30_000;   // badge poll cadence (pauses on a hidden tab)
```

## Data required

- **`notifications`**: `user_id`, `comp_id:str|None`, `kind`, `subject`, `body`, `link:str|None`,
  `read_at:datetime|None`, `dedup_key:str|None`, `created_at`. The **deep-link is resolved once at write time** and
  stored on the row (`new_message`→`/messages/{application_id}`, `assessment_ready`→report,
  `practice_complete`→`/feedback/{practice_id}`, funnel→app page or `None`) — the FE reads `link` **verbatim**.
- **Indexes** (`infra/db.py` `INDEXES`):
  - `("notifications",[("user_id",1),("created_at",-1)])` — feed recency.
  - `("notifications",[("user_id",1),("read_at",1)])` — unread filter / fresh COUNT.
  - `("notifications",[("user_id",1),("dedup_key",1)],{unique:True,sparse:True})` — idempotency (a redelivered
    trigger no-ops on duplicate-key).
- **Write side (cross-ref, not this screen):** `TransitionNotifier.notify` writes a **row first** then emails (row =
  durable channel); `notify_event(...)` is the non-funnel best-effort entry (messaging/practice).
- **Erasure cascade:** `notifications` joins the `CandidateEraser` cascade (`delete_by_user`).
- **Excluded from the DTO (grep-test):** `comp_id`, `dedup_key`, internal Mongo handles.

## Errors & edge cases

- **UNAUTHENTICATED** — missing/invalid bearer.
- **NOT_FOUND** — `MarkRead` on an id that isn't the caller's.
- **Empty state** — no rows → `notifications: []`, `unread_count: 0` (FE shows "You're all caught up"; bell badge
  hidden).
- `page_size` over 50 clamped server-side (not an error). Unknown server `kind` widened to `string` at the FE
  boundary (Bell fallback icon) — never throws.

## Cross-references

- Restates `../../v2-screens/notifications.md` Part A (`NotificationService`).
- The **`new_message`** kind is fired best-effort by messaging (`../message-thread/backend_message-thread.md`) and
  deep-links to the conversation (the no-ghosting "you've got an answer").
- Shared enums/kinds: the `_MESSAGES` typed kind set (funnel + `assessment_review`/`new_message`/`assessment_ready`/
  `practice_complete`). **Funnel untouched** (the read/ack API writes no funnel state).
