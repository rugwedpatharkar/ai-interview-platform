# Inc 4 — Messaging (candidate ↔ recruiter) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this task-by-task. Steps use `- [ ]` checkboxes.
> Spec: `docs/superpowers/v2/2026-06-19-messaging-design.md`. Canonical design:
> `docs/superpowers/v2/2026-06-19-v2-architecture-overview-design.md` (§5 Pillar D, §7).

**Goal:** A two-party message thread, **one per application**, scoped by `comp_id` + `application_id`.
**Send** via a new authed gRPC-web `MessagingService` on **admin** (owns Mongo); **receive** by
**short-poll** (`ListMessages` on a TanStack `refetchInterval`). Authz reuses the existing
application-scoping helpers (`aptitude._owned` for candidates, `decision._scoped` + `_require_manager`
for company). A new message fires a **best-effort** "new message" notification (notifications center).
Threads + messages **join the `CandidateEraser` cascade** (Inc 0). SSE is a documented enhancement,
**not built here** (spec §3.4). No new infra.

**Architecture:** New `resources/messaging.py` (the contract: authz + tenancy + unread bookkeeping +
DTO shaping) over two repositories (`messages`, `message_threads`) + two models. A thin
`MessagingServicer` adapts gRPC-web to the resource (mirrors `routes/decision.py`). The candidate↔
recruiter thread renders through the **existing `@ip/ui/ChatWindow`** with a unary-send-then-refetch
adapter; a new `@ip/shared/messages.ts` wraps the gRPC-web calls + a `subscribe()` poll seam.

## Global Constraints

- **LOCAL-ONLY — never run git/gh.** "Commit" steps are replaced by **"run the gate"**:
  `bash scripts/check.sh` (ruff format+lint S-rules line-88, pip-audit, pytest ×5) must stay green;
  baseline today is **423 tests**. Frontend verified by `npx pnpm@9.15.0 --filter @ip/candidate build`
  + `--filter @ip/company build` + `--filter @ip/{ui,shared,api-client} typecheck`. Never `next build`
  while `pnpm dev` is live.
- **Robustness bar:** validate at boundaries (the message `body` is candidate input — required,
  trimmed-non-empty, length-capped); trust internal typed calls (no defensive coercion); the
  "new message" notify call is **best-effort** (try/except + `get_logger` structured log, never
  blocks the send — mirror `advance_application`'s wrap around `TransitionNotifier`). Follow
  `~/.claude/CLAUDE.md` (minimal, trust-the-system, validate-at-boundaries) and
  `docs/superpowers/plans/PRODUCTION_STANDARDS.md`.
- **Authz reuse (do NOT invent a new primitive):** candidate path → `aptitude._owned`; company path →
  `decision._scoped` + `decision._require_manager`. Authorize against the **application**; the thread
  is 1:1 with it (spec §3.2).
- **Funnel untouched:** no new `ApplicationState`/`FunnelEvent`, no CAS path. Messaging is a side-table
  keyed by `application_id`.
- **Resource is the contract:** no authz/tenancy/DTO logic in the servicer or any FE adapter.
- **Ordering with notifications:** this plan adds the **best-effort call**; the notification **row +
  email** assertions live in `…-notifications-center.md`. If that increment lands first, call its
  `notify_event`; if not, land a tiny local notifier stub behind the same interface and swap later
  (flag at handoff).

---

## File structure (new + modified)

```
src/admin/app/
  model/message.py                         (NEW — MessageThread + Message pydantic models)
  infra/repositories/
    message_threads.py                     (NEW — MessageThreadRepository + delete_by_applications)
    messages.py                            (NEW — MessageRepository + delete_by_applications)
  infra/db.py                              (+INDEXES: message_threads, messages)
  resources/messaging.py                   (NEW — the contract: authz + unread + DTO + best-effort notify)
  resources/compliance.py                  (CandidateEraser: +threads/+messages cascade)
  routes/pb/messaging.proto                (NEW) + generated messaging_pb2*.py (via pnpm gen / buf)
  routes/messaging.py                      (NEW — MessagingServicer, thin adapter)
  routes/web.py                            (+register MessagingServicer; +threads/+messages in make_eraser)

src/admin/tests/
  test_resources_messaging.py              (NEW — authz, lazy thread, unread, validation, DTO)
  test_routes_messaging.py                 (NEW — servicer status mapping + caller_identity)
  test_resources_compliance.py             (extend — erase deletes threads+messages)
  conftest.py                              (+fake message/thread repos if the suite uses fakes)

frontend/packages/api-client/src/
  index.ts                                 (+messaging_pb import/re-export; +MessagingService in ApiClients + BOTH clientsFromTransport returns)
frontend/packages/shared/src/
  messages.ts                              (NEW — createMessagesClient: send/listThreads/listMessages/markRead + query-key helpers + subscribe() poll seam)
  index.ts                                 (+export createMessagesClient + re-export MessageDTO/ThreadDTO)
frontend/apps/candidate/
  lib/use-thread-messages.ts               (NEW — poll + optimistic send + mark-read hook; the shared data seam)
  components/message-thread-view.tsx       (NEW — app-local chat re-skin fed by the hook; NOT a ChatWindow wrapper)
  components/candidate-shell.tsx           (+/messages nav entry + total-unread Badge)
  app/messages/page.tsx                    (NEW — candidate inbox: thread list, list-cadence poll, unread badges)
  app/messages/[applicationId]/page.tsx    (NEW — a thread → MessageThreadView side="candidate")
frontend/apps/company/
  lib/use-thread-messages.ts               (NEW — thin duplicate; identical hook body, side defaults differ)
  components/message-thread-view.tsx       (NEW — thin duplicate of the candidate re-skin)
  app/jobs/[id]/applicants/[appId]/page.tsx (MODIFY — wrap in Tabs: Report (existing) + Messages → MessageThreadView side="recruiter"; tab unread Badge)
```

**Responsibilities (one job each):** `resources/messaging.py` = all logic (authz/tenancy/unread/DTO/
best-effort notify). `routes/messaging.py` = gRPC adapter only. `messages.ts` = transport + query
keys + the `subscribe()` poll seam (the single SSE swap point). `use-thread-messages.ts` = the
poll/optimistic-send/mark-read behavior (shared data seam). `message-thread-view.tsx` = an app-local
re-skin of the chat surface driven by that hook — **`@ip/ui` `ChatWindow` is closed (owns its own
state) and is intentionally NOT reused as a node here; it is mirrored presentationally** (see Tier D).

---

## TIER A — data + the resource contract (the core; pure-logic, fully unit-tested)

### Task 1 — models + repositories + indexes
**Files:** Create `model/message.py`, `infra/repositories/message_threads.py`,
`infra/repositories/messages.py`; Modify `infra/db.py`.
**Deliverable:** the two collections + their indexes exist; repos expose the reads/writes the resource
needs + the cascade deletes.

- [ ] **Step 1 — `model/message.py`** — `MessageThread` (`comp_id`, `application_id`,
  `candidate_user_id`, `recruiter_user_id`, `last_message_at: datetime|None`,
  `unread_candidate: int = 0`, `unread_recruiter: int = 0`, `created_at` default-now) and `Message`
  (`thread_id`, `comp_id`, `application_id`, `sender_role`, `sender_user_id`, `body`,
  `created_at` default-now, `read_at: datetime|None`). Mirror `model/aptitude.py` field style
  (pydantic `BaseModel` + `Field(default_factory=...)`).
- [ ] **Step 2 — repositories** (extend `lib.mongodb.BaseRepository`, mirror
  `aptitude_attempts.py`): `MessageThreadRepository(collection="message_threads")` with
  `get_by_application(application_id)`, `create(thread)`, `bump_unread(thread_id, side)`
  (`$inc` the side's counter + `$set last_message_at`), `mark_read(thread_id, side)` (`$set` the
  side's counter to 0), and `delete_by_applications(application_ids)`. `MessageRepository(
  collection="messages")` with `insert(message)`, `list_by_thread(thread_id, *, limit, before?)`
  (capped, desc/asc decided at use), `mark_read_through(thread_id, reader_role, now)` (set `read_at`
  on the other side's unread rows), and `delete_by_applications(application_ids)` (mirror
  `ReportRepository.delete_by_applications`).
- [ ] **Step 3 — indexes** in `infra/db.py` `INDEXES` (it is the single index authority):
```python
# messaging — one thread per application (the 1:1 invariant authz relies on)
IndexSpec("message_threads", "application_id", {"unique": True}),
IndexSpec("message_threads", "comp_id"),
IndexSpec("message_threads", [("candidate_user_id", 1), ("last_message_at", -1)]),  # candidate inbox
IndexSpec("message_threads", [("comp_id", 1), ("last_message_at", -1)]),            # company inbox
# messages — thread read path + cascade/scoped deletes
IndexSpec("messages", [("thread_id", 1), ("created_at", 1)]),
IndexSpec("messages", "application_id"),   # erasure cascade + tenant-scoped purge
```
- [ ] **Step 4 — gate:** `bash scripts/check.sh` green (models/repos are import-only; no behavior yet).

### Task 2 — `resources/messaging.send_message` (TDD — lazy thread + unread + validation)
**Files:** Create `resources/messaging.py`; Test `tests/test_resources_messaging.py`.
**Interfaces — Produces:** `async send_message(identity, application_id, body, *, applications,
threads, messages, notifier=None, clock=_utcnow) -> dict` (the new message DTO). **Consumes:**
`aptitude._owned`, `decision._scoped` + `decision._require_manager`.

- [ ] **Step 1 — failing tests** (mirror `test_resources_*` style; fakes/in-memory repos):
  - candidate sends → a thread is **created** (one), the message is inserted with
    `sender_role="candidate"`, `comp_id`/`application_id` denormalized, `unread_recruiter` incremented,
    `last_message_at` stamped.
  - recruiter (manager of the `comp_id`) sends → same, but `unread_candidate` incremented,
    `sender_role="recruiter"`.
  - a **second** send reuses the existing thread (still exactly one thread); whichever side sends
    **first creates** the thread (a candidate-first send creates with `recruiter_user_id` unset; a
    manager-first send stamps it to that manager).
  - empty/whitespace `body` → `ValidationError`; **`body` of exactly `MAX_BODY` chars passes,
    `MAX_BODY + 1` → `ValidationError`** (boundary assertion on the 4 KB cap).
  - **sender identity from the token:** the inserted message's `sender_user_id` equals
    `identity["id"]` (assert a caller cannot set someone else's id — there is no client field for it).
  - a **non-owner candidate** → `ForbiddenError`; a **wrong-`comp_id` manager** → `NotFoundError`; a
    **non-manager company role** → `ForbiddenError` (these come straight from the reused helpers).
- [ ] **Step 2 — run** `(cd src/admin && ../../.venv/bin/python -m pytest tests/test_resources_messaging.py -v)` → FAIL.
- [ ] **Step 3 — implement.** A private `_thread_for(identity, application_id, *, applications,
  threads)` branches on role: candidate → `await aptitude._owned(identity, application_id,
  applications)`; manager → `decision._require_manager(identity)` then
  `await decision._scoped(identity, application_id, applications)`. Then
  `get_by_application(...) or create(...)` — **lazy thread creation: the first sender is the creator**
  (copy `comp_id`/`candidate_user_id` from the application; set `recruiter_user_id` to the caller on
  first *manager* contact, leave it unset/display-only if the candidate sends first — authz never reads
  it). Define `MAX_BODY = 4_096` as a **module constant** at the top of `resources/messaging.py`.
  `send_message` validates `body` (trim, non-empty, `len(body) <= MAX_BODY` else `ValidationError`),
  sets `sender_user_id` **from `identity` (the token), never from any client field** (no impersonation),
  inserts the `Message` (`read_at=None`), bumps the **recipient's** unread + `last_message_at` in one
  atomic thread update, then **best-effort** notifies the other party (Task 6). Return the new-message
  DTO. **Reuse** the helpers — do not duplicate authz.
- [ ] **Step 4 — run → PASS.** Add the validation + authz negative cases.
- [ ] **Step 5 — gate green.**

### Task 3 — `list_threads` + `list_messages` + `mark_read` (TDD — reads + unread clear)
**Files:** Modify `resources/messaging.py`; Test `tests/test_resources_messaging.py`.
**Interfaces — Produces:** `list_threads(identity, *, applications, threads, page, page_size)`,
`list_messages(identity, application_id, *, applications, threads, messages, page, page_size)`,
`mark_read(identity, application_id, *, applications, threads, messages, clock)`.

- [ ] **Step 1 — failing tests:**
  - candidate `list_threads` returns only **their** threads (desc by `last_message_at`); manager
    `list_threads` returns only their **`comp_id`**'s threads; page-size **clamped**.
  - `list_messages` for an application returns its messages in order, page-size clamped, **authz
    reused** (non-owner candidate → Forbidden; wrong-tenant manager → NotFound).
  - **read state (design §3.8 — the counter is the badge truth, `read_at` is advisory):** `mark_read`
    by the candidate `$set`s `unread_candidate` to **0** (the badge source) **and** stamps `read_at=now`
    on the **recruiter's** previously-unread messages (the advisory per-row stamp); symmetric for the
    manager. The **opposite** side's counter is untouched. Assert the badge value derives **only** from
    the counter — no test computes a badge from `read_at` — and that an unread recruiter row stamped by
    the candidate's `mark_read` now carries `read_at != None`.
  - the DTO is a **strict subset** (no leaking of unrelated application fields / internal handles).
- [ ] **Step 2 — run → FAIL → implement → PASS.** `list_threads` chooses the repo query by role
  (`candidate_user_id` vs `comp_id`); both reads authorize per the reused helpers; `mark_read` calls
  `threads.mark_read(side)` (counter → 0) + `messages.mark_read_through(thread_id, reader_role, now)`
  (`read_at` on the other side's unread rows) — both under the one `mark_read` call so they can't drift.
- [ ] **Step 3 — gate green.**

---

## TIER B — transport: the gRPC-web service (proto → servicer → register)

### Task 4 — `messaging.proto` + generate the client
**Files:** Create `routes/pb/messaging.proto`; run the generator.
**Deliverable:** `messaging_pb2.py` / `messaging_pb2_grpc.py` (admin) + the TS client generated for
`@ip/api-client`.

- [ ] **Step 1 — `messaging.proto`** (`package admin.messaging.v1`; mirror `decision.proto` shape):
```proto
service MessagingService {
  rpc SendMessage(SendMessageRequest) returns (MessageDTO);
  rpc ListThreads(ListThreadsRequest) returns (ListThreadsResponse);
  rpc ListMessages(ListMessagesRequest) returns (ListMessagesResponse);
  rpc MarkRead(MarkReadRequest) returns (MarkReadResponse);
}
message SendMessageRequest { string application_id = 1; string body = 2; }
message MessageDTO {
  string id = 1; string application_id = 2; string sender_role = 3;
  string sender_user_id = 4; string body = 5; string created_at = 6; string read_at = 7;
}
message ThreadDTO {
  string application_id = 1; string candidate_user_id = 2; string recruiter_user_id = 3;
  string last_message_at = 4; int32 unread = 5;   // the caller's-side unread
}
message ListThreadsRequest { int32 page = 1; int32 page_size = 2; }
message ListThreadsResponse { repeated ThreadDTO threads = 1; int32 page = 2; int32 page_size = 3; int32 total = 4; }
message ListMessagesRequest { string application_id = 1; int32 page = 2; int32 page_size = 3; }
message ListMessagesResponse { repeated MessageDTO messages = 1; int32 page = 2; int32 page_size = 3; int32 total = 4; }
message MarkReadRequest { string application_id = 1; }
message MarkReadResponse { string application_id = 1; int32 unread = 2; }
```
- [ ] **Step 2 — generate** the Python stubs (same toolchain as the existing `pb/*` — buf/protoc) and
  the TS client via `npx pnpm@9.15.0 --filter @ip/api-client gen`. (Both are committed-style generated
  artifacts; regenerate, don't hand-edit.)
- [ ] **Step 3 — gate green** (generated stubs import cleanly).

### Task 5 — `MessagingServicer` (TDD — thin adapter) + register
**Files:** Create `routes/messaging.py`; Modify `routes/web.py`; Test `tests/test_routes_messaging.py`.
**Interfaces — Consumes:** `resources/messaging.*`, `caller_identity`, `_STATUS` (from `routes/auth`).

- [ ] **Step 1 — failing servicer tests** (mirror `test`s for the decision/aptitude servicers):
  `SendMessage` 200 returns the `MessageDTO` for an owner/manager; `ListThreads`/`ListMessages`/
  `MarkRead` shapes; **status mapping** via `_STATUS` (Forbidden→PERMISSION_DENIED, NotFound→
  NOT_FOUND, Validation→INVALID_ARGUMENT); `caller_identity` enforced (no token → unauthenticated).
- [ ] **Step 2 — implement** `MessagingServicer(decision-style)`: each RPC `try`s
  `identity = await caller_identity(context, self._tokens)`, calls the resource with injected repos,
  maps the result to the proto message, and `except AuthDomainError` → `self._abort(context, exc)`.
  **No authz/tenancy logic in the servicer** — it only adapts.
- [ ] **Step 3 — register in `routes/web.py`:** add
  `messaging_pb2_grpc.add_MessagingServiceServicer_to_server(MessagingServicer(applications=
  ApplicationRepository(db), threads=MessageThreadRepository(db), messages=MessageRepository(db),
  tokens=tokens, notifier=transition_notifier), app)` (thread the same `transition_notifier` the
  decision/application servicers already receive, so "new message" can fan out). Add the
  `messaging_pb2_grpc` import to the `pb` import block.
- [ ] **Step 4 — run → PASS; gate green.**

---

## TIER C — wiring: notify trigger + erasure cascade

### Task 6 — best-effort "new message" notify trigger
**Files:** Modify `resources/messaging.py` (+ tests).
**Interfaces — Consumes:** the notifications center's `notify_event` (see
`…-notifications-center.md`) **if landed**; else a local notifier-shaped stub.

- [ ] **Step 1 — failing test:** a successful `send_message` calls the notifier for the **other**
  party (candidate-send → notify the recruiter side; recruiter-send → notify the candidate) with
  `kind="new_message"` + the application's `comp_id`; a notifier that **raises** does **not** fail the
  send (assert the message is still inserted + the unread bumped) — mirror `advance_application`'s
  swallow-and-log around `TransitionNotifier`.
- [ ] **Step 2 — implement:** wrap the notify call in `try/except Exception: log.exception(...)`
  after the insert+unread-bump (best-effort, never before — the durable write happens first). The
  recipient resolution: candidate-send → the thread's company side (notify by `comp_id`/recruiter
  context per the center's contract); recruiter-send → the thread's `candidate_user_id`.
- [ ] **Step 3 — run → PASS; gate green.** (Cross-reference: the **row + email** assertions live in
  the notifications-center suite; here we only assert the **call** + the best-effort swallow.)

### Task 7 — erasure cascade entry (Inc 0 follow-through)
**Files:** Modify `resources/compliance.py`, `routes/web.py`; extend `tests/test_resources_compliance.py`.

- [ ] **Step 1 — failing test:** `CandidateEraser.erase(user_id)` deletes **all threads + messages
  for that candidate's applications** (by `application_id`) while the application tombstone + audit
  stay intact.
- [ ] **Step 2 — implement:** add `threads` + `messages` to `CandidateEraser.__init__` + `make_eraser`
  (alongside `reports`/`interviews`/`attempts`/`consents`); in `erase`, after computing the
  candidate's `application_ids` (already gathered for the reports delete), call
  `messages.delete_by_applications(application_ids)` + `threads.delete_by_applications(
  application_ids)`. (If the Inc-0 stub already registered these collections, just fill the repos in.)
- [ ] **Step 3 — run → PASS; gate green.**

---

## TIER D — frontend: client + surfaces (reuse the `@ip/ui` chat surface; poll receive)

> **Grounding (read before coding).** `@ip/ui` `ChatWindow`
> (`frontend/packages/ui/src/chat-window.tsx`) is a **closed, self-driving** component: it owns its
> own `useState<Turn[]>([])`, exposes **only** a streaming `send(messages, handlers)` prop, and has
> **no** prop to inject externally-fetched history. There is therefore **no supported way to feed a
> poll-fetched message list into `ChatWindow` as-is** (the current draft's "map messages → `Turn[]`
> and pass to ChatWindow" is not achievable against the component as written). The build instead
> follows the spec's *app-local wrapper* decision (design §3.5: "lean app-local to keep `@ip/ui`
> presentation-only"): **`MessageThreadView` is a new app-local component that renders the
> poll-driven list + composer directly, reusing `ChatWindow`'s exact presentational vocabulary**
> (bubble layout, `whitespace-pre-wrap break-words`, the violet/dark token classes, auto-stick
> scroll, in-flight latch, optimistic-then-rollback). `@ip/ui` stays untouched in this increment.
> The shared client (`@ip/shared/messages.ts`) and the `MessagingService` write path are reused
> verbatim — only the *presentation* is a thin, faithful re-skin of the chat surface rather than the
> literal `ChatWindow` node. If a reviewer would rather add a thin `messages`-shaped prop to
> `ChatWindow`, that is a **separate `@ip/ui` change**, explicitly out of scope here.
>
> **Consumption pattern (confirmed against the codebase):** every authed read/write goes through
> `useAuth().api` (the typed `ApiClients`); `chat`/`jd` are module singletons in each app's
> `lib/auth.tsx`. The messages client wraps the **gRPC-web `ApiClients`** (not REST), so it is
> built per-render from the hook — `const messages = useMemo(() => createMessagesClient(api), [api])`
> — not a module singleton. `useQuery({ queryKey, queryFn, refetchInterval })`,
> `queryClient.invalidateQueries`, `toast`, and `@ip/ui` `LoadingState`/`ErrorState`/`EmptyState`/
> `Alert` are the established building blocks (see `dashboard.tsx`, `applicants-table.tsx`,
> `jobs/[id]/applicants/[appId]/page.tsx`).

### Task 8 — `@ip/shared/messages.ts` + api-client wiring
**Files:** Create `frontend/packages/shared/src/messages.ts`; Modify `frontend/packages/shared/src/index.ts`,
`frontend/packages/api-client/src/index.ts`.
**Interfaces — Produces:** `createMessagesClient(api: ApiClients)` returning
`{ send, listThreads, listMessages, markRead, threadQueryKey, listQueryKey, subscribe }`. Types:
`MessageDTO`, `ThreadDTO` (re-exported from `@ip/api-client`'s generated `messaging_pb`).

- [ ] **Step 1 — api-client (after `pnpm gen`):** in `frontend/packages/api-client/src/index.ts`
  add the generated `messaging_pb` to (a) the import block, (b) the `export * from "./gen/
  messaging_pb.js"` re-export list, (c) the `ApiClients` interface as
  `messaging: Client<typeof MessagingService>`, and (d) **both** `clientsFromTransport`'s return
  object — mirroring `decisions`/`recommendations` exactly. (`createApiClients` delegates to
  `clientsFromTransport`, so it needs no edit.)
- [ ] **Step 2 — `messages.ts`** (mirror the shape of `interview.ts`/`jd.ts` — a `create*Client`
  factory closing over the client). The query-key helpers are **exported and owned here** so the
  view layer and the cache invalidation never drift:
  - `listQueryKey = () => ["messages", "threads"] as const`
  - `threadQueryKey = (applicationId: string) => ["messages", "thread", applicationId] as const`
  - `listThreads()` → `api.messaging.listThreads({})` → `res.threads` (`ThreadDTO[]`).
  - `listMessages(applicationId)` → `api.messaging.listMessages({ applicationId })` →
    `res.messages` (`MessageDTO[]`, server returns thread order; the view renders ascending).
  - `send(applicationId, body)` → `api.messaging.sendMessage({ applicationId, body })` →
    `MessageDTO`. Errors surface as connect `ConnectError` (the same class `errorMessage`/`isCode`/
    `isNotFound` already classify) — **no try/except here**; the React layer renders the error.
  - `markRead(applicationId)` → `api.messaging.markRead({ applicationId })` → `MarkReadResponse`
    (`{ applicationId, unread }`).
  - `subscribe(applicationId, onMessages)` — **the v1 poll seam / SSE swap point (design §3.4).**
    It is **not** a self-running loop. It returns `{ queryKey: threadQueryKey(applicationId),
    queryFn: () => listMessages(applicationId) }` so the React layer drives cadence via
    `refetchInterval` + `refetchIntervalInBackground: false`. Document inline: *"v1 = short-poll;
    swapping to SSE (§3.4) replaces ONLY this function's body — it would open the ai-agents
    `/messages/{id}/stream`, parse frames with the same handler shape as `chat.ts`, and call
    `onMessages`. The write path, query keys, and `MessageThreadView` are untouched."* (`onMessages`
    is the SSE-era callback; in v1 the poll feeds the cache instead, so it is currently unused —
    keep the parameter to fix the seam's signature now and avoid a breaking change later.)
- [ ] **Step 3 — barrel + typecheck:** export `createMessagesClient` and re-export `MessageDTO`/
  `ThreadDTO` from `frontend/packages/shared/src/index.ts` (alongside `createChatClient`); run
  `npx pnpm@9.15.0 --filter @ip/api-client typecheck` then `--filter @ip/shared typecheck` green
  (api-client first — shared depends on its generated types).

### Task 9 — `MessageThreadView` + `useThreadMessages` hook (candidate app)
**Files:** Create `frontend/apps/candidate/components/message-thread-view.tsx`,
`frontend/apps/candidate/lib/use-thread-messages.ts`,
`frontend/apps/candidate/app/messages/page.tsx`,
`frontend/apps/candidate/app/messages/[applicationId]/page.tsx`. Modify
`frontend/apps/candidate/components/candidate-shell.tsx` (nav entry + badge).

- [ ] **Step 1 — `useThreadMessages(applicationId, side)` hook** (`lib/use-thread-messages.ts`) —
  encapsulates the poll + send + mark-read so **both apps reuse identical data logic** (this is the
  shared seam; the *view* below is duplicated thin per app per the repo's app-local convention, but
  the hook is the single source of behavior). Internals:
  - `const { api } = useAuth(); const messages = useMemo(() => createMessagesClient(api), [api]);`
  - **Receive (poll):** `const q = useQuery({ ...messages.subscribe(applicationId, () => {}),
    refetchInterval: 5_000, refetchIntervalInBackground: false });` — 5 s open cadence, **paused on
    hidden tab** (the §3.4 / Risks requirement). `staleTime` inherits the 30 s default
    (`makeQueryClient`); that is fine — `refetchInterval` drives liveness.
  - **Optimistic send + reconcile (mirror `ChatWindow`'s reserve/rollback):** a synchronous
    `inFlight` ref-latch (copy the `dashboard.tsx`/`ChatWindow` pattern — survives same-tick
    double-submit / StrictMode); on submit, `setOptimistic((cur) => [...cur, { id: tmpId, side:
    "self", body, pending: true }])`, call `messages.send(...)`, then on success
    `queryClient.invalidateQueries({ queryKey: messages.threadQueryKey(applicationId) })` **and**
    `invalidateQueries({ queryKey: messages.listQueryKey() })` (so the inbox `last_message_at`/unread
    refresh) and clear the optimistic row (the refetch now carries the real `MessageDTO`); on error,
    drop the optimistic row, restore the input text, and surface `errorMessage(err)` as send-failed.
    Expose `{ messages: q.data ?? [], optimistic, isLoading, isError, error, refetch, send,
    sending }`.
  - **Mark-read on open / on new inbound:** a `useEffect` keyed on
    `[applicationId, q.data?.length]` that, when the thread is open and there is unread for `side`,
    fires `messages.markRead(applicationId)` then invalidates `listQueryKey()` (clears the nav/inbox
    badge). Guard with a ref so it doesn't loop on every poll tick when count is unchanged. Make this
    **best-effort** in spirit (a failed mark-read just leaves the badge — never throw into render).
- [ ] **Step 2 — `MessageThreadView({ applicationId, side })`** (`message-thread-view.tsx`, a
  `"use client"` component) — consumes `useThreadMessages` and renders the chat surface as a faithful
  re-skin of `ChatWindow` (do **not** wrap `ChatWindow`; see the Tier-D grounding note):
  - **List:** a scroll container (`flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto`) of bubbles;
    `m.sender_role === side` → right/`self` (primary bubble, `flex-row-reverse self-end`,
    `rounded-tr-sm bg-primary text-primary-foreground`), else left/`other`
    (`self-start`, `rounded-tl-sm bg-surface-muted text-foreground`). Body in
    `<p className="whitespace-pre-wrap break-words">` (plain text — pasted markup is inert, design
    §3.6). Append the `optimistic` rows after `messages`, rendered with reduced opacity while
    `pending`. Reuse `ChatWindow`'s auto-stick-to-bottom `useEffect`/`onScroll`/`atBottom` logic +
    the "scroll to latest" affordance verbatim.
  - **Sender label/attribution (design §6 open item — resolve here):** on the **candidate** side the
    other party shows as **"Hiring team"**; on the **company** side, the candidate shows as
    **"Candidate"** and own/team messages may show the per-message `sender_user_id` handle. A small
    avatar (`User` for self, `Building2`/`Users` lucide for the other side — **import lucide icons in
    the app**, never re-export through `@ip/ui`; see the lucide-must-be-in-app memo).
  - **Composer:** the `ChatWindow` form (an `@ip/ui` `Input` + icon `Button` with `Send`), `disabled`
    while `!input.trim() || sending`, submit calls the hook's `send`. **Client-side guard mirrors the
    server cap** — trim + a `MAX_BODY` length check (same constant intent as the resource's cap) so
    the over-long paste is caught before the round-trip; the resource remains the authority.
  - **`aria-live`:** wrap the message list in `<div role="log" aria-live="polite"
    aria-relevant="additions">` so newly-polled inbound messages are announced to screen readers
    (the assistant chat streams into a single turn and doesn't need this; a poll-driven thread that
    grows by whole messages does). Keep the composer in a `<form>` with the `Send` button carrying
    `aria-label="Send message"` (as `ChatWindow` does).
  - **States:** `isLoading` → `LoadingState` (or three skeleton bubbles); empty (loaded, zero
    messages, no optimistic) → `EmptyState title="No messages yet" description="Start the
    conversation below."`; `isError` → inline `ErrorState message={errorMessage(error)} retry=
    {refetch}`; **send-failed** → `toast.error(errorMessage(err))` **and** the input is re-filled
    (handled in the hook) so the text isn't lost. Sizing: a fixed-height panel (`h-[28rem]` /
    `h-full` inside the tab) like `AssistantChat`'s `h-80`, responsive width (full-bleed on mobile),
    dark-mode via the same token classes (no raw colors).
- [ ] **Step 3 — `app/messages/page.tsx` (candidate inbox)** — `"use client"`, inside
  `CandidateShell`. `useQuery({ queryKey: messages.listQueryKey(), queryFn: messages.listThreads,
  refetchInterval: 30_000, refetchIntervalInBackground: false })` (slower list cadence per Risks).
  Render thread rows (reuse the `dashboard.tsx` `Card` row layout) sorted desc by `last_message_at`
  (server already sorts; don't re-sort), each showing the application/job reference + a relative
  `last_message_at` and, when `thread.unread > 0`, an `@ip/ui` `Badge tone="info"` count, linking to
  `/messages/${thread.applicationId}`. States: `LoadingState`; `EmptyState title="No messages"
  description="When a recruiter messages you about an application, it'll show up here."`;
  `ErrorState` + retry.
- [ ] **Step 4 — `app/messages/[applicationId]/page.tsx`** — `"use client"`, inside `CandidateShell`
  (which already enforces `useRequireAuth`/role); read `useParams<{ applicationId: string }>()`, a
  back-link to `/messages` (the `buttonVariants({ variant: "ghost" })` `ArrowLeft` pattern from the
  report page), then `<MessageThreadView applicationId={applicationId} side="candidate" />`.
- [ ] **Step 5 — nav + unread badge in `candidate-shell.tsx`** — add `{ href: "/messages", label:
  "Messages" }` to `NAV`. Compute a total-unread badge from a lightweight
  `useQuery(messages.listQueryKey(), messages.listThreads, { refetchInterval: 60_000,
  refetchIntervalInBackground: false })` reducing `sum(t.unread)`; when `> 0`, render a small `Badge`
  next to the "Messages" `NavLink` label (cap display at `9+`). Keep it resilient — on error the
  badge simply doesn't render (no throw in the shell).
- [ ] **Step 6 — verify build:** `npx pnpm@9.15.0 --filter @ip/candidate build` green; manual open
  shows **no console errors**, the thread renders both sides, and polling stops when the tab is
  hidden (verify via the Network panel / a `document.hidden` log).

### Task 10 — company applicant-view Messages tab (+ recruiter-side unread)
**Files:** Create `frontend/apps/company/components/message-thread-view.tsx`,
`frontend/apps/company/lib/use-thread-messages.ts` (thin duplicates of the candidate pair — the
**hook body is identical**, only `side` defaults differ; copy per the repo's app-local component
convention, do **not** promote to `@ip/ui`/`@ip/shared` in this increment). Modify
`frontend/apps/company/app/jobs/[id]/applicants/[appId]/page.tsx` (add the Messages tab).

- [ ] **Step 1 — wrap the applicant detail in `Tabs`.** The `[appId]` page currently renders only
  `ReportView`. Wrap it (mirroring `jobs/[id]/page.tsx`'s `Tabs`/`TabsList`/`TabsTrigger`/
  `TabsContent` usage) with **`Report`** (the existing `ReportView` + its `notReady`/poll logic,
  unchanged) and **`Messages`** tabs. The Messages tab renders
  `<MessageThreadView applicationId={appId} side="recruiter" />` (the resource enforces `comp_id`
  scoping; the manager-team posting model means any manager of the company sees the thread —
  attribution is per-message `sender_user_id`, shown as the handle on the company side).
- [ ] **Step 2 — recruiter-side unread affordance.** Show the recruiter-side `thread.unread` as a
  `Badge` on the **`Messages` `TabsTrigger`** (a `useQuery(messages.threadQueryKey(appId), ...)` is
  unnecessary just for the tab count — instead read it from the thread the view already polls, or a
  cheap `listMessages`-derived count; keep it to a single source). On open, `MessageThreadView`'s
  `markRead` clears it. (No company-app nav badge in v1 — the recruiter inbox lives per-applicant,
  not as a global nav surface; note this so a reviewer doesn't expect a `CompanyShell` badge.)
- [ ] **Step 3 — verify build:** `npx pnpm@9.15.0 --filter @ip/company build` green; manual open of
  an applicant → Messages tab → send → it appears in the candidate's `/messages/<id>` within one poll
  interval; the candidate badge increments; the candidate replies → the recruiter tab updates and the
  tab badge clears on open.
- [ ] **Step 4 — full gate + both FE builds + all four typechecks green; update `HANDOFF.md` +
  memory.** Run `npx pnpm@9.15.0 --filter @ip/candidate build` + `--filter @ip/company build` +
  `--filter @ip/{ui,shared,api-client} typecheck` (note: `@ip/ui` typechecks even though it is
  untouched, proving no accidental coupling). Flag at handoff whether the "new message" notify is
  wired to the real `notify_event` or a local stub (depending on increment ordering), **and** whether
  a reviewer wanted the `@ip/ui` `ChatWindow` prop-injection alternative (deferred here).

---

## Verification (end-to-end)

1. **Per backend task:** `bash scripts/check.sh` GREEN (grows from **423**). All messaging logic is
   pure-Python over injected repos — fully unit-tested offline; no network in the gate.
2. **Resource contract (the core, offline):** `test_resources_messaging.py` proves authz reuse
   (candidate `_owned`, manager `_scoped`+`_require_manager`, wrong-tenant → NotFound, non-manager →
   Forbidden), lazy single-thread creation, unread increment/clear + `last_message_at`, `body`
   validation + cap, and the strict-subset DTO.
3. **Transport:** `test_routes_messaging.py` proves `_STATUS` mapping + `caller_identity` + that the
   servicer holds **no** authz logic.
4. **Best-effort notify:** a successful send calls the notifier for the other party; a raising
   notifier does **not** fail the send (the message persists).
5. **Erasure (Inc 0/4):** `test_resources_compliance.py` proves `erase` deletes the candidate's
   threads + messages (by application) while applications/audit survive.
6. **Frontend:** `@ip/{ui,shared,api-client}` typecheck + both app builds green (`@ip/ui` untouched —
   its passing typecheck proves no accidental coupling). `MessageThreadView` renders both sides via
   the app-local chat re-skin fed by `useThreadMessages`; the `subscribe` poll seam drives liveness
   via `refetchInterval` and **stops on a hidden tab** (`refetchIntervalInBackground: false`);
   optimistic send rolls back + restores the input on failure; `markRead` clears the unread
   badge on open. (Hook logic is exercised against a fake `ApiClients`/transport; no network.)
7. **Manual / local E2E (Chrome via preview):** recruiter → applicant Messages tab → send; it appears
   in the candidate's `app/messages/<id>` within one poll interval; candidate badge increments;
   candidate replies → recruiter tab updates, unread clears on open; a "new message" email lands in
   the `LoggingNotifier` sink + an in-app notification row appears.

## Resolved gaps (completeness audit 2026-06-19)

Folds the `2026-06-19-v2-completeness-audit.md` (Part B → "Inc 4 — Messaging") fixes into this build.
Each maps to concrete tasks above; the design rationale is in `…-messaging-design.md` (§3.1/§3.3/§3.6/
§3.7/§3.8).

- [ ] **🔴 Read state (counters vs `read_at`)** — the **thread-level `unread_candidate`/
  `unread_recruiter` counters are the badge source of truth**; **`read_at` is an advisory per-message
  stamp**. Build per **Task 2 Step 3** (send: `$inc` recipient counter, insert row `read_at=None`) +
  **Task 3** (`mark_read`: `$set` reader's own counter to 0 **and** `mark_read_through` stamps the
  other side's unread rows — one call, can't drift). Tests assert the badge derives only from the
  counter (Task 3 Step 1).
- [ ] **🔴 Messages index** — `IndexSpec("messages", [("thread_id", 1), ("created_at", 1)])` in
  `infra/db.py` `INDEXES` (already specified in **Tier-A Task 1 Step 3**); confirm it ships with the
  `application_id` cascade index and the four `message_threads` indexes.
- [ ] **Thread creation (who + when)** — lazy on first message via `get_by_application(...) or
  create(...)`; **the first sender is the creator** (Task 2 Step 3). A pre-message application is
  absent from `list_threads` and its surface shows the empty state — verify in the candidate inbox
  (Task 9 Step 3) and the company tab (Task 10 Step 1).
- [ ] **Body length cap** — `MAX_BODY = 4_096` (4 KB) module constant; **server validates** in
  `send_message` (Task 2 Step 3, boundary test in Task 2 Step 1) **and** the **composer guards
  client-side** before the round-trip (Task 9 Step 2) — the server stays the authority.
- [ ] **Erasure (recruiter loses the thread) — confirm acceptable** — `CandidateEraser.erase` deletes
  threads + messages by `application_id` (Task 7); the recruiter loses the chat with the candidate's
  PII **by design** (the application tombstone + funnel/audit record survive). Note this as intended in
  the Task 7 test comment so a reviewer doesn't read it as data loss.
- [ ] **Poll cost** — each open-thread poll is a single capped `find` by `thread_id`; polling **pauses
  on a hidden tab** (`refetchIntervalInBackground: false`, Task 9 Step 1 / Task 10). SSE (design §3.4)
  is the documented upgrade — leave `subscribe()` as the only swap point (do not build SSE here).
- [ ] **Sender identity (no impersonation)** — `sender_user_id` is set from `identity` (the token) in
  the resource, never a client field (Task 2 Step 3 + its test); the FE bubbles show the per-message
  sender ("Hiring team" on the candidate side, the recruiter handle on the company side — Task 9/10
  Step 2).

## Risks / re-verify at execution

- **Increment ordering with notifications.** If `…-notifications-center.md` hasn't landed,
  `notify_event` won't exist. *Plan:* land a local notifier-shaped stub behind the same call shape
  (Task 6) and swap to the real `notify_event` when the center lands — flagged at handoff.
- **Proto/codegen drift.** The TS client must be regenerated (`pnpm gen`) after `messaging.proto`;
  hand-editing generated files will drift. Re-confirm the generator toolchain matches the existing
  `pb/*` artifacts.
- **Poll cadence.** 5 s open / 30 s list are starting points; tune for "feels live" vs. idle cost;
  ensure `refetchIntervalInBackground: false` so a hidden tab stops polling.
- **Unread counter races** (two managers + a candidate). The counters are atomic `$inc`/`$set` in the
  resource and **advisory** (a badge, not a funnel invariant) — a transient off-by-one self-heals on
  the next `MarkRead`; don't add locking.
- **`ChatWindow` is closed — re-skin, don't wrap (the key Tier-D constraint).** `ChatWindow`
  (`frontend/packages/ui/src/chat-window.tsx`) owns its `turns` state internally and exposes **only**
  a streaming `send(messages, handlers)` prop — it has **no** way to ingest a poll-fetched message
  list. So messaging does **not** render the literal `ChatWindow` node; `MessageThreadView` is an
  app-local component that faithfully re-skins the chat surface (bubble layout, `whitespace-pre-wrap`,
  violet/dark tokens, auto-stick scroll, in-flight latch, optimistic-then-rollback) but is driven by
  `useThreadMessages`. `@ip/ui` stays untouched. *If a reviewer prefers a thin `messages` prop on
  `ChatWindow` instead, that is a separate `@ip/ui` change, out of scope here — flag at handoff.*
- **SSE is explicitly NOT built here** (spec §3.4). Do not add a stream endpoint in this increment;
  leave `messages.ts`'s `subscribe()` as the documented swap point (its body is the only thing that
  changes when SSE lands — write path, query keys, hook, and view are untouched).
