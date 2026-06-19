# Interview Scheduling (live human interview) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this task-by-task. Steps use `- [ ]` checkboxes.
> Spec: `docs/superpowers/v2/2026-06-19-interview-scheduling-design.md`. Canonical design:
> `docs/superpowers/v2/2026-06-19-v2-architecture-overview-design.md` (§5 Pillar C, §6, §7). Sibling
> patterns to mirror: `…-messaging.md` (servicer + erasure + poll FE) and `…-notifications-center.md`
> (the `notify_event` trigger + `_MESSAGES`).

**Goal:** Coordinate the **live human interview** after the AI screen passes. A recruiter **proposes a
set of time slots** for an application that reached `interview_pending`/`shortlisted`; the candidate
**picks one** (one-way scheduling, timezone-aware, **stored UTC**). A **double-booking CAS** prevents two
picks winning. **Reminders** at T-24h/T-1h ride the **existing admin scheduler loop**; **reschedule/
cancel** re-notify. An **ICS invite** is generated on `booked` (OAuth calendar push is a documented
later item). A new authed gRPC-web **`SchedulingService`** on **admin** (owns Mongo) + a candidate
"pick a time" page + a company "propose times / view bookings" tab reuse `@ip/ui`. Slots + bookings
**join the `CandidateEraser` cascade** (Inc 0). **No new funnel state / `FunnelEvent` / application
CAS** — a funnel-adjacent side layer. **No new infra.**

**Architecture:** New `resources/scheduling.py` (the contract: authz + the ready-for-live gate +
tenancy + the CAS pick + status bookkeeping + reminder scheduling + DTO shaping) over two repositories
(`interview_slots`, `interview_bookings`) + two models + one pure ICS helper. A thin
`SchedulingServicer` adapts gRPC-web to the resource (mirrors `routes/decision.py`). `reminder_sweep`
is added to `resources/scheduler.py` and wired into `main.py`'s `run_schedulers()` next to
`aptitude_expiry_pass`. The candidate page + company tab poll `GetSchedule` via TanStack
`refetchInterval`; a new `@ip/shared/scheduling.ts` wraps the gRPC-web calls + an `Intl`-based local
render. **Authz reuses** `aptitude._owned` (candidate) and `decision._scoped` + `decision._require_manager`
(company). The booking status machine is **independent of the funnel** (spec §3.3).

## Global Constraints

- **LOCAL-ONLY — never run git/gh.** "Commit" steps are replaced by **"run the gate"**:
  `bash scripts/check.sh` (ruff format+lint S-rules line-88, pip-audit, pytest ×5) must stay green;
  baseline today is **423 tests**. Frontend verified by `npx pnpm@9.15.0 --filter @ip/candidate build`
  + `--filter @ip/company build` + `--filter @ip/{ui,shared,api-client} typecheck`. Never `next build`
  while `pnpm dev` is live.
- **Robustness bar:** validate at boundaries (recruiter `location`/`note`/`slots` and the candidate's
  chosen `start_at` are input — required/trimmed/capped/future-dated/de-duplicated); trust internal
  typed calls (no defensive coercion); every notify call is **best-effort** (try/except +
  `get_logger` structured log, never blocks the operation — mirror `advance_application`'s wrap around
  its notifier). Follow `~/.claude/CLAUDE.md` (minimal, trust-the-system, validate-at-boundaries) and
  `docs/superpowers/plans/PRODUCTION_STANDARDS.md`.
- **Authz reuse (do NOT invent a new primitive):** candidate path → `aptitude._owned`; company path →
  `decision._scoped` + `decision._require_manager`. Authorize against the **application**; slots +
  booking are 1:1-per-application with it (spec §3.2).
- **Funnel untouched (the load-bearing constraint):** **no** new `ApplicationState`/`FunnelEvent`, **no**
  application CAS. The booking has its **own** status (`proposed`/`booked`/`completed`/`cancelled`) +
  `version` CAS. Scheduling only **reads** the application's `state` for the ready-for-live gate
  (`interview_pending`/`shortlisted`) — it **never writes** funnel state (spec §3.3).
- **UTC discipline:** every persisted instant is timezone-aware UTC (`datetime.now(UTC)`); the viewer's
  zone is applied **only** at the FE render (`Intl.DateTimeFormat`); the propose form converts local→UTC
  **before** the call; the sweep + ICS do zero tz math (spec §3.9).
- **Resource is the contract:** no authz/tenancy/gate/CAS/DTO logic in the servicer or any FE adapter.
- **Ordering with notifications:** this plan adds the **best-effort calls**; the notification **row +
  email** assertions live in `…-notifications-center.md`. If that increment landed, call its
  `notify_event` with the new `kind`s; if not, call the existing best-effort notifier shape
  (`NotificationRequestPublisher`/`TransitionNotifier`) behind the same swallow-and-log boundary and
  swap later (flag at handoff). Add the new `_MESSAGES` kinds to the center when it lands.

---

## File structure (new + modified)

```
src/admin/app/
  model/scheduling.py                       (NEW — InterviewSlots + InterviewBooking + ProposedSlot pydantic models)
  infra/repositories/
    interview_slots.py                      (NEW — InterviewSlotsRepository + delete_by_applications)
    interview_bookings.py                   (NEW — InterviewBookingRepository: CAS choose/cancel/stamp + sweep reads + delete_by_applications)
  infra/db.py                               (+INDEXES: interview_slots ×2, interview_bookings ×4)
  resources/scheduling.py                   (NEW — the contract: authz + ready-for-live gate + CAS pick + status + reminders + DTO + best-effort notify)
  resources/scheduling_ics.py               (NEW — pure ICS VEVENT builder, `icalendar`)
  resources/scheduler.py                    (+reminder_sweep — mirror aptitude_expiry_pass)
  resources/compliance.py                   (CandidateEraser: +slots/+bookings cascade)
  routes/pb/scheduling.proto                (NEW) + generated scheduling_pb2*.py (via buf/protoc + pnpm gen)
  routes/scheduling.py                      (NEW — SchedulingServicer, thin adapter)
  routes/web.py                             (+register SchedulingServicer; +slots/+bookings in make_eraser; thread RateLimiter + notifier)
  main.py                                   (+scheduling repos into run_schedulers; +reminder_sweep call)

src/admin/tests/
  test_resources_scheduling.py              (NEW — authz, gate, slot validation, CAS pick, reschedule, cancel, DTO, rate-limit)
  test_scheduling_ics.py                    (NEW — VEVENT shape, stable UID, UTC DTSTART, SEQUENCE on reschedule)
  test_routes_scheduling.py                 (NEW — servicer status mapping + caller_identity)
  test_scheduler.py                         (extend — reminder_sweep: at-most-once stamp, best-effort, complete_past)
  test_resources_compliance.py              (extend — erase deletes slots+bookings)
  conftest.py                               (+fake slots/bookings repos + a fake clock if the suite uses fakes)

frontend/packages/api-client/src/
  index.ts                                  (+scheduling_pb import/re-export; +SchedulingService in ApiClients + clientsFromTransport)
frontend/packages/shared/src/
  scheduling.ts                             (NEW — createSchedulingClient: propose/getSchedule/choose/reschedule/cancel/ics + query-key helpers)
  datetime.ts                               (NEW — formatLocal(isoUtc) via Intl + localInputToUtcIso helpers; UTC↔local at the boundary)
  index.ts                                  (+export createSchedulingClient + formatLocal/localInputToUtcIso + re-export ScheduleDTO/BookingDTO)
frontend/apps/candidate/
  lib/use-schedule.ts                       (NEW — poll GetSchedule + choose/cancel mutations)
  app/interviews/page.tsx                   (NEW — candidate's interviews list: upcoming/past, unread-ish "action needed" first)
  app/interviews/[applicationId]/page.tsx   (NEW — the "pick a time" page: offered slots in LOCAL zone, choose, ICS download, cancel)
  components/candidate-shell.tsx            (+/interviews nav entry)
frontend/apps/company/
  app/jobs/[id]/applicants/[appId]/page.tsx (MODIFY — add a "Schedule" tab beside Report/Messages: propose form + bookings view)
  components/schedule-panel.tsx             (NEW — recruiter propose form (local→UTC) + current booking status + reschedule/cancel + ICS)
```

**Responsibilities (one job each):** `resources/scheduling.py` = all logic (authz/gate/tenancy/CAS/
status/reminders/DTO/best-effort notify). `resources/scheduling_ics.py` = a pure `VEVENT` string.
`resources/scheduler.reminder_sweep` = the periodic reminder/complete pass (no authz — system job).
`routes/scheduling.py` = gRPC adapter only. `scheduling.ts` = transport + query keys. `datetime.ts` =
the single UTC↔local boundary. The candidate page + company panel = thin app-local UI over the shared
client.

---

## TIER A — data + the resource contract (the core; pure-logic, fully unit-tested)

### Task 1 — models + repositories + indexes
**Files:** Create `model/scheduling.py`, `infra/repositories/interview_slots.py`,
`infra/repositories/interview_bookings.py`; Modify `infra/db.py`.
**Deliverable:** the two collections + their indexes exist; repos expose the reads/writes + the CAS
operations + the cascade deletes the resource needs.

- [ ] **Step 1 — `model/scheduling.py`** — mirror `model/aptitude.py` style (`BaseModel`,
  `Field(default_factory=lambda: datetime.now(UTC))`, UTC datetimes):
  - `ProposedSlot(BaseModel)`: `start_at: datetime`, `duration_minutes: int`.
  - `InterviewSlots(BaseModel)`: `comp_id`, `application_id`, `proposed_by`, `slots: list[ProposedSlot]`,
    `location: str | None = None`, `note: str | None = None`, `status: str = "open"`, `created_at`.
  - `InterviewBooking(BaseModel)`: `comp_id`, `application_id`, `candidate_user_id`, `slots_id`,
    `chosen_start_at: datetime | None = None`, `duration_minutes: int | None = None`,
    `location: str | None = None`, `status: str = "proposed"`, `cancelled_by: str | None = None`,
    `reminded_24h_at: datetime | None = None`, `reminded_1h_at: datetime | None = None`,
    `version: int = 0`, `created_at`, `updated_at` (default-now).
- [ ] **Step 2 — repositories** (extend `lib.mongodb.BaseRepository`, mirror `aptitude_attempts.py`;
  reuse the `_oid` guard pattern from `applications.py` so a bad id is a clean miss, not INTERNAL):
  - `InterviewSlotsRepository(collection="interview_slots")`: `create(slots) -> id`,
    `get_open_for_application(application_id) -> dict | None` (status `open`),
    `supersede_open(application_id, now)` (`update_many` open→superseded),
    `list_for_application(application_id)` (history, desc), `delete_by_applications(application_ids)`.
  - `InterviewBookingRepository(collection="interview_bookings")`:
    - `create(booking) -> id`, `get_by_application(application_id) -> dict | None`,
    - **`choose_if_proposed(booking_id, *, expected_version, chosen_start_at, duration_minutes,
      location, now) -> bool`** — the double-booking CAS (filter `status=="proposed"` +
      `version==expected_version` → set `booked` + the chosen fields + `$inc version`,
      `modified_count == 1`); mirror `ApplicationRepository.set_state_if`.
    - **`cancel_if(booking_id, *, expected_version, by, now) -> bool`** — CAS from `proposed`/`booked`
      → `cancelled` + `cancelled_by` + `$inc version`.
    - **`reset_to_proposed(booking_id, *, expected_version, slots_id, now) -> bool`** — CAS (any
      non-`cancelled`… actually from `proposed`/`booked`/`cancelled`) → `proposed`, clear
      `chosen_start_at`/`duration`/`location`/`reminded_*`, point `slots_id`, `$inc version` (used by
      reschedule **and** revive-after-cancel, spec §3.6/Open-Q).
    - **`stamp_reminder_if_unset(booking_id, field, now) -> bool`** — CAS (`{_id, field: None,
      status: "booked"} → {$set: {field: now}}`) for at-most-once reminders.
    - `due_reminders(*, window, now) -> list[dict]` — `status=="booked"`, the window's `reminded_*` is
      None, `now < chosen_start_at <= now + window` (24h or 1h); backed by `(status, chosen_start_at)`.
    - `complete_past(*, now) -> int` — `update_many` `booked` rows with `chosen_start_at + duration`
      past → `completed`. (Compute the cutoff per-row or store the end; simplest: filter
      `chosen_start_at <= now - <max duration>` is wrong — instead compute end at write time **or** use
      an aggregation; **decision:** store nothing extra, filter `status=="booked"` +
      `chosen_start_at <= now` then in Python skip those still within duration — small collection. Keep
      it correct over clever.)
    - `list_for_candidate(candidate_user_id)`, `list_for_company(comp_id, *, status?)` (the FE lists),
      `delete_by_applications(application_ids)`.
- [ ] **Step 3 — indexes** in `infra/db.py` `INDEXES` (the single index authority):
```python
# interview scheduling — proposals (append-only history per application)
IndexSpec("interview_slots", [("application_id", 1), ("created_at", -1)]),
IndexSpec("interview_slots", "comp_id"),
# bookings — one current booking per application (the 1:1 invariant the CAS relies on)
IndexSpec("interview_bookings", "application_id", {"unique": True}),
IndexSpec("interview_bookings", [("comp_id", 1), ("status", 1)]),
IndexSpec("interview_bookings", [("candidate_user_id", 1), ("status", 1)]),
IndexSpec("interview_bookings", [("status", 1), ("chosen_start_at", 1)]),  # reminder sweep read path
```
- [ ] **Step 4 — gate:** `bash scripts/check.sh` green (models/repos are import-only; no behavior yet).

### Task 2 — `resources/scheduling.propose_slots` + `reschedule` (TDD — gate + eager booking shell)
**Files:** Create `resources/scheduling.py`; Test `tests/test_resources_scheduling.py`.
**Interfaces — Produces:** `async propose_slots(identity, application_id, slots, *, location=None,
note=None, applications, slots_repo, bookings, limiter=None, notifier=None, clock=_utcnow) -> dict`
(the schedule DTO) and `async reschedule(identity, application_id, slots, *, location=None, note=None,
applications, slots_repo, bookings, limiter=None, notifier=None, clock=_utcnow) -> dict`.
**Consumes:** `decision._scoped` + `decision._require_manager`; `ApplicationState` (from
`lib.schemas`).

- [ ] **Step 1 — failing tests** (mirror `test_resources_decision`/`_messaging` style; in-memory/fake
  repos + a fixed `clock`):
  - **gate:** propose on an application in `interview_pending` → allowed (creates one `open`
    `InterviewSlots` + one **eager `proposed` booking**, `comp_id`/`candidate_user_id` copied from the
    application, `proposed_by == identity["id"]`); on `shortlisted` → allowed; on `applied` /
    `aptitude_pending` / `scored` → `ValidationError` (assert no slots/booking written).
  - **authz:** a wrong-`comp_id` manager → `NotFoundError`; a non-manager company role →
    `ForbiddenError`; a candidate calling propose → `ForbiddenError` (the manager branch rejects).
  - **slot validation:** empty `slots` → `ValidationError`; > `MAX_SLOTS` (10) → `ValidationError`; a
    `start_at` in the past (vs `clock`) → `ValidationError`; `duration_minutes` outside `[15, 480]` →
    `ValidationError`; over-cap `location` (> `MAX_LOCATION` 512) / `note` (> `MAX_NOTE` 1024) →
    `ValidationError`; duplicate slots de-duplicated (assert the stored set has no dups).
  - **eager shell:** exactly **one** booking row after propose (`status == "proposed"`,
    `chosen_start_at is None`, `version == 0`); a second `propose` on the same application
    **supersedes** the old proposal, inserts a fresh `open` one, and **resets** the booking to
    `proposed` (the reschedule-style path — exactly one booking row throughout).
  - **reschedule:** from a `booked` booking → supersedes the `open` proposal, inserts a fresh `open`
    one, CAS-resets the **same** booking to `proposed` (version bumped, `chosen_start_at`/`reminded_*`
    cleared); still one booking row.
  - **rate-limit:** with a fake limiter returning `allowed=False` → `RateLimitedError`.
- [ ] **Step 2 — run** `(cd src/admin && ../../.venv/bin/python -m pytest tests/test_resources_scheduling.py -v)` → FAIL.
- [ ] **Step 3 — implement.** Define module constants at the top: `MAX_SLOTS = 10`, `MAX_LOCATION = 512`,
  `MAX_NOTE = 1_024`, `MIN_DURATION = 15`, `MAX_DURATION = 480`,
  `_SCHEDULABLE_STATES = {ApplicationState.interview_pending.value, ApplicationState.shortlisted.value}`.
  A private `_application_for(identity, application_id, *, applications)` branches on role (candidate →
  `await aptitude._owned(...)`; manager → `decision._require_manager(identity)` then
  `await decision._scoped(...)`). `_require_schedulable(application)` raises `ValidationError` unless
  `application["state"] in _SCHEDULABLE_STATES`. `_validate_slots(slots, *, now)` trims/caps/de-dups/
  future-checks → a clean `list[ProposedSlot]` (raise `ValidationError` on any breach). `propose_slots`:
  manager-auth + gate + validate + (optional) `limiter.hit(...)`; `slots_repo.supersede_open(...)`;
  `slots_repo.create(...)`; `bookings.get_by_application(...) or create(proposed shell)` and if it
  exists `reset_to_proposed(...)`; best-effort notify the candidate (`kind="interview_proposed"`); return
  the schedule DTO. `reschedule` is the same minus eager-create (the booking exists) — supersede + new
  proposal + `reset_to_proposed` + notify `kind="interview_rescheduled"`. **Reuse** the helpers — do
  not duplicate authz.
- [ ] **Step 4 — run → PASS.** Add the validation + authz negative cases.
- [ ] **Step 5 — gate green.**

### Task 3 — `get_schedule` + `choose_slot` (CAS) + `cancel` (TDD — the double-booking core)
**Files:** Modify `resources/scheduling.py`; Test `tests/test_resources_scheduling.py`.
**Interfaces — Produces:** `get_schedule(identity, application_id, *, applications, slots_repo,
bookings)`, `choose_slot(identity, application_id, start_at, *, applications, slots_repo, bookings,
notifier=None, clock=_utcnow)`, `cancel(identity, application_id, *, applications, slots_repo,
bookings, notifier=None, clock=_utcnow)`.

- [ ] **Step 1 — failing tests:**
  - **read (both roles):** candidate `get_schedule` returns the `open` proposal's offered slots + the
    booking status for **their** application (reuses `_owned`); manager `get_schedule` returns the same
    for **their `comp_id`**'s application; non-owner candidate → `Forbidden`; wrong-tenant manager →
    `NotFound`. The DTO is a **strict subset** (offered slots, booking status, chosen time, location,
    note — no unrelated application fields).
  - **choose CAS (the guard):** a candidate picking an **offered** `start_at` flips `proposed →
    booked`, stamps `chosen_start_at`/`duration`/`location` (copied from the matching `ProposedSlot`),
    bumps `version`; assert exactly one `booked` with the right `chosen_start_at`. A **second** pick
    (simulate a stale `version` / an already-`booked` row by calling `choose_slot` twice or by pre-
    setting the booking `booked`) → `ConflictError` (message ~"slot no longer available"), the booking
    stays the **first** pick. Picking a `start_at` **not in** the proposal's `slots` → `ValidationError`
    (independent of CAS — assert it raises **before** any CAS write). A manager calling `choose_slot` →
    `ForbiddenError` (choosing is the candidate's action; the candidate branch is required).
  - **cancel:** candidate-cancel CAS `proposed`/`booked` → `cancelled`, `cancelled_by == "candidate"`,
    notify the recruiter side; recruiter-cancel → `cancelled_by == "recruiter"`, notify the candidate;
    a **double-cancel** is a no-op (second CAS `modified_count == 0` → treat "already cancelled" as
    success, mirror `advance_application`'s redelivery handling).
- [ ] **Step 2 — run → FAIL → implement → PASS.** `get_schedule` authorizes via `_application_for`,
  loads the `open` proposal + the booking, shapes the DTO. `choose_slot`: candidate-auth
  (`_owned`); load the booking + its `open` proposal; **validate `start_at` ∈ offered slots**
  (`ValidationError` else) and find its `ProposedSlot` (duration/location); then
  `bookings.choose_if_proposed(booking_id, expected_version=booking["version"], ...)` →
  `ConflictError` if `False`; best-effort notify the recruiter (`kind="interview_booked"`). `cancel`:
  `_application_for` (either role); `bookings.cancel_if(..., by=<role-derived>)`; if it returned
  `False` and the row is already `cancelled`, return success (idempotent); else best-effort notify the
  **other** party (`kind="interview_cancelled"`). Both keep the funnel untouched (no `advance_*`).
- [ ] **Step 3 — gate green.**

### Task 4 — ICS generation (TDD — pure string, offline)
**Files:** Create `resources/scheduling_ics.py`; Test `tests/test_scheduling_ics.py`. Add `icalendar`
to `src/admin/pyproject.toml`.
**Interfaces — Produces:** `build_ics(booking: dict, *, job_title: str, organizer_email: str | None,
attendee_email: str | None, deep_link: str | None) -> tuple[str, str]` returning `(filename, content)`.

- [ ] **Step 1 — failing tests:** a `booked` booking → a `VEVENT` whose `UID ==
  f"aptura-interview-{booking_id}@aptura"` (stable: building twice yields the same `UID` → an update,
  not a duplicate); `DTSTART`/`DTEND` are UTC (`...Z`) and `DTEND == DTSTART + duration_minutes`;
  `SUMMARY` contains the job title; `LOCATION` == the booking's `location`; a `SEQUENCE` that is higher
  after a reschedule (pass `sequence=booking["version"]` so a re-sent invite is an **update**). Assert
  the output parses back via `icalendar.Calendar.from_ical(...)` (round-trip valid).
- [ ] **Step 2 — implement** with `icalendar` (`Calendar()` + `Event()`; `vDatetime` in UTC; set
  `uid`, `dtstart`, `dtend`, `summary`, `location`, `description`, `sequence`, and `organizer`/
  `attendee` when emails are present). Pure function — **no network, no Mongo** (the gate stays
  offline). `filename = f"interview-{booking_id}.ics"`.
- [ ] **Step 3 — gate green** (`icalendar` is a pure-Python dep; `pip-audit` clean).

---

## TIER B — the reminder sweep (rides the existing scheduler loop)

### Task 5 — `reminder_sweep` in `resources/scheduler.py` + wire into `main.py` (TDD)
**Files:** Modify `resources/scheduler.py`, `src/admin/app/main.py`; Test `tests/test_scheduler.py`
(extend).
**Interfaces — Produces:** `async reminder_sweep(*, bookings, notifier, now) -> int` (mirror
`aptitude_expiry_pass`'s `(*, ..., now, ...)` shape).

- [ ] **Step 1 — failing tests** (extend `test_scheduler.py`; fake bookings repo + fake notifier +
  fixed `now`):
  - a `booked` interview starting **in 20h** with `reminded_24h_at is None` → `reminder_sweep` fires
    **one** `interview_reminder_24h` (fake notifier records exactly one call for that booking) **and**
    `stamp_reminder_if_unset` set `reminded_24h_at`; a **second** `reminder_sweep` at the same `now`
    fires **nothing** (the stamp is set) — the at-most-once guarantee.
  - the **T-1h** window is symmetric (`reminded_1h_at`); a booking starting in **30 min** fires only the
    1h reminder (the 24h window no longer matches); a `cancelled`/`completed`/`proposed` booking is
    **never** reminded.
  - **best-effort:** a notifier that **raises** does **not** raise out of `reminder_sweep` (assert it
    returns, the raise is swallowed+logged) and other due bookings still process.
  - **`complete_past`:** a `booked` booking whose `chosen_start_at + duration` is in the past →
    `completed` (no notification); a future `booked` one is untouched.
- [ ] **Step 2 — run → FAIL → implement → PASS.** Implement `reminder_sweep` per spec §3.5 (query
  `due_reminders(window="24h")` then `"1h"`, **stamp-then-notify** so a flaky notifier can't re-fire,
  best-effort each notify, then `complete_past(now=now)`; return the fired count + `log.info` like the
  other passes). The notify recipient is the booking's `candidate_user_id` (the candidate is reminded);
  call the center's `notify_event` if landed, else the best-effort fallback shape (Global Constraints).
- [ ] **Step 3 — wire into `main.py`'s `run_schedulers()`** — alongside `retention_pass` +
  `aptitude_expiry_pass`, inside the **same** `try`, add:
```python
await scheduler.reminder_sweep(
    bookings=scheduling_bookings,   # InterviewBookingRepository(db), constructed near the other repos
    notifier=notification_publisher,
    now=now,
)
```
  Construct `scheduling_bookings = InterviewBookingRepository(mongo.db)` where the other scheduler deps
  are built. (The sweep is a **system job** — no identity, no authz; it acts on all tenants' due
  bookings, exactly like `aptitude_expiry_pass`.)
- [ ] **Step 4 — gate green.** (The loop itself isn't unit-tested — `run_schedulers` is infra; the
  **sweep function** is fully tested offline. Mirrors how `aptitude_expiry_pass` is tested but the loop
  is not.)

---

## TIER C — transport: the gRPC-web service (proto → servicer → register) + erasure

### Task 6 — `scheduling.proto` + generate the client
**Files:** Create `routes/pb/scheduling.proto`; run the generator.
**Deliverable:** `scheduling_pb2.py` / `scheduling_pb2_grpc.py` (admin) + the TS client generated for
`@ip/api-client`.

- [ ] **Step 1 — `scheduling.proto`** (`package admin.scheduling.v1`; mirror `decision.proto` shape;
  all datetimes are **ISO-8601 UTC strings** on the wire — spec §3.9):
```proto
service SchedulingService {
  rpc ProposeSlots(ProposeSlotsRequest) returns (ScheduleDTO);
  rpc Reschedule(ProposeSlotsRequest) returns (ScheduleDTO);   // same shape; resource branches
  rpc GetSchedule(GetScheduleRequest) returns (ScheduleDTO);
  rpc ChooseSlot(ChooseSlotRequest) returns (ScheduleDTO);
  rpc Cancel(CancelRequest) returns (ScheduleDTO);
  rpc GetIcs(GetIcsRequest) returns (IcsResponse);
  rpc ListCandidateInterviews(ListCandidateRequest) returns (BookingListResponse);
  rpc ListCompanyBookings(ListCompanyRequest) returns (BookingListResponse);
}
message ProposedSlot { string start_at = 1; int32 duration_minutes = 2; }   // start_at = ISO-8601 UTC
message ProposeSlotsRequest {
  string application_id = 1; repeated ProposedSlot slots = 2; string location = 3; string note = 4;
}
message GetScheduleRequest { string application_id = 1; }
message ChooseSlotRequest { string application_id = 1; string start_at = 2; }  // must be an offered slot
message CancelRequest { string application_id = 1; }
message GetIcsRequest { string application_id = 1; }
message IcsResponse { string filename = 1; string content = 2; }
message ScheduleDTO {
  string application_id = 1; string status = 2;          // booking status: proposed/booked/completed/cancelled
  repeated ProposedSlot slots = 3;                        // the open proposal's offered set ([] if none open)
  string chosen_start_at = 4; int32 chosen_duration_minutes = 5;
  string location = 6; string note = 7; string cancelled_by = 8;
}
message BookingDTO {
  string application_id = 1; string status = 2; string chosen_start_at = 3;
  int32 chosen_duration_minutes = 4; string location = 5;
}
message ListCandidateRequest { int32 page = 1; int32 page_size = 2; }
message ListCompanyRequest { string status = 1; int32 page = 2; int32 page_size = 3; }
message BookingListResponse { repeated BookingDTO bookings = 1; int32 page = 2; int32 page_size = 3; int32 total = 4; }
```
- [ ] **Step 2 — generate** the Python stubs (same toolchain as the existing `pb/*` — buf/protoc) and
  the TS client via `npx pnpm@9.15.0 --filter @ip/api-client gen`. (Both are committed-style generated
  artifacts; regenerate, don't hand-edit.)
- [ ] **Step 3 — gate green** (generated stubs import cleanly).

### Task 7 — `SchedulingServicer` (TDD — thin adapter) + register
**Files:** Create `routes/scheduling.py`; Modify `routes/web.py`; Test `tests/test_routes_scheduling.py`.
**Interfaces — Consumes:** `resources/scheduling.*`, `resources/scheduling_ics.build_ics`,
`caller_identity`, `_STATUS` (from `routes/auth`).

- [ ] **Step 1 — failing servicer tests** (mirror the decision/aptitude servicer tests):
  `ProposeSlots` 200 returns a `ScheduleDTO` for a manager of the tenant; `ChooseSlot` 200 for the
  owner; `GetIcs` 200 returns `{filename, content}` for a `booked` booking; **status mapping** via
  `_STATUS` (Forbidden→PERMISSION_DENIED, NotFound→NOT_FOUND, Validation→INVALID_ARGUMENT,
  **Conflict→ALREADY_EXISTS** for a lost pick, **RateLimited→RESOURCE_EXHAUSTED**); `caller_identity`
  enforced (no token → UNAUTHENTICATED).
- [ ] **Step 2 — implement** `SchedulingServicer(decision-style)`: each RPC `try`s
  `identity = await caller_identity(context, self._tokens)`, calls the resource with injected repos
  (+ `limiter`, + `notifier`), maps the result to the proto message (for `GetIcs`, load the booking +
  resolve job title / emails and call `build_ics`), and `except AuthDomainError` →
  `self._abort(context, exc)`. **No authz/tenancy/gate/CAS logic in the servicer** — it only adapts.
- [ ] **Step 3 — register in `routes/web.py`:** add
  `scheduling_pb2_grpc.add_SchedulingServiceServicer_to_server(SchedulingServicer(applications=
  ApplicationRepository(db), slots_repo=InterviewSlotsRepository(db), bookings=InterviewBookingRepository(db),
  jobs=JobRepository(db), users=UserRepository(db), tokens=tokens, limiter=RateLimiter(redis),
  notifier=notification_publisher), app)` (thread the same `RateLimiter(redis)` the auth servicer uses
  and the same notifier the funnel uses). Add the `scheduling_pb2_grpc` import to the `pb` import block.
- [ ] **Step 4 — run → PASS; gate green.**

### Task 8 — erasure cascade entry (Inc 0 follow-through)
**Files:** Modify `resources/compliance.py`, `routes/web.py`; extend `tests/test_resources_compliance.py`.

- [ ] **Step 1 — failing test:** `CandidateEraser.erase(user_id)` deletes **all slots + bookings for
  that candidate's applications** (by `application_id`) while the application tombstone + audit stay
  intact.
- [ ] **Step 2 — implement:** add `slots` + `bookings` to `CandidateEraser.__init__` + `make_eraser`
  (alongside `reports`/`interviews`/`attempts`/`consents`/messaging's threads+messages); in `erase`,
  after computing the candidate's `application_ids` (already gathered for the reports delete), call
  `bookings.delete_by_applications(application_ids)` + `slots.delete_by_applications(application_ids)`.
  (If the Inc-0 stub already registered these collections, just fill the repos in.)
- [ ] **Step 3 — run → PASS; gate green.**

---

## TIER D — frontend: shared client + the two surfaces (reuse `@ip/ui`; poll receive; Intl for tz)

> **Grounding (read before coding).** Every authed read/write goes through `useAuth().api` (the typed
> `ApiClients`); the scheduling client wraps the **gRPC-web `ApiClients`** (not REST), built per-render
> from the hook — `const sched = useMemo(() => createSchedulingClient(api), [api])`. `useQuery({
> queryKey, queryFn, refetchInterval, refetchIntervalInBackground: false })`,
> `queryClient.invalidateQueries`, `toast`, and `@ip/ui` `LoadingState`/`ErrorState`/`EmptyState`/
> `Alert`/`Card`/`Tabs`/`Badge`/`Button`/`Input`/`Select` are the established building blocks (see
> `dashboard.tsx`, `applicants-table.tsx`, `jobs/[id]/page.tsx`, `jobs/[id]/applicants/[appId]/page.tsx`).
> **No date library is added** — `Intl.DateTimeFormat` is built-in; **all** tz conversion lives in the
> new `@ip/shared/datetime.ts` so both apps format identically (spec §3.9). **lucide icons are imported
> in the app**, never re-exported through `@ip/ui` (the lucide-must-be-in-app memo).

### Task 9 — `@ip/shared/scheduling.ts` + `datetime.ts` + api-client wiring
**Files:** Create `frontend/packages/shared/src/scheduling.ts`, `frontend/packages/shared/src/datetime.ts`;
Modify `frontend/packages/shared/src/index.ts`, `frontend/packages/api-client/src/index.ts`.

- [ ] **Step 1 — api-client (after `pnpm gen`):** in `frontend/packages/api-client/src/index.ts` add
  the generated `scheduling_pb` to (a) the import block, (b) the `export * from "./gen/scheduling_pb.js"`
  re-export list, (c) the `ApiClients` interface as `scheduling: Client<typeof SchedulingService>`, and
  (d) the `clientsFromTransport` return object — mirroring `decisions` exactly.
- [ ] **Step 2 — `datetime.ts`** (the single UTC↔local boundary; pure, no deps):
  - `formatLocal(isoUtc: string): string` — `new Intl.DateTimeFormat(undefined, { dateStyle: "medium",
    timeStyle: "short", timeZoneName: "short" }).format(new Date(isoUtc))` (renders in the **viewer's**
    resolved zone, e.g. "Jun 24, 2026, 2:00 PM GMT+5:30").
  - `localInputToUtcIso(localDateTime: string): string` — `new Date(localDateTime).toISOString()`
    (converts a `datetime-local` input value → a UTC ISO instant **before** the gRPC call).
  - `viewerTimeZone(): string` — `Intl.DateTimeFormat().resolvedOptions().timeZone` (for a "times shown
    in {zone}" label).
- [ ] **Step 3 — `scheduling.ts`** (mirror `interview.ts`/`jd.ts` — a `create*Client(api)` factory).
  Query-key helpers **owned here** so views + invalidation never drift:
  - `scheduleQueryKey = (applicationId: string) => ["scheduling", "schedule", applicationId] as const`
  - `candidateListQueryKey = () => ["scheduling", "candidate-interviews"] as const`
  - `companyListQueryKey = (status?: string) => ["scheduling", "company-bookings", status ?? "all"] as const`
  - `getSchedule(applicationId)` → `api.scheduling.getSchedule({ applicationId })` → `ScheduleDTO`.
  - `propose(applicationId, slots, location?, note?)` → `api.scheduling.proposeSlots({...})`. **The
    caller passes UTC ISO `start_at`** (the form converts via `localInputToUtcIso` first — the client
    never sends local time).
  - `reschedule(...)`, `choose(applicationId, startAtUtcIso)` →
    `api.scheduling.chooseSlot({ applicationId, startAt })`, `cancel(applicationId)`,
    `getIcs(applicationId)` → `{ filename, content }`,
    `listCandidate()`, `listCompany(status?)`. Errors surface as connect `ConnectError` (the existing
    `errorMessage`/`isCode` classifiers) — **no try/except here**; the React layer renders it.
- [ ] **Step 4 — barrel + typecheck:** export `createSchedulingClient` + `formatLocal`/
  `localInputToUtcIso`/`viewerTimeZone` and re-export `ScheduleDTO`/`BookingDTO` from
  `frontend/packages/shared/src/index.ts`; run `npx pnpm@9.15.0 --filter @ip/api-client typecheck`
  then `--filter @ip/shared typecheck` green (api-client first — shared depends on its generated types).

### Task 10 — candidate "pick a time" page + interviews list + nav
**Files:** Create `frontend/apps/candidate/lib/use-schedule.ts`,
`frontend/apps/candidate/app/interviews/page.tsx`,
`frontend/apps/candidate/app/interviews/[applicationId]/page.tsx`. Modify
`frontend/apps/candidate/components/candidate-shell.tsx` (nav entry).

- [ ] **Step 1 — `useSchedule(applicationId)` hook** (`lib/use-schedule.ts`):
  `const { api } = useAuth(); const sched = useMemo(() => createSchedulingClient(api), [api]);`
  - **Receive (poll):** `useQuery({ queryKey: sched.scheduleQueryKey(applicationId), queryFn: () =>
    sched.getSchedule(applicationId), refetchInterval: 15_000, refetchIntervalInBackground: false })`
    (a slot the recruiter just proposed appears within one interval; paused on hidden tab).
  - **choose mutation:** on pick, `sched.choose(applicationId, startAtUtcIso)`, then
    `invalidateQueries(scheduleQueryKey(applicationId))` + `invalidateQueries(candidateListQueryKey())`;
    on a **`ConnectError` with code `already_exists`** (the CAS lost-race, spec §3.4) →
    `toast.error("That time was just taken — here are the current options")` + refetch (the new
    proposal/booking state renders); other errors → `toast.error(errorMessage(err))`.
  - **cancel mutation:** `sched.cancel(applicationId)` + invalidate.
  - Expose `{ schedule, isLoading, isError, error, refetch, choose, choosing, cancel, cancelling }`.
- [ ] **Step 2 — `app/interviews/[applicationId]/page.tsx`** (`"use client"`, inside `CandidateShell`,
  which enforces `useRequireAuth`/role) — the **"pick a time"** page:
  - read `useParams<{ applicationId: string }>()`, a back-link to `/interviews`
    (`buttonVariants({ variant: "ghost" })` `ArrowLeft`, lucide imported in-app).
  - **`status === "proposed"`** → a `Card` listing the offered `slots` **rendered with
    `formatLocal(slot.startAt)`** (the candidate's zone) + a "times shown in {viewerTimeZone()}" caption;
    each slot is a `RadioGroupItem` (or a `Button` row); a **"Confirm time"** `Button` (disabled until a
    slot is selected or while `choosing`) calls `choose`. Show the `location`/`note` as plain text
    (`whitespace-pre-wrap`).
  - **`status === "booked"`** → a confirmation `Card`: "Interview confirmed for {formatLocal(chosen)}",
    the `location`, an **"Add to calendar"** `Button` that calls `getIcs` and triggers a client-side
    download of the `.ics` (`new Blob([content], { type: "text/calendar" })` → an `<a download>` click),
    and a **"Cancel"** `ConfirmDialog` → `cancel`.
  - **`status === "cancelled"`** → an `Alert tone="warning"` ("This interview was cancelled" + who, from
    `cancelledBy`); **`completed`** → an `Alert tone="neutral"` ("This interview has taken place").
  - states: `isLoading` → `LoadingState`; loaded-but-no-open-proposal-and-no-booking → `EmptyState
    title="No interview scheduled" description="When the hiring team proposes times, they'll appear here."`;
    `isError` → `ErrorState message={errorMessage(error)} retry={refetch}`.
  - **`aria-live`:** wrap the slot list in `<div role="status" aria-live="polite">` so a newly-polled
    proposal is announced.
- [ ] **Step 3 — `app/interviews/page.tsx`** (candidate interviews list) — `"use client"`, inside
  `CandidateShell`. `useQuery({ queryKey: sched.candidateListQueryKey(), queryFn: sched.listCandidate,
  refetchInterval: 60_000, refetchIntervalInBackground: false })`. Render rows (reuse the `dashboard.tsx`
  `Card` row layout): the job/application reference + a **status `Badge`** (proposed→`tone="info"` "Pick
  a time", booked→`tone="success"` + `formatLocal(chosenStartAt)`, completed→`tone="neutral"`,
  cancelled→`tone="warning"`), linking to `/interviews/${applicationId}`; **`proposed` rows first**
  ("action needed"). States: `LoadingState`; `EmptyState`; `ErrorState` + retry.
- [ ] **Step 4 — nav in `candidate-shell.tsx`** — add `{ href: "/interviews", label: "Interviews" }` to
  `NAV`. (No badge required for v1; an "action needed" count is an additive follow-up — keep the shell
  resilient.)
- [ ] **Step 5 — verify build:** `npx pnpm@9.15.0 --filter @ip/candidate build` green; manual open shows
  **no console errors**, offered slots render in the **local** zone, and polling stops when the tab is
  hidden.

### Task 11 — company "Schedule" tab (propose / view bookings / reschedule / cancel)
**Files:** Create `frontend/apps/company/components/schedule-panel.tsx`; Modify
`frontend/apps/company/app/jobs/[id]/applicants/[appId]/page.tsx` (add the Schedule tab beside Report/
Messages).

- [ ] **Step 1 — wrap the applicant detail in `Tabs`** (or extend the existing `Tabs` if Messaging
  already added them — mirror `jobs/[id]/page.tsx`'s `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`):
  add a **`Schedule`** `TabsTrigger` whose content is `<SchedulePanel applicationId={appId} />`. The
  resource enforces `comp_id` + manager scoping; any manager of the company sees/manages the schedule
  (attribution is per-row `proposed_by`).
- [ ] **Step 2 — `SchedulePanel({ applicationId })`** (`"use client"`) consumes a company-side
  `useSchedule` (same `createSchedulingClient`; the company app gets its own thin
  `lib/use-schedule.ts` if convenient, or inline the queries):
  - **Gate awareness:** `getSchedule` is read first; if `ProposeSlots` returns `INVALID_ARGUMENT` (the
    application isn't `interview_pending`/`shortlisted`), surface an `Alert tone="info"` "This candidate
    isn't ready for a live interview yet (they must pass the automated screen)." rather than a raw error.
  - **Propose form** (when no `open` proposal / status `proposed` with no slots, or after a reschedule):
    a `Card` with up to `MAX_SLOTS` rows of a **`datetime-local` `Input`** + a duration `Select`
    (15/30/45/60/90 min), a `location` `Input`, a `note` `Textarea`. On submit, **convert each local
    input to a UTC ISO via `localInputToUtcIso`** (spec §3.9 — the client never sends local time), call
    `propose`/`reschedule`, `toast.success`, `invalidateQueries(scheduleQueryKey)`. Client-side guard:
    at least one slot, each in the future, `location`/`note` within the caps (mirror the server caps —
    server stays the authority).
  - **Current booking view** (status `booked`): show "Booked for {formatLocal(chosenStartAt)}" + the
    `location` + an **"Add to calendar"** (the recruiter's own ICS via `getIcs`), a **"Reschedule"**
    (re-opens the propose form), and a **"Cancel"** `ConfirmDialog` → `cancel` (→ notifies the
    candidate).
  - **Status `Badge`** on the `Schedule` `TabsTrigger` reflecting the booking status
    (proposed/booked/cancelled), read from the same `getSchedule` query the panel already polls (one
    source — no extra query just for the tab badge).
  - states: `LoadingState`/`ErrorState`/`EmptyState` as elsewhere.
- [ ] **Step 3 — verify build:** `npx pnpm@9.15.0 --filter @ip/company build` green; manual open of an
  applicant at `interview_pending` → Schedule tab → propose 3 times (entered in the recruiter's local
  zone) → they appear on the candidate's `/interviews/<id>` **in the candidate's zone** → candidate
  picks → the recruiter tab shows `booked` within one poll; reschedule → candidate re-picks; cancel →
  the other side is notified.
- [ ] **Step 4 — full gate + both FE builds + all four typechecks green; update `HANDOFF.md` + memory.**
  Run `npx pnpm@9.15.0 --filter @ip/candidate build` + `--filter @ip/company build` +
  `--filter @ip/{ui,shared,api-client} typecheck` (`@ip/ui` typechecks even though it is untouched,
  proving no accidental coupling). Flag at handoff: whether the notify triggers are wired to the real
  `notify_event` + the new `_MESSAGES` kinds, or the best-effort fallback shape (depending on increment
  ordering); and whether the ICS email **attachment** is live (needs the later `SmtpNotifier`) vs the
  `GetIcs` **download** only (the v1 primary path).

---

## Verification (end-to-end)

1. **Per backend task:** `bash scripts/check.sh` GREEN (grows from **423**). All scheduling logic is
   pure-Python over injected repos + a fixed clock — fully unit-tested offline; no network in the gate
   (`icalendar` is pure-Python).
2. **Resource contract (the core, offline):** `test_resources_scheduling.py` proves authz reuse
   (candidate `_owned`, manager `_scoped`+`_require_manager`, wrong-tenant→NotFound, non-manager→
   Forbidden), the **ready-for-live gate** (`interview_pending`/`shortlisted` allowed; others →
   Validation; **no funnel state written**), slot validation, the **double-booking CAS** (a second pick
   → `ConflictError`, exactly one `booked`; a non-offered `start_at` → Validation **before** CAS),
   reschedule (one booking row preserved), cancel (idempotent), and the strict-subset DTO.
3. **Reminders (offline):** `test_scheduler.py` proves `reminder_sweep` fires T-24h/T-1h **at most
   once** (the CAS stamp), is **best-effort** (a raising notifier doesn't fail the sweep), and
   `complete_past` closes past bookings — using only fakes + a fixed `now`.
4. **ICS:** `test_scheduling_ics.py` proves a valid `VEVENT` (stable `UID`, UTC `DTSTART`/`DTEND`,
   `SEQUENCE` bumped on reschedule), round-tripping through `icalendar`.
5. **Transport:** `test_routes_scheduling.py` proves `_STATUS` mapping (incl. **Conflict→ALREADY_EXISTS**
   for a lost pick, **RateLimited→RESOURCE_EXHAUSTED**) + `caller_identity` + that the servicer holds
   **no** authz/gate/CAS logic.
6. **Erasure (Inc 0):** `test_resources_compliance.py` proves `erase` deletes the candidate's slots +
   bookings (by application) while applications/audit survive.
7. **Frontend:** `@ip/{ui,shared,api-client}` typecheck + both app builds green (`@ip/ui` untouched —
   its passing typecheck proves no accidental coupling). The candidate page renders offered UTC slots in
   a **local** zone via `datetime.ts` (assert in a unit test with a fixed `TZ`), a pick calls
   `ChooseSlot` then refetches, a CAS conflict surfaces the "that time was just taken" refetch; the
   company panel converts local→UTC **before** the call. (Hook/format logic exercised against a fake
   `ApiClients`; no network.)
8. **Manual / local E2E (Chrome via preview):** the full loop in Task 11 Step 3 — propose (recruiter
   zone) → pick (candidate zone) → `booked` + an **`.ics` that opens at the right local time** + a
   confirmation email in the `LoggingNotifier` sink + an in-app notification row; advance the clock past
   T-24h/T-1h (or trigger a manual sweep) → each reminder fires **once**; reschedule → re-pick; cancel →
   the other side notified. The **AI funnel/interview regression** stays green (its tests untouched —
   scheduling writes no funnel state).

## Resolved gaps (completeness audit 2026-06-19)

Closes **Part A "core" #3** of `2026-06-19-v2-completeness-audit.md` (interview scheduling / calendar)
and the cross-cutting Part B items that touch this surface. Each maps to concrete tasks; the design
rationale is in `…-interview-scheduling-design.md` (§3.2–§3.11).

- [ ] **Book the live interview after the AI screen (the missing next step)** — recruiter `ProposeSlots`
  (Task 2) behind the **ready-for-live gate** (`interview_pending`/`shortlisted`, Task 2 Step 3) →
  candidate `ChooseSlot` (Task 3). The voice/video pillars' "ready for live" signal now has a
  coordinator.
- [ ] **Don't break the AI funnel (funnel-adjacent status)** — the booking's **own** status machine +
  `version` CAS (Tasks 1–3); **no** `FunnelEvent`/`ApplicationState`/application-CAS; the gate only
  **reads** `state`. Asserted in Task 2/Task 3 tests (no funnel write).
- [ ] **Timezone correctness (UTC discipline)** — every instant stored **UTC** (Task 1 models); the
  viewer's zone applied **only** at render via `@ip/shared/datetime.ts` (Task 9 Step 2); the propose
  form converts local→UTC before the call (Task 11 Step 2); the sweep + ICS do zero tz math (Tasks 4–5).
- [ ] **Double-booking guard (CAS)** — `choose_if_proposed` CAS on the booking `(status, version)`
  (Task 1 Step 2, Task 3); a non-offered `start_at` rejected **before** the CAS (Task 3 Step 1).
- [ ] **`comp_id` / ownership scoped + rate-limited (Part A #4)** — authz reuses `_owned`/`_scoped`+
  `_require_manager` (Tasks 2–3); `comp_id` derived from the application + denormalized (Task 1);
  write RPCs rate-limited via `lib.redis.RateLimiter` (Task 2/Task 7).
- [ ] **Reminders (T-24h/T-1h) + reschedule/cancel with notification** — `reminder_sweep` on the
  **existing** scheduler loop, at-most-once via a CAS stamp, best-effort notify (Task 5);
  reschedule/cancel each fire a best-effort notification (Tasks 2–3).
- [ ] **Calendar (ICS now, OAuth push later)** — `build_ics` `VEVENT` on `booked` (download via `GetIcs`
  + email attachment), Task 4; OAuth two-way sync documented as the next rung behind a `CalendarPusher`
  seam (design §3.7), **not built here**.
- [ ] **Erasure (Inc 0)** — `interview_slots` + `interview_bookings` join the `CandidateEraser` cascade
  (Task 8); `complete_past` keeps the booking collection terminal-heavy (Task 5).

## Risks / re-verify at execution

- **Increment ordering with the notifications center.** If `…-notifications-center.md` hasn't landed,
  `notify_event` + the new `_MESSAGES` kinds won't exist. *Plan:* call the best-effort notifier shape
  that exists (`NotificationRequestPublisher`/`TransitionNotifier`) behind the same swallow-and-log
  boundary (Tasks 2/3/5), and add the `interview_*` `_MESSAGES` kinds + swap to `notify_event` when the
  center lands — flagged at handoff.
- **Proto/codegen drift.** Regenerate the TS client (`pnpm gen`) after `scheduling.proto`; hand-editing
  generated files will drift. Re-confirm the generator toolchain matches the existing `pb/*` artifacts.
- **CAS semantics for a lost pick.** A double-pick must surface as a friendly refetch, not a hard error
  — verify the FE maps `ALREADY_EXISTS` on `ChooseSlot` to "that time was just taken + refetch" (Task 10
  Step 1), and that the resource never writes the funnel on a lost CAS.
- **Reminder accuracy vs. cadence.** Reminders fire within one `scheduler_interval_seconds` of T-24h/
  T-1h; confirm that's acceptable for the demo (lean: yes — courtesy reminders). The **stamp precedes
  the notify** so a flaky notifier can't re-fire on every tick (Task 5 Step 2) — don't reorder.
- **`complete_past` correctness.** The "is this booking's end in the past" filter must account for the
  per-row `duration` (Task 1 Step 2) — keep it correct (filter `booked` + `chosen_start_at <= now`,
  then skip rows still within duration) over a clever single-query approximation.
- **UTC discipline is the whole point.** No naive datetime may cross the boundary — re-verify the
  propose form converts via `localInputToUtcIso` and the wire carries `...Z` ISO strings (Tasks 9/11);
  a naive local time leaking to the server would mis-time every reminder and ICS.
- **OAuth calendar push is explicitly NOT built here** (design §3.7). Do not add a Google/Microsoft
  integration in this increment; leave the `CalendarPusher` seam documented as the next rung (the
  booking already holds the canonical event, so it slots in without re-plumbing).
