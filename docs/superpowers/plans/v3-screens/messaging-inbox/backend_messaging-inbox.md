# Messaging inbox — BE contract

> **Screen:** Messaging inbox (`/messages` · `/company/messages`). **FE consumer:** `frontend_messaging-inbox.md`.
> **Status:** `EXISTING — reuse v2`, restated from `../../v2-screens/messaging.md` (`admin.messaging.v1`).
> **Real-vs-mock today:** `MessagingService` is the v2 NEW service; the FE codes against `makeMockMessagesClient`
> behind `NEXT_PUBLIC_MOCK` until `pnpm gen` exposes `api.messaging.*`. **The Midnight reskin changes nothing here** —
> this doc restates the contract the inbox already consumes.

## Functionalities (what the BE provides for this page)

- **List** the caller's message threads (one per application) for the inbox rail, server-sorted, with each row's
  caller-side unread count, last snippet, and last-message timestamp.

(The inbox page itself only calls `ListThreads`. Send / per-thread message list / mark-read belong to
`message-thread` — see `../message-thread/backend_message-thread.md`.)

## Service & RPCs

**Service:** `admin.messaging.v1.MessagingService` (authed gRPC-web on **admin**; bearer required on every RPC).

```proto
rpc ListThreads(ListThreadsRequest) returns (ListThreadsResponse);
```

- **`ListThreads(page, page_size)`** — caller-scoped. **Candidate** sees only their own threads (authz via
  `aptitude._owned` over the application); **recruiter** sees only their `comp_id`'s threads (`decision._require_manager`
  + tenant filter). Sorted **desc by `last_message_at`** (server-sorted; FE does not re-sort). `page_size` clamped ≤ 50.
  `unread` is the **caller's-side** counter (candidate vs recruiter), never the opposite side's.

## Request / Response structures

```proto
message ListThreadsRequest  { int32 page = 1; int32 page_size = 2; }
message ThreadDTO {
  string application_id = 1; string candidate_user_id = 2; string recruiter_user_id = 3;
  string job_title = 4; string company_name = 5;        // denormalized for the row
  string last_message_at = 6; string last_snippet = 7;  // first ~120 chars of latest body
  int32  unread = 8;                                     // CALLER's-side unread
}
message ListThreadsResponse { repeated ThreadDTO threads = 1; int32 page = 2; int32 page_size = 3; int32 total = 4; }
```

**FE mock shape** (camelCase, protobuf-es; `apps/candidate/app/messages/types.ts` — what the rail codes against):

```ts
export interface ThreadDTO {
  applicationId: string; candidateUserId: string; recruiterUserId: string;
  jobTitle: string; companyName: string;
  lastMessageAt: string; lastSnippet: string; unread: number;   // caller's-side unread
}
export interface ListThreadsResult { threads: ThreadDTO[]; total: number; page: number; pageSize: number; }
```

## Data required

- **`message_threads`** (one doc per application): `comp_id`, `application_id`, `candidate_user_id`,
  `recruiter_user_id`, `last_message_at`, `unread_candidate:int=0`, `unread_recruiter:int=0`, `created_at`.
  `job_title`/`company_name` denormalized (or joined) for the row. The DTO ships the **caller's-side** counter only.
- **Indexes** (`infra/db.py` `INDEXES`):
  - `("message_threads","application_id",{unique:True})` — the 1:1-with-application invariant authz relies on.
  - `("message_threads",[("candidate_user_id",1),("last_message_at",-1)])` — candidate inbox read path.
  - `("message_threads",[("comp_id",1),("last_message_at",-1)])` — company inbox read path.
- **Excluded from the DTO (grep-test):** internal Mongo handles, the opposite side's unread counter,
  `aptitude_config`/funnel internals.

## Errors & edge cases

- **UNAUTHENTICATED** — missing/invalid bearer.
- **PERMISSION_DENIED** — candidate listing another user's threads (cannot occur via the scoped query; defense at the
  servicer). **Wrong-tenant recruiter** sees an empty list, not the other tenant's rows.
- **Empty state** — no threads yet → `threads: []` (FE renders "No messages"). A pre-message application is **absent**
  from `ListThreads`.
- `page_size` over 50 is clamped server-side (not an error).

## Cross-references

- Restates `../../v2-screens/messaging.md` Part A (`MessagingService`).
- Pairs with `../message-thread/backend_message-thread.md` (`SendMessage`/`ListMessages`/`MarkRead`).
- Shared invariant: thread is **1:1 with `application_id`**; **funnel untouched** (no `ApplicationState`/`FunnelEvent`).
