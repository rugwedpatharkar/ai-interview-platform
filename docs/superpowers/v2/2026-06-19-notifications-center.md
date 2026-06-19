# Inc 4 — Notifications Center — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this task-by-task. Steps use `- [ ]` checkboxes.
> Spec: `docs/superpowers/v2/2026-06-19-notifications-center-design.md`. Canonical design:
> `docs/superpowers/v2/2026-06-19-v2-architecture-overview-design.md` (§5 Pillar D, §4 module #12).

**Goal:** Evolve the existing one-shot email path into a **notifications center**:
`TransitionNotifier.notify` **writes a persisted `notifications` row AND sends the email** for every
notifiable funnel state; **extend `_MESSAGES`** (new `assessment_review` state + `new_message` +
`assessment_ready` + `practice_complete`); add a **bell/feed** in both apps via a new authed gRPC-web
`NotificationService` (`ListNotifications` + `MarkRead`/`MarkAllRead`), read by **short-poll**. Email
stays on the injected `Notifier` seam (`LoggingNotifier` → SMTP later, no code change). Notifications
**join the `CandidateEraser` cascade** (Inc 0). No new infra.

**Architecture:** Extend `resources/notification.py` (the single chokepoint) to write a row then email,
via a shared `_emit` helper; add `notify_event(user_id, comp_id, kind, link)` for non-funnel triggers.
One new model (`Notification`) + repository. A thin `NotificationServicer` (mirrors `routes/decision.py`)
serves the recipient-scoped feed. A new `@ip/shared/notifications.ts` wraps the gRPC-web calls + a poll
badge.

## Global Constraints

- **LOCAL-ONLY — never run git/gh.** "Commit" → **"run the gate"**: `bash scripts/check.sh` (ruff
  format+lint S-rules line-88, pip-audit, pytest ×5) stays green; baseline **423 tests**. Frontend:
  `npx pnpm@9.15.0 --filter @ip/candidate build` + `--filter @ip/company build` +
  `--filter @ip/{ui,shared,api-client} typecheck`. Never `next build` while `pnpm dev` is live.
- **Robustness bar:** every notify trigger is **best-effort** (try/except + `get_logger` structured
  log; never blocks the funnel transition / send / grade / practice run). Within `notify`, the email
  send is additionally guarded so a **row is not lost if email fails** (the in-app feed is the durable
  channel). Trust internal typed calls. Follow `~/.claude/CLAUDE.md` + `PRODUCTION_STANDARDS.md`.
- **Evolve, don't replace:** keep `TransitionNotifier` as the single chokepoint, the `_MESSAGES` map
  as the message source, and the injected `Notifier` seam as the email mechanism — **extend** all
  three. The funnel call site (`advance_application` → `notify(application, new, event)`) is
  **unchanged** in signature + timing.
- **Recipient-scoped reads:** every `NotificationService` RPC reads `identity["id"]` and touches only
  that user's rows.
- **Resource is the contract:** no logic in the servicer adapter.

---

## File structure (new + modified)

```
src/admin/app/
  model/notification.py                    (NEW — Notification pydantic model)
  infra/repositories/notifications.py      (NEW — NotificationRepository + delete_by_user)
  infra/db.py                              (+INDEXES: notifications)
  resources/notification.py                (EXTEND — write row + email; _emit; notify_event; +_MESSAGES)
  resources/compliance.py                  (CandidateEraser: +notifications cascade)
  routes/pb/notification.proto             (NEW) + generated notification_pb2*.py (via pnpm gen / buf)
  routes/notification.py                   (NEW — NotificationServicer, thin adapter)
  routes/web.py                            (+register NotificationServicer; +notifications repo into
                                            TransitionNotifier + make_eraser)

src/admin/tests/
  test_resources_notification.py           (EXTEND — row+email for each state; skip; email-fails-row-persists)
  test_routes_notification.py              (NEW — servicer status mapping + recipient scoping)
  test_resources_compliance.py             (extend — erase deletes notifications)
  conftest.py                              (+fake notifications repo if the suite uses fakes)

frontend/packages/shared/src/
  notifications.ts                         (NEW — createNotificationsClient: list + unreadCount + markRead
                                            + markAllRead; query keys; poll-badge seam)
  index.ts                                 (+export createNotificationsClient + Notification/NotificationKind
                                            types + notificationKeys)
frontend/packages/api-client/src/
  index.ts                                 (+NotificationService in ApiClients + clientsFromTransport + re-export)
frontend/packages/ui/src/
  notification-bell.tsx                    (NEW — NotificationBell: bell trigger + unread Badge + feed
                                            DropdownMenu; presentation-only)
  notification-item.tsx                    (NEW — NotificationItem: one feed row, icon-by-kind + body +
                                            relative time + unread dot; presentation-only)
  index.ts                                 (+export NotificationBell, NotificationItem + their prop types)
frontend/apps/candidate/components/
  candidate-shell.tsx                      (+mount <NotificationBell> in the header `actions` slot)
  notification-bell-connected.tsx          (NEW — wires NotificationBell to createNotificationsClient via
                                            TanStack Query; the @ip/shared seam stays out of @ip/ui)
frontend/apps/company/components/
  company-shell.tsx                        (+mount <NotificationBell> in the header `actions` slot)
  notification-bell-connected.tsx          (NEW — same wiring, company-scoped kind filter)
```

**Responsibilities:** `resources/notification.py` = the chokepoint (row + email + map). `_emit` =
the shared write-row-then-email internal (used by `notify` and `notify_event` → 2+ uses, justified).
`routes/notification.py` = gRPC adapter only. `notifications.ts` = transport + query keys + poll-badge
seam (no React). `notification-bell.tsx` / `notification-item.tsx` = presentation only (no `@ip/shared`
dep, like `ChatWindow`) — all data/poll/mutation wiring lives in each app's
`notification-bell-connected.tsx` (the seam that drives `onOpen`/`onMarkAllRead`/`onItemClick`).

---

## TIER A — persistence + the evolved chokepoint (pure-logic, fully unit-tested)

### Task 1 — `Notification` model + repository + indexes
**Files:** Create `model/notification.py`, `infra/repositories/notifications.py`; Modify `infra/db.py`.

- [ ] **Step 1 — `model/notification.py`** — `Notification` (`user_id`, `comp_id: str|None`, `kind`,
  `subject`, `body`, `link: str|None`, `read_at: datetime|None`, `created_at` default-now). Mirror
  `model/aptitude.py` style.
- [ ] **Step 2 — `NotificationRepository`** (extend `BaseRepository`, mirror `aptitude_attempts.py`):
  `insert(notification)`, `list_by_user(user_id, *, unread_only, limit, skip)` (desc by `created_at`,
  capped), `unread_count(user_id)`, `mark_read(user_id, notification_id)` (scoped `$set read_at` —
  returns whether a row matched, for the 404), `mark_all_read(user_id)`, and `delete_by_user(user_id)`
  (mirror `ConsentRepository.delete_by_user`).
- [ ] **Step 3 — indexes** in `infra/db.py` `INDEXES`:
```python
# notifications — recipient feed (desc by recency) + unread filter + cascade
IndexSpec("notifications", [("user_id", 1), ("created_at", -1)]),
IndexSpec("notifications", [("user_id", 1), ("read_at", 1)]),   # unread filter / count
```
- [ ] **Step 4 — gate green** (import-only).

### Task 2 — evolve `TransitionNotifier.notify` (TDD — write row AND email)
**Files:** Modify `resources/notification.py`; extend `tests/test_resources_notification.py`.
**Interfaces — Changed:** `TransitionNotifier(*, users, notifier, notifications)` (add the repo).
`notify(application, to_state, event)` signature **unchanged**.

- [ ] **Step 1 — extend `_MESSAGES`** (keep existing entries verbatim) with `assessment_review`
  (advisory-gate state, candidate-facing "under review"), `new_message`, `assessment_ready`,
  `practice_complete`.
- [ ] **Step 2 — failing tests** (extend the existing `notification` suite, which already uses a
  `LoggingNotifier` + a fake users repo — add a fake notifications repo):
  - for each notifiable `to_state` incl. **`assessment_review`**: a row is inserted
    (`user_id`/`comp_id`/`kind=to_state`/`subject`/`body`) **and** an email is sent (assert the
    `LoggingNotifier.sent` tuple) — **both**.
  - a **non-notifiable** state (`applied`, `scored`) → **no** row, **no** email (the
    `_MESSAGES.get is None` skip preserved).
  - missing recipient (`users.get` → None) → warn + return, **no** row, **no** email.
  - **email-fails-row-persists:** a `Notifier` raising on `send_email` does **not** lose the row
    (assert the row is written; the raise is swallowed/logged inside `notify`).
- [ ] **Step 3 — run → FAIL → implement.** Add a private
  `_emit(user, comp_id, kind, subject, body, link=None)`: insert the `Notification` row, then **guard**
  the email (`try: await self._notifier.send_email(...) except Exception: log.exception(...)`). `notify`
  keeps its existing `_MESSAGES.get` skip + `users.get` guard, then calls `_emit` (row-then-email).
- [ ] **Step 4 — run → PASS; gate green.**

### Task 3 — `notify_event` for non-funnel triggers (TDD)
**Files:** Modify `resources/notification.py`; extend tests.
**Interfaces — Produces:** `async notify_event(self, *, user_id, comp_id, kind, link=None)`.

- [ ] **Step 1 — failing tests:** a `new_message` / `assessment_ready` / `practice_complete` event to
  an explicit `user_id` writes the right row + emails (via the same `_emit`); an **unknown `kind`**
  (not in `_MESSAGES`) is a **no-op** (skip — same as the funnel path); a missing recipient → warn +
  return.
- [ ] **Step 2 — implement:** `notify_event` looks up `_MESSAGES.get(kind)` (skip if None), resolves
  `users.get(user_id)` (warn + return if None), then calls `_emit(user, comp_id, kind, subject, body,
  link)`. Shares all internals with `notify`.
- [ ] **Step 3 — run → PASS; gate green.** (The messaging / advisory-grading / practice resources call
  this best-effort from their own increments; this plan provides the method + its tests.)

---

## TIER B — read API: bell/feed service

### Task 4 — `notification` resource reads (TDD — recipient-scoped feed)
**Files:** Modify `resources/notification.py`; extend tests.
**Interfaces — Produces:** `list_for_user(identity, *, notifications, page, page_size, unread_only)`,
`mark_read(identity, notification_id, *, notifications)`, `mark_all_read(identity, *, notifications)`.

- [ ] **Step 1 — failing tests:** `list_for_user` returns only the caller's rows, desc by
  `created_at`, page-size **clamped**, `unread_only` filters to `read_at is None`, and `unread_count`
  is correct; `mark_read` sets `read_at` on the caller's row and **raises NotFound for a row that
  isn't theirs**; `mark_all_read` zeroes all the caller's unread.
- [ ] **Step 2 — run → FAIL → implement** (thin wrappers over the repo, all keyed by `identity["id"]`;
  page-size clamp to a configured max, mirroring the marketplace/`find_capped` pattern). → PASS.
- [ ] **Step 3 — gate green.**

### Task 5 — `notification.proto` + generate client
**Files:** Create `routes/pb/notification.proto`; run the generator.

- [ ] **Step 1 — `notification.proto`** (`package admin.notification.v1`; mirror `decision.proto`):
```proto
service NotificationService {
  rpc ListNotifications(ListRequest) returns (ListResponse);
  rpc MarkRead(MarkReadRequest) returns (MarkReadResponse);
  rpc MarkAllRead(MarkAllReadRequest) returns (MarkReadResponse);
}
message NotificationDTO {
  string id = 1; string kind = 2; string subject = 3; string body = 4;
  string link = 5; string created_at = 6; string read_at = 7;
}
message ListRequest { int32 page = 1; int32 page_size = 2; bool unread_only = 3; }
message ListResponse {
  repeated NotificationDTO notifications = 1; int32 unread_count = 2;
  int32 page = 3; int32 page_size = 4; int32 total = 5;
}
message MarkReadRequest { string notification_id = 1; }
message MarkAllReadRequest {}
message MarkReadResponse { int32 unread_count = 1; }
```
- [ ] **Step 2 — generate** Python stubs (buf/protoc, same as existing `pb/*`) + TS client via
  `npx pnpm@9.15.0 --filter @ip/api-client gen`. Regenerate, don't hand-edit.
- [ ] **Step 3 — gate green.**

### Task 6 — `NotificationServicer` (TDD — thin adapter) + register
**Files:** Create `routes/notification.py`; Modify `routes/web.py`; Test `tests/test_routes_notification.py`.

- [ ] **Step 1 — failing servicer tests** (mirror decision/aptitude servicer tests): `ListNotifications`
  returns only the caller's rows + `unread_count`; `MarkRead` 200 for own row, **NOT_FOUND** for
  another user's id; `MarkAllRead` clears; `_STATUS` mapping; `caller_identity` enforced.
- [ ] **Step 2 — implement** `NotificationServicer` (decision-style): each RPC `try`s
  `caller_identity`, calls the resource with the injected `NotificationRepository`, maps to proto,
  `except AuthDomainError` → `_abort`. **No logic in the adapter.**
- [ ] **Step 3 — register in `routes/web.py`:**
  - add `notification_pb2_grpc.add_NotificationServiceServicer_to_server(NotificationServicer(
    notifications=NotificationRepository(db), tokens=tokens), app)` + the import.
  - **thread the repo into `TransitionNotifier`** where it's constructed (the `transition_notifier`
    passed into `create_web_app`): `TransitionNotifier(users=UserRepository(db), notifier=notifier,
    notifications=NotificationRepository(db))`. (Locate its construction — `main.py` or `web.py` — and
    add the `notifications=` dependency; this is the wiring that turns on persistence.)
- [ ] **Step 4 — run → PASS; gate green.**

---

## TIER C — erasure cascade + frontend bell

### Task 7 — erasure cascade entry (Inc 0 follow-through)
**Files:** Modify `resources/compliance.py`, `routes/web.py`; extend `tests/test_resources_compliance.py`.

- [ ] **Step 1 — failing test:** `CandidateEraser.erase(user_id)` deletes the user's notifications
  (`delete_by_user`) while applications/audit survive.
- [ ] **Step 2 — implement:** add `notifications` to `CandidateEraser.__init__` + `make_eraser`
  (alongside `consents`); call `notifications.delete_by_user(user_id)` in `erase` (mirrors the
  `consents.delete_by_user` line — the same user-id-keyed-PII precedent). (If the Inc-0 stub already
  registered it, fill the repo in.)
- [ ] **Step 3 — run → PASS; gate green.**

### Task 8 — `@ip/shared/notifications.ts` + api-client wiring + presentation components
**Files:** Create `frontend/packages/shared/src/notifications.ts`,
`frontend/packages/ui/src/notification-bell.tsx`, `frontend/packages/ui/src/notification-item.tsx`;
Modify `…/shared/src/index.ts`, `frontend/packages/api-client/src/index.ts`, `…/ui/src/index.ts`.
**Layering (the `ChatWindow` precedent):** `@ip/ui` stays presentation-only (NO `@ip/shared`,
NO `@tanstack/react-query`, NO `@ip/api-client`); the shared client owns transport + query keys (no
React); each app owns the connector that binds them (Task 9). Bell + item are **pure props in,
callbacks out**.

- [ ] **Step 1 — api-client (after `pnpm gen`, mirror `decisions` exactly):** in
  `frontend/packages/api-client/src/index.ts` add the generated `NotificationService` import + the
  `export * from "./gen/notification_pb.js"` re-export; add `notifications: Client<typeof
  NotificationService>` to the `ApiClients` interface and `notifications: createClient(NotificationService,
  transport)` to `clientsFromTransport`. (No change to `createApiClients`/`createClients` — they call
  through.) This makes `clients.notifications.listNotifications / markRead / markAllRead` available on
  the authed transport both apps already build.

- [ ] **Step 2 — `notifications.ts` (transport + keys, no React):**
  - **Domain types** (re-exported via `index.ts`): `NotificationKind =
    | "interview_pending" | "aptitude_pending" | "gated_out" | "shortlisted" | "hired" | "rejected"
    | "assessment_review" | "new_message" | "assessment_ready" | "practice_complete"` (the `_MESSAGES`
    keys; widen to `string` at the boundary so an unknown server kind never throws — the icon map
    falls back). `Notification = { id; kind: NotificationKind; subject; body; link: string | null;
    createdAt: string; readAt: string | null }` — mapped from `NotificationDTO` (proto sends `""` for
    absent `link`/`read_at`; normalize `"" → null` here so the UI tests `readAt === null` for unread).
  - **`createNotificationsClient(clients: ApiClients)`** (takes the built clients, like the app's
    existing client construction) exposing:
    - `list({ unreadOnly = false, page = 1, pageSize = 20 } = {}): Promise<{ notifications:
      Notification[]; unreadCount: number; total: number; page: number; pageSize: number }>` — calls
      `listNotifications`, maps each DTO → `Notification`.
    - `unreadCount(): Promise<number>` — thin `list({ pageSize: 1 })` then `.unreadCount` (badge-only
      poll: one row + the count, not the whole feed).
    - `markRead(id: string): Promise<number>` and `markAllRead(): Promise<number>` — return the fresh
      `unread_count` off `MarkReadResponse` so the connector can write the badge optimistically without
      a refetch round-trip.
  - **Query keys (exported `notificationKeys`)** so the connector and any invalidation agree on one
    shape: `notificationKeys = { all: ["notifications"] as const, feed: (unreadOnly: boolean) =>
    ["notifications", "feed", unreadOnly] as const, unread: () => ["notifications", "unread"] as const }`.
  - **Poll-badge seam:** export a `pollInterval` constant (`30_000`) + a short doc note: the React
    layer drives `useQuery({ queryKey: notificationKeys.unread(), queryFn: client.unreadCount,
    refetchInterval: pollInterval, refetchIntervalInBackground: false })`. **This is the only seam that
    changes for the SSE upgrade** (spec §3.4 / messaging spec §3.4): swap the polled query for a
    `subscribe(onCount)` over an event stream — `client.list/markRead` and both components stay
    untouched. Document it inline as the swap point.

- [ ] **Step 3 — `notification-item.tsx`** (`@ip/ui`, presentation-only): renders one feed row.
  - **Props:** `{ notification: { kind: string; subject: string; body: string; link: string | null;
    createdAt: string; readAt: string | null }; onClick?: () => void }`.
  - **Layout:** an icon chip (icon chosen by `kind` via a local `KIND_ICON: Record<string, LucideIcon>`
    map with an `Inbox`/`Bell` fallback for unknown kinds — keep the map in the **app** import surface
    per the lucide gotcha; the component receives the resolved `LucideIcon` as a prop OR imports from
    `lucide-react` which the app already depends on), `subject` (medium weight), one-line clamped
    `body` (`line-clamp-2 text-muted-foreground`), and a relative timestamp ("2h ago") from a tiny
    local `formatRelative(createdAt)` helper (no date lib — `Intl.RelativeTimeFormat`). Unread rows
    show a small `bg-brand-500` dot and a faint `bg-surface-muted/40` background; read rows are plain.
  - **Interaction:** the whole row is a `<button>` (or `<a>` when `link` is set) calling `onClick`;
    `aria-label` reads `"{subject} — {unread ? 'unread' : 'read'}"`. Theme via the violet/dark tokens
    (`text-foreground`, `bg-surface`, `border-border`).

- [ ] **Step 4 — `notification-bell.tsx`** (`@ip/ui`, presentation-only, **no `@ip/shared` dep** — the
  `ChatWindow` rule): bell trigger + unread `Badge` + a `DropdownMenu` feed of `NotificationItem`s.
  - **Props:** `{ notifications: Array<…item shape…>; unreadCount: number; loading?: boolean;
    error?: string | null; onOpenChange?: (open: boolean) => void; onMarkAllRead?: () => void;
    onItemClick?: (id: string, link: string | null) => void; onRetry?: () => void }`. **No data
    fetching inside** — the app passes state + callbacks (Task 9).
  - **Trigger:** a `DropdownMenuTrigger` rendering a `Bell` icon button (sized to match `ThemeToggle`,
    `aria-label="Notifications"`; when `unreadCount > 0`, `aria-label="Notifications, {unreadCount}
    unread"`). The unread `Badge` (existing `@ip/ui` `Badge`, `tone="brand"`, small) overlays the
    bell's top-right, shows `unreadCount > 9 ? "9+" : unreadCount`, and is **hidden at 0**. A visually
    hidden `<span aria-live="polite" aria-atomic="true">` mirrors the count (e.g. "3 unread
    notifications") so SRs announce increments from the poll without moving focus.
  - **Feed (`DropdownMenuContent`, width ~`w-80`/`sm:w-96`, `max-h-[70vh] overflow-y-auto`):** a header
    row ("Notifications" + a "Mark all read" `Button variant="ghost" size="sm"` that calls
    `onMarkAllRead`, **disabled when `unreadCount === 0`**); then the body which switches on state —
    **loading** → 3 `Skeleton` rows; **error** → `ErrorState` (compact) with `onRetry`; **empty** →
    `EmptyState` titled **"You're all caught up"** (`icon={Bell}`, muted "New notifications will show up
    here."); else the list of `NotificationItem`s, each wired to `onItemClick(id, link)`.
  - **Open behavior:** `onOpenChange(open)` fires on dropdown open so the connector can mark-all-read
    on open (per spec §3.4). Theme via violet/dark tokens; responsive (full-width-ish dropdown on
    mobile, anchored on desktop — `DropdownMenuContent` already handles collision/anchor).

- [ ] **Step 5 — exports + typecheck:** add `NotificationBell`, `NotificationItem` (+ their prop types)
  to `…/ui/src/index.ts`, and `createNotificationsClient`, `notificationKeys`, `pollInterval`, types
  `Notification`/`NotificationKind` to `…/shared/src/index.ts`. Run `npx pnpm@9.15.0
  --filter @ip/{shared,api-client,ui} typecheck` → green. (`@ip/ui` must NOT gain a `@ip/shared` or
  `@tanstack/react-query` dep — verify the import graph stays presentation-only.)

### Task 9 — connect + mount the bell in both apps (data layer + state)
**Files:** Create `frontend/apps/candidate/components/notification-bell-connected.tsx` +
`frontend/apps/company/components/notification-bell-connected.tsx`; Modify
`frontend/apps/candidate/components/candidate-shell.tsx` +
`frontend/apps/company/components/company-shell.tsx`.
**Pattern:** the connector is the `@ip/shared` ↔ `@ip/ui` seam — it owns the client, the TanStack
queries/mutations, and the `kind`→icon map; the shell just renders `<NotificationBellConnected />` in
its existing header `actions` slot (before the user-menu `DropdownMenu`). Each app already builds its
authed `ApiClients` (via `createClients`, transport task) + wraps the tree in a `QueryClientProvider`
(`makeQueryClient`) — reuse both; add no providers.

- [ ] **Step 1 — candidate `notification-bell-connected.tsx`** (`"use client"`):
  - Build the client once: `const client = useMemo(() => createNotificationsClient(clients), [clients])`
    (`clients` from the app's auth/clients context, as other components get it).
  - **Badge poll query (the durable seam):** `useQuery({ queryKey: notificationKeys.unread(), queryFn:
    () => client.unreadCount(), refetchInterval: pollInterval, refetchIntervalInBackground: false })` —
    `refetchIntervalInBackground: false` is the **hidden-tab pause** (TanStack stops the interval when
    `document.visibilityState !== "visible"`). This count drives the `Badge` + `aria-live`.
  - **Feed query (lazy):** `useQuery({ queryKey: notificationKeys.feed(false), queryFn: () =>
    client.list({ page: 1, pageSize: 20 }), enabled: open })` — only fetches when the dropdown is open
    (`open` state lifted into the connector via `onOpenChange`), so a closed bell costs one tiny
    unread poll, not a feed pull.
  - **Mark-all-read on open:** in `onOpenChange(next)`, set `open`; when `next === true` and
    `unreadCount > 0`, fire the `markAllRead` mutation. **Mark-one on click:** `onItemClick(id, link)`
    → `markRead(id)` mutation, then `router.push(link)` when `link` is set (deep-link). Both mutations
    use `onSuccess` to **`queryClient.setQueryData(notificationKeys.unread(), freshCount)`** (the count
    the RPC returns) for an instant badge update, and **`invalidateQueries({ queryKey:
    notificationKeys.all })`** so the open feed + badge reconcile against the server. (Optimistic set +
    invalidate = snappy badge, correct on next settle.)
  - Render `<NotificationBell notifications={feed.data?.notifications ?? []}
    unreadCount={unread.data ?? 0} loading={feed.isLoading} error={feed.error ? errorMessage(feed.error)
    : null} onOpenChange={…} onMarkAllRead={…} onItemClick={…} onRetry={() => feed.refetch()} />`.
    Provide the `kind`→`LucideIcon` map here (icons imported from `lucide-react` **in the app** — the
    documented `@ip/ui` lucide gotcha): e.g. `interview_pending→CalendarClock`, `new_message→MessageSquare`,
    `assessment_ready`/`aptitude_pending→ClipboardCheck`, `practice_complete→Dumbbell`,
    `shortlisted→Star`, `hired→PartyPopper`, `rejected`/`gated_out→XCircle`, fallback `Bell`.

- [ ] **Step 2 — mount in `candidate-shell.tsx`:** import `NotificationBellConnected` and render it in
  the `actions` slot **before** the account `DropdownMenu` (i.e. `<ThemeToggle /><NotificationBellConnected
  /><DropdownMenu>…`). No other shell change. (The bell only renders for an authed user — the shell is
  already gated.)

- [ ] **Step 3 — company `notification-bell-connected.tsx` + mount:** same wiring as candidate, with
  **company kind-scoping** — the company recruiter must never see candidate-only/practice rows
  (`practice_complete`, and any candidate-personal `kind`). Two layers of defense:
  1. Pass `unreadOnly`/page through unchanged, but filter the *rendered* feed to a `COMPANY_KINDS`
    allow-set (`new_message`, funnel transitions the recruiter cares about) before handing
    `notifications` to `<NotificationBell>`; drop `comp_id`-less rows defensively. (Detached practice
    rows carry `comp_id=None` and are candidate-recipient-scoped, so the backend feed already excludes
    them for a recruiter identity — this FE filter is belt-and-suspenders for mixed kinds.)
  2. Mount in `company-shell.tsx`'s `actions` slot before the account menu, same as candidate. The
    company connector uses the same query keys/poll/invalidation; only the icon map + the
    `COMPANY_KINDS` render filter differ.

- [ ] **Step 4 — states + a11y + responsive pass (both apps):** confirm against the running app —
  **loading** shows skeleton rows, **empty** shows "You're all caught up", **error** shows the compact
  `ErrorState` + retry; the `aria-live="polite"` count announces on poll increment without stealing
  focus; the bell button + "Mark all read" have labels; keyboard open/close + arrow-through items work
  (Radix `DropdownMenu` gives this — verify focus returns to the trigger on close); dropdown is
  readable at mobile width and correct in dark mode (violet tokens).

- [ ] **Step 5 — verify builds:** `npx pnpm@9.15.0 --filter @ip/candidate build` + `--filter @ip/company
  build` green; **no console errors / no hydration warnings** (bell is `"use client"`).

- [ ] **Step 6 — full gate + both FE builds + `--filter @ip/{ui,shared,api-client} typecheck` green;
  update `HANDOFF.md` + memory.**

---

## Verification (end-to-end)

1. **Per backend task:** `bash scripts/check.sh` GREEN (grows from **423**). The chokepoint + reads are
   pure-Python over injected repos + the `LoggingNotifier` seam — fully unit-tested offline; no network.
2. **Chokepoint (the core, offline):** `test_resources_notification.py` proves — for every notifiable
   state incl. **`assessment_review`** — a **row is written AND an email sent**; non-notifiable states
   write neither; a missing recipient writes neither; and **email-fails-row-persists** (the durable
   channel survives an email outage).
3. **`notify_event`:** non-funnel kinds (`new_message`/`assessment_ready`/`practice_complete`) write
   the right row + email to an explicit recipient; an unknown kind is a no-op.
4. **Read service:** `test_routes_notification.py` proves recipient scoping, `unread_count`,
   page-size clamp, `MarkRead` 404-for-others, `MarkAllRead`, `_STATUS` mapping, no logic in the
   adapter.
5. **Best-effort integration:** the funnel transition still completes when the notifications repo
   raises (covered by `advance_application`'s existing swallow); messaging's send still succeeds when
   `notify_event` raises (asserted in the messaging suite).
6. **Erasure (Inc 0/4):** `erase` deletes the user's notifications while applications/audit survive.
7. **Frontend:** `@ip/{shared,api-client,ui}` typecheck + both app builds green; `@ip/ui` stays
   presentation-only (no `@ip/shared` / `@tanstack/react-query` in its import graph). The bell shows
   the unread `Badge` (hidden at 0, "9+" past 9), opens the `DropdownMenu` feed, renders the
   loading/empty ("You're all caught up")/error states, marks-all-read on open + per-item `markRead` on
   click (deep-links via `link`), and the badge updates from the unread poll; poll pauses on a hidden
   tab (`refetchIntervalInBackground: false`); the `aria-live` count announces increments. Company feed
   excludes detached practice (`comp_id=None`) + candidate-only kinds.
8. **Manual / local E2E (Chrome via preview):** advance an application to `interview_pending` → the
   candidate bell badge increments within one poll + an email lands in the `LoggingNotifier` sink;
   open the feed → badge clears; a new message (messaging) and an advisory grade each also produce a
   feed row + email.

## Risks / re-verify at execution

- **`TransitionNotifier` construction site.** The repo must be threaded into the *existing*
  `transition_notifier` instance (find where `create_web_app` is called — `main.py` — and the
  `TransitionNotifier(...)` it passes). Missing this means rows silently never get written even though
  emails still send. Assert a row is written in the integration test.
- **Best-effort can drop a notification.** If the row write **and** the email both fail, the user gets
  nothing. Both are logged (no `except: pass`); the originating operation never blocks. A
  retry/outbox is explicitly **out of v1 scope** — flagged as a follow-up.
- **`_MESSAGES` read by two limbs** (row + email). A wording edit touches both — by design; the row
  denormalizes subject/body at write time, so historical rows are records, not live views.
- **Proto/codegen drift.** Regenerate the TS client after `notification.proto`; don't hand-edit.
- **Badge poll cadence** (~30 s) is a starting point; `refetchIntervalInBackground: false` so a hidden
  tab stops polling. **SSE is explicitly NOT built here** (spec §3.4) — leave the badge poll seam as
  the documented swap point.
- **Detached practice rows** (`comp_id=None`) must never appear in a company feed — the company bell
  filters to comp-scoped kinds / `comp_id`; verify in the company E2E.
- **No preferences in v1** → every notifiable event emails. If funnel emails feel noisy, the documented
  follow-up is a per-user preferences doc gating which `kind`s email vs. in-app-only (additive).
