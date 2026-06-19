# Inc 4 — Messaging (candidate ↔ recruiter) — Design

> **Pillar D of v2** (Comms & Candidate Growth). Read the canonical
> `docs/superpowers/v2/2026-06-19-v2-architecture-overview-design.md` first — esp. §5 Pillar D and
> §7 (data ownership + the funnel as the integration seam). This spec details the **messaging**
> half of Pillar D; the in-app **notifications center** is its sibling
> (`…-notifications-center-design.md`), and the two share the "new message" notify trigger. The TDD
> build is `docs/superpowers/v2/2026-06-19-messaging.md`.
>
> **Status:** design, awaiting review. No production code yet (v2 build is a later, separately
> green-lit phase). **Local-only project; never run git/gh.**

---

## 1. Goal & scope

Give a candidate and the recruiting team a place to **talk about a specific application**. Today the
funnel speaks *at* the candidate (one-way `TransitionNotifier` emails on state changes) and the
recruiter has no channel back except a decision. Inc 4 adds a **two-party thread, one per
application**, so a recruiter can ask a clarifying question ("are you open to relocating?") and a
candidate can reply — without leaving the platform, and without a side-channel that bypasses tenancy
or audit.

**In scope (v1):**

- **One `MessageThread` per application** — created lazily on the first message, scoped by `comp_id`
  **and** `application_id`. The two participants are fixed: the application's `candidate_user_id` and
  a company user (`recruiter_user_id`, any `company_admin`/`recruiter` of that `comp_id`).
- **Send** via a new authed gRPC-web `MessagingService` on **admin** (admin owns Mongo).
- **Receive** via **short-poll** (TanStack Query `refetchInterval`) over `ListMessages` for v1 —
  deliberately simple, no new infrastructure. **SSE is a documented enhancement** (§3.4), reusing the
  existing chat SSE pattern, *not* a v1 deliverable.
- **Unread tracking** per side (`unread_candidate` / `unread_recruiter`), so both apps can show a
  badge and the notifications center can fan out a "new message" row.
- **Surfaces:** a candidate `app/messages/` inbox + per-application thread; a **company
  applicant-view inbox tab**. Both render the existing `@ip/ui` chat surface; a new
  `@ip/shared/messages.ts` client wraps the gRPC-web calls + the poll loop.
- **Erasure cascade entry (Inc 0):** threads + messages join the `CandidateEraser` cascade.
- **A new notify trigger:** an inbound message fires the notifications center's "new message"
  notification (email + in-app row) for the *other* party.

**Out of scope / explicit non-goals:**

- **No new realtime infrastructure** — no WebSocket server, no LiveKit, no message broker for
  messaging fan-out. Poll now; SSE later **reuses the existing ai-agents SSE transport** (§3.4) if
  poll latency ever bites.
- **No group / multi-thread-per-application** — exactly two participants, one thread per application
  (this is what makes authz trivial; see §3.2).
- **No attachments / file upload** in v1 (free-text only). A presigned-upload attachment path is a
  clean follow-up behind the same storage seam the resume/logo paths use.
- **No cross-application or "general" candidate↔company DMs** — a thread is always anchored to an
  application, so there is always a `comp_id` + `application_id` to scope and erase by. No
  unanchored inbox.
- **No editing / deleting individual messages** (an audit-friendly append-only log); erasure is the
  candidate-rights path, not a per-message delete UI.
- ID/background/biometric data — excluded platform-wide (overview §2); a message is free text,
  scoped + erasable, carrying none of those regimes.

---

## 2. Where it fits

```
   Candidate app ─┐   gRPC-web (authed)      ┌──────────────────────────────────────┐
   (Next.js)      ├────────────────────────►│  ADMIN  (owns MongoDB, source of truth)│
   Company app ───┘   send + list + poll     │  • MessagingService (NEW servicer)     │
                  ◄───── poll (refetchInterval)│    SendMessage / ListThreads /         │
                                             │    ListMessages / MarkRead             │
                                             │  resources/messaging.py  ──────────────┤
                                             │   _thread_scoped / _participant guards  │
                                             │   reuse decision._scoped / aptitude._owned
                                             └───────┬───────────────────┬────────────┘
                                  best-effort notify │                   │ Mongo
                                  (new message) ─────┘                   ▼
                                  → notifications center        message_threads + messages
                                    (email + in-app row)        (comp_id + application_id scoped)
```

- **admin owns MongoDB and the send path.** The browser reaches `MessagingService` over the existing
  in-process gRPC-web transport (uvicorn, no proxy) — the same surface as `DecisionService` /
  `AptitudeService`. **No new service**; messaging is a new *capability* on admin: one servicer, one
  resource module, two repositories, two model docs.
- **The resource layer is the contract** (the established convention — see `resources/decision.py`,
  `resources/aptitude.py`). All authz, tenancy scoping, unread bookkeeping, and DTO shaping live in
  `resources/messaging.py`; the servicer is a thin adapter. **No query/authz logic in the servicer.**
- **The funnel is untouched.** Messaging adds no `FunnelEvent`, no state, no CAS path — it is a
  side-table keyed by `application_id`, never a funnel side-channel. It does fire **one** outbound
  signal: a best-effort "new message" notification (the same best-effort pattern `advance_application`
  uses for `TransitionNotifier` — swallow + log on failure, never block the send).

---

## 3. Design

### 3.1 Data model

Two new collections, both **scoped by `comp_id` + `application_id`**, `comp_id` always derived from
the **authenticated token / the application doc, never client input** (PRODUCTION_STANDARDS §2). New
Pydantic models in `src/admin/app/model/message.py`, mirroring `model/aptitude.py`:

**`MessageThread`** — one per application (the index makes this an invariant, §3.5):

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | Thread id. |
| `comp_id` | `str` | Tenant. Copied from the application doc on create. |
| `application_id` | `str` | The anchor. **Unique** → exactly one thread per application. |
| `candidate_user_id` | `str` | From the application doc (the fixed candidate participant). |
| `recruiter_user_id` | `str` | The company user who opened the thread (display/attribution; **any** manager of `comp_id` may post — authz is by `comp_id`, not this field; see §3.2). |
| `last_message_at` | `datetime \| None` | Sort key for the inbox list; stamped on every send. |
| `unread_candidate` | `int` (default 0) | Unread count for the candidate (incremented when the recruiter sends, zeroed on the candidate's `MarkRead`). |
| `unread_recruiter` | `int` (default 0) | Symmetric, for the company side. |
| `created_at` | `datetime` | `default_factory` now. |

**`Message`** — append-only:

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | Message id. |
| `thread_id` | `str` | Parent thread. |
| `comp_id` | `str` | Denormalized from the thread (so a message is erasable/scopable without a thread join). |
| `application_id` | `str` | Denormalized (same reason). |
| `sender_role` | `"candidate" \| "recruiter"` | Which side sent it (drives left/right bubble + which unread counter to bump). |
| `sender_user_id` | `str` | The actual author (a specific recruiter, for attribution). |
| `body` | `str` | **Free text.** Length-capped at the boundary (see §3.6); this is candidate-authored input, so it is validated, never trusted. |
| `created_at` | `datetime` | `default_factory` now; the thread order key. |
| `read_at` | `datetime \| None` | Set when the *other* side reads past this message (advisory; the per-thread unread counters are the source of truth for badges). |

> **Why denormalize `comp_id` + `application_id` onto every `Message`.** Both the erasure cascade and
> any tenant-scoped read can act on `messages` directly (a single `delete_many` / `find` by
> `application_id` or `comp_id`) without first resolving the thread — the same denormalization
> `AptitudeAttempt` uses (it carries `comp_id` even though it has `application_id`). One extra field
> per row buys cascade simplicity and removes a join from the hot read.

### 3.2 Authz — why "one thread per application" makes it trivial

The single-thread-per-application rule collapses authorization to the **existing application-scoping
helpers**, reused verbatim:

- **Candidate side** → reuse `aptitude._owned(identity, application_id, applications)`: the caller
  must be the application's `candidate_user_id`, else `ForbiddenError`/`NotFoundError`. A candidate
  can only ever touch *their own* application's thread.
- **Company side** → reuse `decision._scoped(identity, application_id, applications)` + the
  `_require_manager` role gate (`company_admin`/`recruiter`): the application's `comp_id` must equal
  the caller's `comp_id`, else `NotFoundError`. Any manager of the owning company may read/post the
  thread (recruiting is a team activity — attribution is per-message via `sender_user_id`, but the
  *capability* is company-scoped, exactly like decisions today).

So there is **no new authz primitive**. `resources/messaging.py` adds one tiny wrapper —
`_thread_for(identity, application_id, ...)` — that branches on `identity["role"]`, calls the
matching existing helper to authorize against the **application**, then loads-or-creates the thread
for that application. Because the thread is 1:1 with an already-authorized application, authorizing
the application *is* authorizing the thread. This is the central guardrail and the reason the model
is shaped this way.

### 3.3 Transport — POST-to-send (gRPC-web) + short-poll receive (decision + rationale)

**Decision: send over the existing authed gRPC-web `MessagingService` on admin; receive by
short-polling `ListMessages` via TanStack Query `refetchInterval` for v1. SSE is a documented,
deferred enhancement (§3.4). No new realtime infrastructure either way.**

Three options were weighed:

| Option | What it'd take | Verdict |
|---|---|---|
| **WebSocket / push channel** | A new stateful WS server (or LiveKit reuse) holding per-user connections + a fan-out bus. New infra to run, secure, scale, and reconnect. | **Rejected.** Overview §5/§2: "no new websocket infra". Disproportionate for demo-scale, two-party, low-frequency threads. |
| **SSE (server-sent events)** | Reuse the chat SSE pattern — but the chat stream lives on **ai-agents** (`/chat/turn`, `StreamingResponse`, `text/event-stream`), because admin's gRPC-web translator is **unary-only** (documented in `frontend/packages/shared/src/chat.ts`). Messaging data lives in **admin's Mongo**, which ai-agents reaches only via mcp-data. So SSE-for-messages means an ai-agents endpoint that tails admin's data through mcp-data + a push/poll bridge — real plumbing. | **Deferred** (the right *next* step, not v1; see §3.4). |
| **POST-to-send + short-poll receive** ✅ | Send = one `MessagingService.SendMessage` gRPC-web unary (admin, owns Mongo, the surface we already have). Receive = `ListMessages` on a `refetchInterval` (e.g. 5 s when a thread is open, paused when the tab is hidden / window blurred). Unread badges = `ListThreads` polled on a slower cadence. | **Chosen for v1.** |

**Why poll-first-then-SSE is the right call here:**

1. **Send already has a home.** Admin owns Mongo and already serves authed unary gRPC-web. Sending a
   message is a unary write — a perfect fit for the existing transport, with `authedFetch`'s
   401-refresh, the existing `_STATUS` error mapping, and tenant scoping all free. No new transport
   for the *write* path under any option.
2. **The asymmetry is the whole point.** The hard part of any chat is the *receive/push* side. SSE's
   natural home (ai-agents) is the **wrong owner** for messaging data (admin owns it); bridging that
   for v1 buys latency we don't need at demo scale and adds a cross-service data path. Polling reads
   the source of truth **directly** from its owner.
3. **Poll cost is bounded and idiomatic.** TanStack Query already backs every authed read; a
   `refetchInterval` on an open thread (paused when hidden) is a few requests a minute over a capped,
   indexed `find` by `thread_id`. The thread-list badge poll is slower still. This is well within
   demo budget and needs zero new moving parts.
4. **SSE stays a clean, additive upgrade.** The FE client (`@ip/shared/messages.ts`) exposes a
   `subscribe(threadId, onMessage)` seam; v1 implements it as the poll loop. Swapping in an SSE
   stream later changes *only* that function — the `MessagingService` write path, the resource layer,
   the data model, and `ChatWindow` are untouched. We ship the simple thing and leave the seam.

The honest tradeoff: **poll latency** (a message can take up to one interval to appear) and a steady
trickle of idle requests. Both are acceptable for two-party, application-anchored threads at demo
scale, and §3.4 is the documented exit if they ever aren't.

### 3.4 SSE enhancement (documented, deferred — not built in v1)

When/if poll latency matters, add a **receive stream that reuses the existing chat SSE machinery**:

- **Reuse the frame contract.** `frontend/packages/shared/src/chat.ts` already implements SSE framing
  (`event:`/`data:` parsing, mid-stream `error` frames, `authedFetch` 401-refresh on the opening
  request, `try/finally` reader cleanup). A messages stream uses the **same frame handler shape** — a
  `message` event carrying `{thread_id, sender_role, body, created_at}` instead of a `text` token.
- **Owner question is explicit.** The stream endpoint lives on **ai-agents** (the only service that
  serves SSE today, because admin's gRPC-web is unary-only). It reads new messages for a thread via
  **mcp-data** (ai-agents is stateless; admin still owns the write). The simplest bridge is an
  ai-agents `GET /messages/{thread_id}/stream` that long-polls mcp-data for rows after a cursor and
  emits them as SSE frames — no broker, still no WebSocket.
- **The send path does not change.** Send stays `MessagingService.SendMessage` on admin. Only the
  *receive* seam (`subscribe`) flips from poll to stream. `ChatWindow` and the resource layer are
  untouched.

This is recorded so the v1 poll choice is visibly a *staged* decision, not a dead end.

### 3.5 Reusing `@ip/ui/chat-window`

The candidate↔recruiter thread renders through the **existing `ChatWindow`** (`@ip/ui`), which is
already a pure presentational layer (no `@ip/shared` dependency) that streams turns and rolls back on
error. Messaging uses it with a thin adapter:

- `ChatWindow.send(messages, handlers)` is shaped for a streamed assistant turn. For messaging, the
  app passes a `send` that calls `MessagingService.SendMessage` (one unary write), then immediately
  invalidates/refetches the thread query so the new message appears via the same render path. (The
  `onCitation` handler is simply never called — messaging has no citations.)
- Incoming messages arrive through the **poll** (`refetchInterval` on `ListMessages`) and are mapped
  into `ChatWindow`'s `Turn[]` (`sender_role` → user/assistant bubble side). The optimistic
  reserve/rollback the window already does for the user's own message is preserved.
- **A small new wrapper** (`MessageThreadView`) may live in the app (or `@ip/ui`) to own the
  poll-driven `turns` state and feed `ChatWindow`; `ChatWindow` itself is reused unchanged. (Decide
  at planning whether the poll-state wrapper is app-local or promoted into `@ip/ui` — leaning
  app-local to keep `@ip/ui` presentation-only, consistent with its current posture.)

This keeps the chat UX (auto-scroll, typing affordance, error rollback, theming via the violet/dark
token system) identical to the assistant chat, for free.

### 3.6 Free-text PII → `comp_id`-scoped at the resource layer

A message body is **candidate-authored free text** and may contain PII. The handling rules:

- **Every row is `comp_id`-scoped.** `comp_id` is stamped onto the thread (from the application) and
  denormalized onto every message, so a tenant boundary is enforced on every read and the erasure
  cascade can purge by `comp_id`/`application_id`. A candidate's message is never readable
  cross-tenant.
- **Validated at the boundary, not trusted.** `body` is required, non-empty after trim, and
  **length-capped** (a configured max, mirroring the page-size / TTL clamps elsewhere) in
  `resources/messaging.send_message` before insert — candidate input is a contract surface
  (PRODUCTION_STANDARDS). No HTML is rendered: `ChatWindow` renders `body` as plain text
  (`whitespace-pre-wrap`), so a pasted `<script>` is inert text, not markup.
- **Joins the erasure cascade (Inc 0).** See §3.7 — this is the compliance follow-through that makes
  free-text PII safe to store.

### 3.7 Erasure cascade entry (Inc 0)

Messaging artifacts **must** join the `CandidateEraser` cascade (overview §6 calls this out by name:
"messages"). Concretely (`resources/compliance.py`):

- Add `threads` + `messages` repositories to `CandidateEraser.__init__` and to `make_eraser` in
  `routes/web.py` (alongside `reports`, `interviews`, `attempts`, `consents`).
- In `CandidateEraser.erase(user_id)`: resolve the candidate's applications (already loaded for the
  reports delete), then **delete all messages and threads for those applications** (by
  `application_id` — denormalized onto both docs, so it's a direct `delete_many`, no thread→message
  walk). A candidate's outbound message bodies are PII and are purged; the application tombstone the
  funnel relies on stays intact (messaging holds no funnel state).
- `MessageRepository.delete_by_applications(application_ids)` +
  `MessageThreadRepository.delete_by_applications(application_ids)` mirror
  `ReportRepository.delete_by_applications`.

The Inc-0 stub registers these collections in the cascade from day one (overview §8: "makes new
artifacts erasable from day one"); Inc 4 fills in the repositories.

---

## 4. Key decisions & tradeoffs

| Decision | Rationale | Tradeoff / mitigation |
|---|---|---|
| **One `MessageThread` per application** | Collapses authz to the existing `_owned`/`_scoped` application helpers — authorizing the application *is* authorizing the thread; no new authz primitive | No general/group DMs; every conversation must hang off an application (acceptable — that's also what makes it scopable + erasable) |
| **Send over admin gRPC-web; receive by short-poll** | Admin owns Mongo + already serves authed unary gRPC-web; polling reads the source of truth directly; **zero new infra** | Poll latency (≤1 interval) + idle request trickle; mitigated by pausing on hidden tab + the documented SSE upgrade (§3.4) |
| **SSE deferred, not adopted in v1** | SSE's only home today is **ai-agents** (admin gRPC-web is unary-only), but messaging data lives in **admin's Mongo** — so SSE means a cross-service data bridge ai-agents doesn't need yet | Recorded as a staged decision with a `subscribe()` seam so the upgrade touches one FE function, nothing else |
| **No WebSocket / broker for messaging** | Overview §5/§2 ("no new websocket infra"); disproportionate for two-party demo-scale threads | If realtime ever becomes a hard requirement, SSE (§3.4) is the next rung before any WS |
| **Reuse `@ip/ui/ChatWindow`** | Identical chat UX (scroll, rollback, theming) for free; it's already presentation-only | `send` is unary-then-refetch, not a stream; `onCitation` unused — both are no-ops, not forks |
| **Denormalize `comp_id` + `application_id` onto `Message`** | Tenant-scoped reads + the erasure cascade act on `messages` directly, no thread join (mirrors `AptitudeAttempt`) | One extra field per row; trivially worth it |
| **`unread_*` counters on the thread** | Cheap badge reads (`ListThreads` already returns them) + a clean "new message" notify trigger | Two counters to keep correct; incremented on send for the *other* side, zeroed on that side's `MarkRead` (both in the resource, under the same write) |
| **Append-only; no per-message edit/delete UI** | Audit-friendly; erasure is the candidate-rights path, not an edit affordance | Candidates can't unsend; acceptable, and consistent with the audit posture |
| **`body` validated + length-capped, rendered as plain text** | Candidate input is a contract surface; plain-text render makes pasted markup inert | A hard cap may truncate a very long paste (configurable) |

---

## 5. Testing approach

TDD throughout (failing test watched fail → implement → green), per PRODUCTION_STANDARDS §2. The gate
is `bash scripts/check.sh` (ruff format, lint+security S-rules line-88, pip-audit, pytest ×5);
**baseline 423 tests** must stay green and grow. Frontend verified by `npx pnpm@9.15.0 --filter
@ip/candidate build` + `--filter @ip/company build` + `--filter @ip/{ui,shared,api-client}
typecheck` (never `next build` while `pnpm dev` is live).

- **Resource layer (`resources/messaging.py`) — where most coverage lands (it is the contract):**
  - **Authz:** a candidate can send/read **only their own** application's thread (reuses `_owned`);
    a manager can send/read **only their `comp_id`'s** applications (reuses `_scoped` +
    `_require_manager`); a wrong-tenant manager → `NotFoundError`; a non-manager company role →
    `ForbiddenError`; a stranger candidate → `ForbiddenError`.
  - **Lazy thread creation:** first `SendMessage` for an application creates exactly one thread; a
    second send reuses it (unique-index conflict is impossible by construction, but assert single
    thread).
  - **Unread bookkeeping:** recruiter send increments `unread_candidate` (not `unread_recruiter`)
    and stamps `last_message_at`; the candidate's `MarkRead` zeroes `unread_candidate` and sets
    `read_at`; symmetric for the other direction.
  - **Validation:** empty/whitespace `body` → `ValidationError`; over-cap `body` → `ValidationError`.
  - **DTO subset:** the listed message/thread shape carries no internal handles beyond what the UI
    needs (no leaking of unrelated application fields).
- **gRPC servicer (`routes/messaging.py`):** mirror `test`s for the decision/aptitude servicers —
  `_STATUS` error mapping (Forbidden→PERMISSION_DENIED, NotFound→NOT_FOUND, Validation→
  INVALID_ARGUMENT), `caller_identity` wired, no authz logic in the adapter.
- **"New message" notify trigger:** `send_message` invokes the notification path **best-effort** —
  assert it's called for the *other* party on a successful send, and that a notifier raising does
  **not** fail the send (mirrors `advance_application`'s swallow-and-log around `TransitionNotifier`).
  (The notification row/email assertions live in the notifications-center spec/tests.)
- **Erasure cascade (Inc 0/4):** `CandidateEraser.erase` deletes the candidate's threads + messages
  (by application) while leaving the application tombstone; `delete_by_applications` on both repos.
- **Frontend:** `@ip/shared/messages.ts` client typechecks + the poll `subscribe` seam is exercised
  (a fake transport returns scripted messages; assert `ChatWindow` renders both sides and pauses the
  poll when hidden). No network in unit tests.
- **Manual / local E2E (Chrome via preview):** recruiter opens an applicant, sends a message → it
  appears in the candidate's `app/messages/` thread within one poll interval, the candidate's badge
  increments, the candidate replies → the recruiter's tab updates and unread clears on open; a "new
  message" email lands in the `LoggingNotifier` sink + an in-app notification row appears.

---

## 6. Open questions / risks

- **Poll latency vs. cost.** The default `refetchInterval` (open thread) and the slower thread-list
  badge cadence need tuning so latency feels live without a wasteful idle trickle. *Mitigation:*
  pause polling on hidden tab / blurred window (TanStack `refetchIntervalInBackground: false`);
  documented SSE upgrade (§3.4) is the exit if latency bites. **Open:** the exact intervals (lean 5 s
  open / 30 s list) — confirm at planning.
- **`recruiter_user_id` semantics.** The field records *who opened* the thread, but **any** manager
  of the `comp_id` may post (authz is company-scoped). *Mitigation:* per-message `sender_user_id`
  carries true attribution; the thread field is display/first-contact only. **Open:** whether the UI
  should show the specific recruiter name per message or just "Hiring team" (lean per-message name on
  the company side, "Hiring team" on the candidate side) — confirm at planning.
- **Two read surfaces? (No.)** Unlike the marketplace, messaging has **one** surface (authed
  gRPC-web) — there is no public/anonymous read of a thread, so the public-surface drift risk does
  not apply here. Worth stating so a reviewer doesn't look for a `/public/*` twin.
- **Unread-counter correctness under concurrency.** Two managers reading + a candidate sending could
  race the counters. *Mitigation:* increment/zero are `$inc`/`$set` atomic updates in the resource
  under the same write that inserts/marks; the counter is advisory (badge), not a funnel invariant,
  so a transient off-by-one self-heals on the next `MarkRead`.
- **Notification fan-out coupling.** The "new message" trigger couples messaging to the notifications
  center. *Mitigation:* it's a **best-effort** call (swallow + log, exactly like the funnel→notifier
  seam), so a notifications outage never blocks a send.
- **Free-text abuse / spam.** A candidate or recruiter could flood a thread. *Mitigation (v1, light):*
  `body` length cap; per-sender rate-limit via `lib.redis.RateLimiter` (the same primitive
  `routes/oauth.py` uses) is a cheap add if needed — flagged, not built in v1.
