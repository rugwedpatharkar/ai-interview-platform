# Inc 4 — Notifications Center — Design

> **Pillar D of v2** (Comms & Candidate Growth). Read the canonical
> `docs/superpowers/v2/2026-06-19-v2-architecture-overview-design.md` first — esp. §5 Pillar D
> and §4 module #12 ("Notifications Center [evolve]: persisted in-app feed + email on
> `TransitionNotifier`"). This spec details the **notifications center**; its sibling is
> `…-messaging-design.md` (messaging fires this center's "new message" trigger). The TDD build is
> `docs/superpowers/v2/2026-06-19-notifications-center.md`.
>
> **Status:** design, awaiting review. No production code yet (v2 build is a later, separately
> green-lit phase). **Local-only project; never run git/gh.**

---

## 1. Goal & scope

Today the platform's only notification is a **one-shot email** sent best-effort by
`TransitionNotifier.notify` when an application changes funnel state (`resources/notification.py`,
the `_MESSAGES` map, invoked from `advance_application`). Emails are fire-and-forget — nothing is
persisted, so neither app can show "what happened lately", and there is no in-app feed or unread
badge. Inc 4 **evolves** this one path into a real **notifications center**: every notifiable event
**persists a `notifications` row** *and* sends the email, and a **bell/feed surfaces** the persisted
feed in both apps.

This is a **deliberate evolution of the existing seam, not a parallel system**: `TransitionNotifier`
stays the single chokepoint, the injected `Notifier` seam stays the email mechanism (`LoggingNotifier`
now, SMTP later, no code change), and the `_MESSAGES` map stays the message source — we *extend* all
three, we don't replace them.

**In scope (v1):**

- **A persisted `notifications` store** (`model/notification.py` + a repository) — one row per
  notification, recipient-scoped, with read state.
- **`TransitionNotifier.notify` writes a row AND sends the email** for every notifiable funnel state
  (the existing best-effort call site in `advance_application` is unchanged — it still passes
  `(application, to_state, event)`).
- **Extend `_MESSAGES`** for: the **new `assessment_review` funnel state** (Inc 0 advisory gate), a
  **"new message"** notification (from messaging, Inc 4), and an **"assessment ready / graded
  (advisory)"** notification (Inc 2). New non-funnel **notify triggers**: messaging (new message),
  assessment graded in advisory mode, and practice-complete (Inc 5).
- **A bell/feed** in **both apps** via a new authed gRPC-web `NotificationService` on admin
  (`ListNotifications` + `MarkRead` / `MarkAllRead`), with an unread badge.
- **Email stays via the injected `Notifier` seam** — swapping `LoggingNotifier` → an SMTP notifier
  later is a wiring change in `main.py`/`web.py`, not a code change in `TransitionNotifier`.

**Out of scope / explicit non-goals:**

- **No new delivery channels** — no SMS, no push, no webhooks. In-app feed (persisted rows, polled)
  + email (the existing seam) only.
- **No new realtime infrastructure** — the bell badge is read via the same **short-poll** approach
  as messaging (TanStack `refetchInterval`); the SSE upgrade documented for messaging applies here
  too if ever needed. No WebSocket.
- **No per-user notification preferences / mute / digest** in v1 (a clean follow-up — a preferences
  doc gating which `_MESSAGES` keys email vs. only-in-app). v1 sends both for every notifiable event.
- **No template engine** — `_MESSAGES` stays a plain `{state/kind: (subject, body)}` map (extended);
  parameterized bodies (e.g. interpolating a job title) are a small, optional follow-up, not a v1
  dependency.
- ID/background/biometric data — excluded platform-wide (overview §2).

---

## 2. Where it fits

```
   funnel.advance_application ──(best-effort, unchanged call site)──► TransitionNotifier.notify
   messaging.send_message ──────(best-effort "new message")─────────►  (the single chokepoint)
   aptitude.grade (advisory) ───(best-effort "assessment ready")────►        │
   practice.complete (Inc 5) ───(best-effort)──────────────────────►        │
                                                                      ┌───────┴────────────────┐
                                                                      │  writes BOTH:           │
                                                                      │   1. notifications row  │──► Mongo  notifications
                                                                      │      (NotificationRepo) │      (recipient + read state)
                                                                      │   2. email via Notifier │──► LoggingNotifier (now)
                                                                      │      seam (unchanged)   │      → SMTP later (no code change)
                                                                      └─────────────────────────┘
   Candidate app ─┐   gRPC-web (authed)   ┌──────────────────────────────────────┐
   (bell + feed)  ├──────────────────────►│  ADMIN  NotificationService (NEW)     │  poll ListNotifications
   Company app ───┘   poll (refetchInterval)│   ListNotifications / MarkRead /      │  for the badge + feed
                  ◄────────────────────────│   MarkAllRead   resources/notification │
                                           └──────────────────────────────────────┘
```

- **admin owns MongoDB and the write.** `TransitionNotifier` (an admin resource) writes the row and
  calls the `Notifier` seam; the bell/feed reads come over the existing authed gRPC-web transport.
  **No new service**; the center is new *capability* on admin: extend one resource, add one model +
  repository, add one servicer.
- **The funnel call site does not change.** `advance_application` already calls
  `notifier.notify(application, new, event)` best-effort (swallow + log on failure). We extend what
  `notify` *does* (write a row, then email), not where/when it is called. Non-funnel triggers
  (messaging, advisory grading, practice) call the **same** notifier with their own
  `(recipient, kind, …)` shape (§3.3).
- **The `Notifier` seam is untouched.** `infra/notifier.py`'s `Notifier` Protocol +
  `LoggingNotifier` stay exactly as-is; the SMTP swap later is a one-line wiring change. The center
  adds the *persistence* limb beside the existing *email* limb — it does not move email off the seam.

---

## 3. Design

### 3.1 Data model

One new collection, **recipient-scoped**. New Pydantic model `src/admin/app/model/notification.py`,
mirroring `model/aptitude.py`:

**`Notification`:**

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | Notification id. |
| `user_id` | `str` | **Recipient.** Every read is scoped to `identity["id"]` — a user only ever sees their own feed. |
| `comp_id` | `str \| None` | Tenant context **when applicable** (funnel/messaging/assessment notifications carry the application's `comp_id`; practice notifications are detached → `None`, mirroring practice's "no `comp_id`" stance, overview §5). Used for the erasure cascade + optional company-side scoping. |
| `kind` | `str` | The notification type — the `_MESSAGES` key (funnel `to_state` like `interview_pending` / `assessment_review`, or a non-funnel kind like `new_message` / `assessment_ready` / `practice_complete`). Drives the icon + any deep link. |
| `subject` | `str` | Denormalized from `_MESSAGES` at write time (so the feed renders without re-deriving). |
| `body` | `str` | Denormalized from `_MESSAGES` at write time. |
| `link` | `str \| None` | Optional in-app deep link (e.g. the application's interview page, the message thread). Resolved at write time from the trigger context. |
| `read_at` | `datetime \| None` | `None` = unread (the badge counts these); set by `MarkRead`/`MarkAllRead`. |
| `created_at` | `datetime` | `default_factory` now; the feed sort key (desc). |

> **Why denormalize `subject`/`body` onto the row** rather than store only `kind` and re-render from
> `_MESSAGES` on read: the email and the in-app row should say the **same thing**, decided **once** at
> notify time, and a later `_MESSAGES` wording change must not silently rewrite history in a user's
> feed. The map is the *source* at write time; the row is the *record*. (Same denormalize-at-write
> rationale as the messaging spec's message rows.)

### 3.2 `TransitionNotifier.notify` — write a row AND email (the core evolution)

`resources/notification.py` keeps its shape; `notify` gains the persistence limb:

- **Constructor** gains a `notifications` repository alongside the existing `users` + `notifier`:
  `TransitionNotifier(*, users, notifier, notifications)`.
- **`notify(application, to_state, event)`** (the funnel path, unchanged signature):
  1. Look up `_MESSAGES.get(to_state)` — **unchanged** (states absent from the map are still skipped,
     so non-notifiable states like `applied`/`scored` stay silent).
  2. Resolve the recipient + email — **unchanged** (`users.get(candidate_user_id)`; warn + return if
     missing).
  3. **NEW: insert a `Notification` row** (`user_id=candidate_user_id`, `comp_id=application["comp_id"]`,
     `kind=to_state`, the resolved `subject`/`body`, an optional `link`) via the repo.
  4. **Send the email** via the injected `Notifier` seam — **unchanged** (`notifier.send_email(...)`).
  - Row-then-email ordering: persist the durable record first, then attempt the best-effort email.
    Both sit inside the **best-effort boundary** the funnel already wraps (`advance_application`'s
    `try/except` swallows + logs), so a notifications-store hiccup never blocks a funnel transition.
    Within `notify`, the email send is additionally guarded so a row is not lost if email fails (the
    in-app feed is the durable channel; email is best-effort on top).

The result: every funnel transition that emails today **also** lands in the in-app feed, with **zero
change** to the funnel, to `advance_application`'s call site, or to the `Notifier` seam.

### 3.3 Extending `_MESSAGES` + new notify triggers

**Extend `_MESSAGES`** (keep the existing entries verbatim — `aptitude_pending`, `interview_pending`,
`gated_out`, `shortlisted`, `hired`, `rejected`) with:

- **`assessment_review`** (the new Inc-0 advisory-gate funnel state) — a candidate-facing "your
  assessment is under review" message, so the advisory path (which routes *both* pass and fail to a
  human, overview §6) tells the candidate their application is in human review rather than going
  silent. This is the funnel-driven addition and flows through the **unchanged** `notify(application,
  to_state, event)` path automatically once the key exists.
- **`new_message`** — "You have a new message" (the messaging trigger, §3.3 below). Non-funnel.
- **`assessment_ready`** — "Your assessment results are ready" for the advisory grading case (Inc 2).
  Non-funnel.
- **`practice_complete`** — "Your practice interview feedback is ready" (Inc 5 candidate growth).
  Non-funnel, detached (no `comp_id`).

**New notify triggers** call `TransitionNotifier` with a recipient + a non-funnel kind. To keep the
map the single message source while supporting both shapes, add a small sibling method:

```
notify_event(*, user_id, comp_id, kind, link=None)
```

— it looks up `_MESSAGES[kind]`, resolves the recipient via `users.get(user_id)`, then writes the
row + emails, sharing the same internals as `notify`. (`notify` stays the funnel-keyed entry;
`notify_event` is the explicit-recipient entry for non-funnel triggers. They share one private
`_emit(user, comp_id, kind, subject, body, link)` helper — used 2+ times, so it earns its keep.)

Each trigger calls it **best-effort** from its own resource:

| Trigger | Caller | Recipient | `kind` |
|---|---|---|---|
| Funnel transition | `advance_application` → `notify(...)` (unchanged) | candidate | the `to_state` |
| New message | `messaging.send_message` (Inc 4) | the **other** party | `new_message` |
| Assessment graded (advisory) | the advisory grading path (Inc 2) | candidate | `assessment_ready` |
| Practice complete | `practice` resource (Inc 5) | candidate (detached) | `practice_complete` |

All non-funnel callers wrap the call in the **same best-effort try/except + log** the funnel uses, so
a notifications failure never breaks the originating operation (a send, a grade, a practice run).

### 3.4 Surfaces — bell/feed via `NotificationService`

A new authed gRPC-web servicer on admin (`routes/notification.py`, mirroring
`routes/decision.py`), over the proto pipeline (§3.5). Recipient-scoped throughout — every RPC reads
`identity["id"]` and touches only that user's rows:

| RPC | Returns / does | Resource |
|---|---|---|
| `ListNotifications(ListRequest{page, page_size, unread_only?})` | `{ notifications: [NotificationDTO], unread_count, page, page_size, total }` (desc by `created_at`, page-size **clamped**) | `notification.list_for_user(identity, ...)` |
| `MarkRead(MarkReadRequest{notification_id})` | sets `read_at` on that user's row (404 if not theirs) | `notification.mark_read(identity, id)` |
| `MarkAllRead(MarkAllReadRequest{})` | sets `read_at` on all of the user's unread rows | `notification.mark_all_read(identity)` |

- **`unread_count`** rides on the `ListNotifications` response so the bell badge is one poll, not a
  separate count RPC.
- **Both apps** render the same bell: a `@ip/shared/notifications.ts` client wraps the gRPC-web calls
  + the **short-poll** (a slow `refetchInterval`, paused on hidden tab) for the badge; clicking the
  bell opens the feed (the page of rows), and opening it / clicking a row calls `MarkRead`/
  `MarkAllRead`. A `kind` → icon + `link` → deep-link map lives in the FE.
- **Receive = poll** (same rationale as the messaging spec §3.3): the notifications store lives in
  **admin's Mongo**, the badge is a low-frequency read, and polling reads the source of truth
  directly with zero new infra. The documented **SSE upgrade** (messaging spec §3.4) applies
  identically here if ever needed — flip the FE `subscribe` seam; the write + resource + model are
  untouched.

### 3.5 API surface (proto pipeline)

The **proto → `pnpm --filter @ip/api-client gen` → `@ip/api-client`** pipeline is the FE contract.
`NotificationService` is a `.proto` in `src/admin/app/routes/pb/notification.proto`, a thin servicer
in `routes/notification.py`, **registered in `routes/web.py`** (a new
`notification_pb2_grpc.add_NotificationServiceServicer_to_server(...)` block, with a
`NotificationRepository(db)` dependency), and the generated TS client wired into `ApiClients` +
`clientsFromTransport` in `frontend/packages/api-client/src/index.ts`. The `TransitionNotifier`
constructed in `web.py` gains the `notifications=NotificationRepository(db)` dependency.

### 3.6 Erasure cascade entry (Inc 0)

A notification row carries the recipient's `user_id` (identifying) and a denormalized
subject/body that may name the candidate. So `notifications` **joins the `CandidateEraser` cascade**:

- Add a `notifications` repository to `CandidateEraser.__init__` + `make_eraser` (`routes/web.py`).
- In `erase(user_id)`: `notifications.delete_by_user(user_id)` (mirrors
  `consents.delete_by_user` — the consent ledger already sets this exact precedent for a
  user-id-keyed PII store). The candidate's feed is purged with the rest of their identifying data.
- `NotificationRepository.delete_by_user(user_id)` mirrors `ConsentRepository.delete_by_user`.

The Inc-0 stub registers `notifications` in the cascade from day one; Inc 4 fills in the repository.

---

## 4. Key decisions & tradeoffs

| Decision | Rationale | Tradeoff / mitigation |
|---|---|---|
| **Evolve `TransitionNotifier` (write row **and** email), don't add a parallel system** | One chokepoint already exists + is already called best-effort from the funnel; reuse it | `notify` now does two things; mitigated by a shared `_emit` helper and keeping the funnel call site + signature unchanged |
| **Keep the `_MESSAGES` map as the single message source** | Existing pattern; extending a dict is the minimal change for new states/kinds | A flat map (no templating); parameterized bodies are a documented follow-up, not a v1 need |
| **Email stays on the injected `Notifier` seam (LoggingNotifier → SMTP later)** | The seam exists precisely for this swap; SMTP is a wiring change, not a code change | Email remains best-effort on top of the durable in-app row (the row is the source of truth) |
| **Persist a row + denormalize subject/body** | The feed renders offline of `_MESSAGES`; a later wording change can't rewrite a user's history; email + row say the same thing, decided once | A wording fix won't retro-update old rows (correct: the row is a record) |
| **Bell badge via short-poll (no realtime infra)** | Store lives in admin's Mongo; low-frequency read; reads the source of truth directly; **zero new infra** | Slight badge latency; mitigated by hidden-tab pause + the same documented SSE upgrade as messaging |
| **`notify` (funnel-keyed) + `notify_event` (explicit recipient)** | Funnel passes `(application, to_state)`; non-funnel triggers pass `(user_id, kind)` — two entry shapes, one internal `_emit` | Two public methods; both thin, sharing one helper (used 2+ times → justified) |
| **`comp_id` nullable (practice detached)** | Practice mode has no `comp_id` (overview §5); funnel/messaging/assessment do | The company-side bell only ever shows comp-scoped kinds; practice rows are candidate-only |
| **Best-effort everywhere a trigger fires** | A notifications outage must never break a funnel transition, a message send, a grade, or a practice run | Mirrors the funnel→notifier swallow-and-log; a dropped notification is logged, not fatal |
| **Recipient-scoped reads (`identity["id"]`)** | A user sees only their own feed; trivially correct, no cross-user leakage | None — it's the only sensible scoping |

---

## 5. Testing approach

TDD throughout (failing test watched fail → implement → green), per PRODUCTION_STANDARDS §2. The gate
is `bash scripts/check.sh` (ruff format, lint+security S-rules line-88, pip-audit, pytest ×5);
**baseline 423 tests** must stay green and grow. Frontend verified by `npx pnpm@9.15.0 --filter
@ip/candidate build` + `--filter @ip/company build` + `--filter @ip/{ui,shared,api-client}
typecheck` (never `next build` while `pnpm dev` is live).

- **`TransitionNotifier.notify` (extend existing `notification` tests):**
  - For each notifiable `to_state` (incl. the **new `assessment_review`**): a row is inserted with
    the right `user_id`/`comp_id`/`kind`/`subject`/`body` **and** an email is sent (assert against the
    `LoggingNotifier.sent` sink) — both happen.
  - A **non-notifiable** state (`applied`, `scored`, …) inserts **no** row and sends **no** email
    (the `_MESSAGES.get(...) is None` skip is preserved).
  - A missing recipient (`users.get` → None) → warn + return, **no** row, **no** email (unchanged
    guard).
  - **Email-fails-but-row-persists:** a `Notifier` that raises does not lose the row (assert the row
    is written; the raise is swallowed/logged) — the durable channel survives an email outage.
- **`notify_event` (new):** a `new_message` / `assessment_ready` / `practice_complete` event writes a
  row to the explicit recipient + emails; an unknown `kind` (not in `_MESSAGES`) is a no-op (skip,
  same as the funnel path).
- **`NotificationService` resource + servicer:** `list_for_user` returns only the caller's rows, desc
  by `created_at`, page-size **clamped**, `unread_only` filters to `read_at is None`, `unread_count`
  correct; `mark_read` sets `read_at` on the caller's row and **404s a row that isn't theirs**;
  `mark_all_read` zeroes all the caller's unread. Servicer mirrors decision/aptitude servicer tests
  (`_STATUS` mapping, `caller_identity`, no logic in the adapter).
- **Best-effort integration:** the funnel test still passes when the notifications repo raises (the
  transition completes; `advance_application`'s existing swallow covers it); a messaging send still
  succeeds when `notify_event` raises (messaging spec cross-references this).
- **Erasure cascade (Inc 0/4):** `CandidateEraser.erase` deletes the user's notifications
  (`delete_by_user`) while leaving applications/audit intact.
- **Frontend:** `@ip/shared/notifications.ts` typechecks; a fake transport drives the bell (badge
  count, feed page, mark-read clears the badge); poll pauses on hidden tab. No network in unit tests.
- **Manual / local E2E (Chrome via preview):** advance an application to `interview_pending` →
  the candidate's bell badge increments within one poll + an email lands in the `LoggingNotifier`
  sink; the candidate opens the feed → badge clears; a new message (messaging) and an advisory
  grade also each produce a feed row + email.

---

## 5.5 v2 differentiator — No-ghosting guarantee

The #1 candidate complaint is silence (55% never hear back). Because admin runs the funnel, v2 makes
"every applicant reaches a definite, notified outcome" a **system guarantee**, not a hope:

- **No silent terminal state.** Every terminal state a candidate can reach — `shortlisted`,
  `rejected`, `hired`, `gated_out`, the `assessment_review` resolution, **and the system exits
  `expired`/`abandoned`** — has a `_MESSAGES` entry, so a closing notification always fires (row +
  email). The reaper-driven `expired`/`abandoned` paths are explicitly included so a stalled
  application can never just go dark.
- **Feedback at close.** A terminal notification for a candidate who interviewed links to their
  skill-gap feedback (Candidate Growth pillar) where eligible — turning a rejection into something
  useful (never mid-funnel; see the candidate-growth guard).
- **Employer responsiveness is measurable.** The funnel timestamps every transition, so per-employer
  responsiveness (median time-to-first-outcome, % applicants given an outcome) is computable — fed to
  the marketplace trust signals and usable for a recruiter nudge on pending applicants.
- **In one line:** if you apply, the AI engages you, and you always get an answer.

→ Rides this spec's plan (`2026-06-19-notifications-center.md`): audit `_MESSAGES` for full
terminal-state coverage (incl. expired/abandoned) + the feedback link; responsiveness metrics attach
to the marketplace + analytics work.

---

## 6. Open questions / risks

- **Badge poll cadence.** The bell badge poll interval (slower than an open message thread) needs
  tuning. *Mitigation:* hidden-tab pause; documented SSE upgrade (shared with messaging) is the exit.
  **Open:** the exact interval (lean 30 s) — confirm at planning.
- **`_MESSAGES` is now read by two limbs (row + email).** A wording change touches both, by design.
  *Mitigation:* denormalize subject/body onto the row at write time, so historical rows are records,
  not live views — a later edit affects only new notifications.
- **No preferences in v1 → every notifiable event emails.** Some users may find funnel emails noisy.
  *Mitigation:* documented follow-up — a per-user preferences doc gating which `kind`s email vs.
  in-app-only; v1 ships both, the preferences gate is additive.
- **Detached (practice) rows have no `comp_id`.** A company-side feed must never surface them.
  *Mitigation:* the company bell filters to comp-scoped `kind`s (or `comp_id == identity["comp_id"]`);
  practice rows are recipient-(candidate-)scoped and carry `comp_id=None`, so they're naturally
  excluded from any comp-scoped view.
- **Best-effort means a notification can be silently dropped.** If the row write *and* the email both
  fail, the user gets nothing. *Mitigation:* both failures are logged (no `except: pass`); the funnel
  transition / message / grade still succeed (the notification is advisory, never a gate). A
  retry/outbox is explicitly **not** in v1 scope (overkill for demo) — flagged as a follow-up.
- **Parameterized bodies.** Several messages would read better with the job title / company name
  interpolated. *Mitigation:* v1 keeps static `_MESSAGES` strings; a templated-body pass is a small,
  additive follow-up (resolve the params at notify time from the trigger context) — flagged so a
  reviewer doesn't expect interpolation in v1.
