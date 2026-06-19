# Interview Scheduling (live human interview) — Design

> **Part A "core" #3 of the v2 completeness audit** (`2026-06-19-v2-completeness-audit.md`:
> *"Interview scheduling / calendar — book a live interview after the AI assessment passes;
> availability, timezone, reminders, reschedule. (The async/voice pillars emit a 'ready for live'
> signal but nothing coordinates the next step.)"*). Read the canonical
> `docs/superpowers/v2/2026-06-19-v2-architecture-overview-design.md` first — esp. §5 Pillar C
> (where the AI interview hands off), §6 (compliance-ready model), and §7 (data ownership + **the
> funnel as the integration seam**). This module is the **human-follow-up layer** that picks up
> after the AI screen passes; it is a sibling of **messaging**
> (`…-messaging-design.md`) and **notifications center** (`…-notifications-center-design.md`) and
> reuses their patterns wholesale (admin gRPC-web servicer, `comp_id`/ownership scoping, short-poll
> reads, best-effort notify, the erasure cascade, the scheduler loop). The TDD build is
> `docs/superpowers/v2/2026-06-19-interview-scheduling.md`.
>
> **Status:** design, awaiting review. No production code yet (the v2 build is a later, separately
> green-lit phase). **Local-only project; never run git/gh.**

---

## 1. Goal & scope

The AI pillars (text/voice/async-video) each finalize an interview and flip the funnel to
`interviewed` → `scored`; a recruiter then **decides** (shortlist / reject / hire). But a real hiring
loop has a **live human interview** between "the AI says this candidate is worth a conversation" and
the final decision — and **nothing books it today**. The voice/video specs emit a *"ready for live"*
signal (the candidate has cleared the automated screen and reached `interview_pending` /
`shortlisted`), but there is no surface to propose times, no way for the candidate to pick one, no
reminders, and no reschedule path. Interview Scheduling closes that gap.

The model is deliberately **one-way (recruiter-proposes, candidate-picks)** — the simplest scheduling
primitive that actually works, with **no** two-sided calendar negotiation, **no** round-robin
interviewer pool, **no** external availability sync to start. A recruiter proposes a **set of time
slots** for an application; the candidate **picks one**; the booking is confirmed, reminders fire at
**T-24h / T-1h**, and either side can **reschedule or cancel** (which re-notifies). All times are
**timezone-aware, stored in UTC**, rendered in the viewer's zone.

**In scope (v1):**

- **Recruiter proposes availability** — a manager of the application's `comp_id` posts an
  `interview_slots` doc: a list of proposed UTC start times (+ a duration + an optional location/URL
  note) for an application that has reached `interview_pending` **or** `shortlisted` (the
  "ready-for-live" gate, §3.2). One open proposal per application at a time.
- **Candidate picks a slot** — the candidate (owner of the application) reads the proposed slots in
  **their** timezone and selects exactly one, which creates/confirms the `interview_bookings` doc and
  flips its status to `booked`. **One-way scheduling**: the candidate chooses from the offered set;
  there is no counter-propose.
- **Double-booking guard (CAS)** — choosing a slot is a **compare-and-swap** on the booking status
  (`proposed → booked`), mirroring the funnel's `set_state_if`, so two concurrent picks (e.g. a
  double-submit, or candidate + recruiter racing) can never both win (§3.4).
- **Reminders at T-24h / T-1h** — a **reminder sweep wired into the existing admin scheduler loop**
  (`main.py` `run_schedulers`, alongside `aptitude_expiry_pass`/`retention_pass`) finds bookings whose
  next reminder is due and fires a **best-effort notification** (email via the `Notifier` seam + an
  in-app notifications-center row). Each reminder fires **at most once** (a CAS stamp on the booking,
  §3.5).
- **Reschedule / cancel** — a manager can **reschedule** (post a fresh slot set → status back to
  `proposed`, candidate re-picks) or **cancel** (status `cancelled`); the candidate can **cancel**
  their booking (status `cancelled`, the recruiter is notified). Every transition fires a
  notification.
- **Calendar invite (ICS) generation** — on `booked`, generate a standards-compliant **iCalendar
  (`.ics`) `VEVENT`** the candidate (and recruiter) can add to Google/Outlook/Apple Calendar, served
  as a download + attached to the confirmation email. **OAuth calendar *push* (two-way Google/Outlook
  sync) is a documented later item** (§3.7), not v1.
- **A `SchedulingService` (gRPC-web) on admin** + a **candidate "pick a time" page** + a **company
  "propose times / view bookings" surface** (a tab on the applicant detail), reusing `@ip/ui`.
- **Erasure cascade entry (Inc 0):** `interview_slots` + `interview_bookings` join the
  `CandidateEraser` cascade.

**Out of scope / explicit non-goals:**

- **No two-sided / mutual availability negotiation, no counter-propose.** Recruiter proposes, candidate
  picks from the set. If none work, the candidate cancels (or messages, via the messaging module) and
  the recruiter re-proposes. This one-way shape is what makes authz + CAS trivial (§3.2, §3.4).
- **No interviewer-pool / round-robin / load-balancing.** A proposal is per *application*, attributed
  to the proposing manager; **any** manager of the `comp_id` may manage it (team activity, exactly like
  decisions and messaging). No per-interviewer calendars.
- **No OAuth calendar push (two-way external sync) in v1.** We **generate** an ICS invite now (a pure
  string, zero new infra); pushing events into the candidate's/recruiter's Google/Outlook calendar via
  OAuth is the documented next rung (§3.7).
- **No video-room provisioning here.** The *location* of a live interview (a Zoom/Meet link, a phone
  number, an address, or "reuse the platform voice room") is a free-text/URL field the recruiter
  supplies; minting a live room is the voice pillar's concern, not the scheduler's. (If the recruiter
  wants the platform voice room, they paste its join path — no coupling.)
- **No new funnel state, no new `FunnelEvent`, no CAS on the application.** Scheduling is a
  **funnel-adjacent side layer** keyed by `application_id` — it **must not** break or fork the AI
  funnel (§2, §3.3). The booking has *its own* status machine (`proposed`/`booked`/`completed`/
  `cancelled`); the application's funnel state is read (to gate proposing) but **never written** by
  this module.
- **Compliance-triggering features excluded** (overview §2): no ID/identity verification of the
  interviewer or candidate, no background checks, no biometric/affect capture during the live
  interview, no recording/transcription of the *human* interview (that is the candidate's and
  recruiter's call, off-platform). Scheduling stores **times + a location string + a status** — none of
  the excluded regimes. (The AI interview's transcript is a separate, already-scoped artifact.)

---

## 2. Where it fits

```
   Company app ──┐   gRPC-web (authed)        ┌──────────────────────────────────────────┐
   (propose /    ├──────────────────────────► │  ADMIN  (owns MongoDB, source of truth)    │
    view bookings)│   ProposeSlots /           │  • SchedulingService (NEW servicer)        │
   Candidate app ─┤   GetSchedule / ChooseSlot │    ProposeSlots / GetSchedule /            │
   (pick a time) ─┘   Reschedule / Cancel      │    ChooseSlot / Reschedule / Cancel / Ics  │
                  ◄───── poll (refetchInterval) │  resources/scheduling.py  ─────────────────┤
                                               │   _schedulable (ready-for-live gate)        │
                                               │   reuse decision._scoped / aptitude._owned  │
                                               │   + decision._require_manager               │
                                               │   CHOOSE = CAS (set_status_if)              │
                                               └───────┬───────────────┬───────────┬─────────┘
              best-effort notify (proposed /           │               │ Mongo     │ ICS string
              booked / reminder / reschedule /  ───────┘               ▼           │ (icalendar)
              cancelled) → notifications center            interview_slots +       │
              (email via Notifier + in-app row)            interview_bookings       │
                       ▲                                  (comp_id + application_id) │
                       │                                                            │
   admin scheduler loop (main.py run_schedulers) ── reminder_sweep ── due T-24h/T-1h ┘
   (alongside aptitude_expiry_pass / retention_pass)   (CAS reminder stamp; best-effort)
```

- **admin owns MongoDB and every write.** The browser reaches `SchedulingService` over the existing
  in-process gRPC-web transport (uvicorn, no proxy) — the same surface as `DecisionService` /
  `AptitudeService` / the new `MessagingService`. **No new service**; scheduling is a new *capability*
  on admin: one servicer, one resource module, two repositories, two model docs, one ICS helper, one
  scheduler sweep.
- **The resource layer is the contract** (the established convention — `resources/decision.py`,
  `resources/aptitude.py`, `resources/messaging.py`). All authz, tenancy scoping, the ready-for-live
  gate, the CAS pick, status bookkeeping, reminder scheduling, and DTO shaping live in
  `resources/scheduling.py`; the servicer is a thin adapter. **No query/authz logic in the servicer.**
- **The AI funnel is untouched.** Scheduling adds **no** `FunnelEvent`, **no** `ApplicationState`, **no**
  CAS path on the application. It is a side-table keyed by `application_id`, and it only ever *reads* the
  application's `state` (to decide whether proposing is allowed, §3.2). It fires **best-effort**
  notifications (the same swallow-and-log pattern `advance_application` uses around its notifier) — a
  notifications outage never blocks a propose/pick/cancel.
- **The reminder sweep rides the existing scheduler.** `main.py`'s `run_schedulers()` already runs
  `retention_pass` + `aptitude_expiry_pass` on a `scheduler_interval_seconds` loop; the reminder sweep
  is **one more `await scheduler.reminder_sweep(...)`** in that same `try`, reusing its error
  isolation. No new process, no cron, no external trigger.

---

## 3. Design

### 3.1 Data model

Two new collections, both **scoped by `comp_id` + `application_id`**, `comp_id` always derived from
the **application doc / the authenticated token, never client input** (PRODUCTION_STANDARDS §2). New
Pydantic models in `src/admin/app/model/scheduling.py`, mirroring `model/aptitude.py`'s style
(`BaseModel` + `Field(default_factory=lambda: datetime.now(UTC))`, UTC-aware datetimes throughout).

**`InterviewSlots`** — the recruiter's open **proposal** for an application (the offered set):

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | Proposal id. |
| `comp_id` | `str` | Tenant. Copied from the application doc on create. |
| `application_id` | `str` | The anchor. |
| `proposed_by` | `str` | The manager `user_id` who proposed (attribution; **any** manager of `comp_id` may manage — authz is by `comp_id`, §3.2). |
| `slots` | `list[ProposedSlot]` | The offered times — each `{ start_at: datetime (UTC), duration_minutes: int }`. Validated: 1–`MAX_SLOTS` (10) entries, each `start_at` in the future, `duration_minutes` in `[15, 480]`, **de-duplicated**. |
| `location` | `str \| None` | Free text / URL — a meeting link, phone, address, or platform-room path. Length-capped (`MAX_LOCATION = 512`). Validated, never trusted (recruiter input). |
| `note` | `str \| None` | Optional message to the candidate ("bring a portfolio"). Length-capped (`MAX_NOTE = 1_024`). |
| `status` | `"open" \| "superseded"` | `open` = the live proposal the candidate sees; a reschedule marks the prior proposal `superseded` and inserts a fresh `open` one (an append-only proposal history, §3.6). |
| `created_at` | `datetime` | `default_factory` now (UTC). |

**`InterviewBooking`** — the **booking** for an application; **one current booking per application**
(the unique index makes it an invariant, §3.8). Created lazily when the candidate first picks a slot
(or eagerly as a `proposed` shell when slots are first posted — decided in §3.4):

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | Booking id. |
| `comp_id` | `str` | Tenant (denormalized from the application — a booking is scopable/erasable without a slots join). |
| `application_id` | `str` | The anchor. **Unique** → exactly one current booking per application. |
| `candidate_user_id` | `str` | From the application doc (the fixed candidate participant). |
| `slots_id` | `str` | The `InterviewSlots` proposal this booking resolves (the offered set the chosen slot came from). |
| `chosen_start_at` | `datetime \| None` | The candidate's pick (UTC). `None` while `proposed`. |
| `duration_minutes` | `int \| None` | Copied from the chosen `ProposedSlot` (denormalized so a reminder/ICS needs no slots join). |
| `location` | `str \| None` | Copied from the proposal at pick time (denormalized for ICS/reminder). |
| `status` | `"proposed" \| "booked" \| "completed" \| "cancelled"` | The **booking** status machine (§3.3) — **independent of the application's funnel state**. |
| `cancelled_by` | `"candidate" \| "recruiter" \| None` | Who cancelled (attribution for the notification + audit). |
| `reminded_24h_at` | `datetime \| None` | CAS stamp — set when the T-24h reminder fired (so it fires at most once, §3.5). |
| `reminded_1h_at` | `datetime \| None` | Symmetric, T-1h. |
| `version` | `int` (default 0) | Optimistic-concurrency counter bumped on every status write; the CAS pick/cancel matches on `(status, version)` (§3.4). |
| `created_at` | `datetime` | `default_factory` now (UTC). |
| `updated_at` | `datetime` | Stamped on every status write. |

> **Why two collections (proposal vs booking)** rather than one fat doc: the **proposal** is
> recruiter-authored, multi-valued (a *set* of offered times), and append-only across reschedules (a
> history). The **booking** is the single resolved outcome the reminders + ICS + status machine act on,
> with a stable unique-per-application identity for the CAS guard. Splitting them keeps the booking row
> small and the CAS target unambiguous (one row, one `(status, version)`), and lets a reschedule add a
> new proposal without rewriting the booking's identity. (Same "the record the hot path acts on stays
> small + denormalized" rationale as messaging's thread-vs-message split.)

> **Why denormalize `comp_id` + `chosen_start_at`/`duration_minutes`/`location` onto the booking.**
> The reminder sweep, the ICS generation, and the erasure cascade all act on `interview_bookings`
> **directly** (a `find` by due-reminder / by `application_id`, no proposal join) — the same
> denormalization `AptitudeAttempt` uses (it carries `comp_id` even though it has `application_id`). A
> few extra fields per row buy a join-free hot path and a single-collection cascade.

### 3.2 Authz + the "ready-for-live" gate — reusing the existing scoping helpers

The one-way shape collapses authorization to the **existing application-scoping helpers**, reused
verbatim (no new authz primitive), exactly as messaging does:

- **Candidate side** (read schedule, choose a slot, cancel own booking) → reuse
  `aptitude._owned(identity, application_id, applications)`: the caller must be the application's
  `candidate_user_id`, else `ForbiddenError` / `NotFoundError`.
- **Company side** (propose, reschedule, cancel, read) → reuse
  `decision._scoped(identity, application_id, applications)` + `decision._require_manager(identity)`
  (`company_admin` / `recruiter`): the application's `comp_id` must equal the caller's `comp_id`, else
  `NotFoundError`; a non-manager company role → `ForbiddenError`. **Any** manager of the owning company
  may propose/reschedule/cancel (team activity — attribution is per-row via `proposed_by` /
  `cancelled_by`).

So `resources/scheduling.py` adds one tiny wrapper — `_application_for(identity, application_id, *,
applications)` — that branches on `identity["role"]`, calls the matching existing helper to authorize
against the **application**, and returns it. Because slots + booking are 1:1-per-application with an
already-authorized application, authorizing the application *is* authorizing the schedule.

**The ready-for-live gate (the one new check).** Proposing slots is only valid once the candidate has
**cleared the automated screen**. The gate reads the **already-loaded** application's funnel `state`:

```python
# resources/scheduling.py — the only scheduling-specific gate
_SCHEDULABLE_STATES = {ApplicationState.interview_pending.value, ApplicationState.shortlisted.value}

def _require_schedulable(application: dict) -> None:
    if application.get("state") not in _SCHEDULABLE_STATES:
        raise ValidationError(
            "Application is not ready for a live interview "
            "(must have passed the automated screen)."
        )
```

- `interview_pending` is the **direct "ready-for-live" signal** — the AI screen passed
  (`aptitude.graded → passed`, or a recruiter `gate.override`), and the application is *awaiting* the
  next human step. `shortlisted` is included so a recruiter who has already run the AI interview + made
  a positive call can still book a final round. (These two are the live states in the funnel today —
  `lib/lib/schemas/enums.py` — confirmed against the codebase; this module **adds no new state**.)
- The gate is read-only on the application — scheduling **never writes** the funnel state. It is a
  **boundary validation** (recruiter input could target an application in any state), so it raises
  `ValidationError` (→ `INVALID_ARGUMENT`), not a silent skip.
- **Forward-compatible with the advisory gate (Inc 0).** If/when the planned `assessment_review`
  advisory state lands (overview §6 — *not* in the live enum today), it is **not** added to
  `_SCHEDULABLE_STATES`: an application still under human assessment review is not yet ready to book a
  live interview; only once it advances to `interview_pending`/`shortlisted` does scheduling open. The
  set is the single tunable point.

### 3.3 The booking status machine — independent of the funnel (the integration boundary)

The booking has its **own** small status machine, deliberately **decoupled** from the AI funnel so it
can never corrupt it:

```
                    ProposeSlots (recruiter)            ChooseSlot (candidate, CAS)
   (no booking) ───────────────────────────► proposed ───────────────────────────► booked
        ▲                                        │  ▲                                   │
        │  Reschedule (recruiter): supersede     │  │ Reschedule (recruiter)            │ Cancel
        │  old proposal, new proposal,           │  │ from booked → proposed            │ (either side)
        └──────────── status → proposed ◄────────┘  └───────────────────────────────────┤
                                                                                          ▼
                                              completed ◄── (sweep: start_at + duration   cancelled
                                               in the past, booked → completed)
```

- **`proposed`** — slots offered, candidate has not yet picked. (Created on first `ProposeSlots`; see
  §3.4 for eager-vs-lazy.)
- **`booked`** — candidate picked a slot (CAS `proposed → booked`). `chosen_start_at` set, ICS
  generated, confirmation + reminders armed.
- **`completed`** — the chosen time + duration is in the past. Set by the **same reminder sweep**
  (a booking whose `chosen_start_at + duration` < now and is still `booked` → `completed`), purely a
  housekeeping terminal so the UI can show "past interviews" and reminders stop. (No funnel coupling —
  marking the *AI/recruiter* decision is the decision module's job; this just closes the booking.)
- **`cancelled`** — either side cancelled. Terminal. A reschedule does **not** go through `cancelled`;
  it supersedes the proposal and returns the booking to `proposed` (so the candidate re-picks against
  the new set) — `cancelled` is a genuine "this interview is off", which re-notifies and (optionally)
  lets the recruiter start a fresh proposal later.

**Why a separate status machine (the load-bearing decision).** The audit's framing — *"a
funnel-adjacent status (don't break the AI funnel; this is the human-followup layer)"* — is honored
literally: a scheduling status is **never** an `ApplicationState`, a pick/cancel is **never** a
`FunnelEvent`, and the CAS guard is on the **booking's** `(status, version)`, **never** on the
application's `state`. The funnel's CAS, audit, and idempotency are completely untouched; the worst a
scheduling bug can do is mis-set a booking row, which self-heals (re-propose) and never blocks the
AI screening pipeline. This is the central guardrail and the reason the booking carries its own status
+ version rather than piggy-backing on the funnel.

### 3.4 Choosing a slot — the double-booking CAS guard

Picking a slot is the one place two writers can race (a candidate double-submitting; a candidate
picking while a recruiter reschedules; two browser tabs). The guard is a **compare-and-swap on the
booking**, modeled exactly on the funnel's `ApplicationRepository.set_state_if`
(`{"_id": …, "state": expected} → {"$set": {"state": new}}`, `modified_count == 1`):

```python
# InterviewBookingRepository — CAS, mirrors applications.set_state_if
async def choose_if_proposed(self, booking_id, *, expected_version, chosen_start_at,
                             duration_minutes, location, now) -> bool:
    res = await self.col.update_one(
        {"_id": _oid(booking_id), "status": "proposed", "version": expected_version},
        {"$set": {"status": "booked", "chosen_start_at": chosen_start_at,
                  "duration_minutes": duration_minutes, "location": location,
                  "updated_at": now}, "$inc": {"version": 1}},
    )
    return res.modified_count == 1
```

- **`proposed → booked` only.** The filter pins `status == "proposed"` **and** the `version` the
  caller read, so a booking already `booked` (someone else won), already `cancelled` (recruiter pulled
  it), or `proposed`-but-bumped (a reschedule landed first) **rejects the pick** — `modified_count == 0`
  → the resource raises `ConflictError` (→ `FAILED_PRECONDITION` … see status note below), and the FE
  refetches the (now-changed) schedule and asks the candidate to pick again from the current set.
- **The chosen `start_at` must be one of the proposal's offered slots** — validated in the resource
  **before** the CAS (the candidate may only pick from the set the recruiter offered; a forged
  `start_at` not in `slots` → `ValidationError`). The CAS then makes the *write* atomic; the membership
  check makes the *input* legitimate. Both are required (input legitimacy ≠ write atomicity).
- **One booking per application** (the unique index, §3.8) means there is exactly **one** CAS target —
  no ambiguity about *which* row to swap. The slot itself is not a separate row to lock; the **booking
  is the contended resource**, and it can be `booked` to exactly one `chosen_start_at`. (We are not
  modeling a shared interviewer calendar where one time blocks across applications — that is the
  out-of-scope interviewer-pool feature; here each application's single booking is independent.)
- **Status code for a lost CAS.** `ConflictError` already exists (`errors.py`, → `ALREADY_EXISTS`); a
  lost-race pick is better surfaced as **"the slot is no longer available, refetch"**. We raise
  `ConflictError("slot no longer available")` and the FE maps `ALREADY_EXISTS` on `ChooseSlot` to a
  friendly "that time was just taken / the proposal changed — here are the current options" + an
  auto-refetch. (Reusing the existing error keeps the `_STATUS` map unchanged; the *semantics* are
  carried by the message + the FE's per-RPC handling, exactly as the funnel reuses
  `InvalidTransition`.)

**Eager vs lazy booking row (decided: eager shell on propose).** `ProposeSlots` **creates the booking
row in `proposed` status** (with `chosen_start_at = None`) at the same time it inserts the proposal —
so there is always a single, unique, CAS-ready booking to swap, and the unique index on
`(application_id)` is the 1:1 guarantee from the first propose. (Messaging chose *lazy* thread creation
because either party could speak first; here only the **recruiter** initiates — the candidate can never
act before a proposal exists — so eager creation is natural and removes a create-or-load branch from
the hot `ChooseSlot` path.) A reschedule reuses the existing booking row (flips it back to `proposed`,
bumps `version`, points `slots_id` at the new proposal), preserving the unique-per-application
invariant.

### 3.5 Reminders — the sweep on the existing scheduler loop

Reminders ride the **existing admin scheduler** (`src/admin/app/main.py` `run_schedulers()`), which
already loops on `scheduler_interval_seconds` running `retention_pass` + `aptitude_expiry_pass` inside
one `try/except`. The reminder sweep is **one more call in that same block** (the build plan adds the
single line), reusing its error isolation and cadence — **no new process, no cron, no external
trigger**:

```python
# main.py run_schedulers() — the added line (mirrors aptitude_expiry_pass wiring)
await scheduler.reminder_sweep(
    bookings=scheduling_bookings,
    notifier=notification_publisher,   # the same best-effort notify path the funnel uses
    now=now,
)
```

`resources/scheduler.py` gains `reminder_sweep`, mirroring `aptitude_expiry_pass`'s shape (query the
repo for due rows, act, count, log):

```python
async def reminder_sweep(*, bookings, notifier, now) -> int:
    """Fire T-24h / T-1h reminders for booked interviews and close past ones.
    Each reminder fires at most once (a CAS stamp); best-effort notify (swallow+log)."""
    fired = 0
    # T-24h: booked, start within (now, now+24h], not yet reminded_24h
    for b in await bookings.due_reminders(window="24h", now=now):
        if await bookings.stamp_reminder_if_unset(b["_id"], "reminded_24h_at", now):
            await _best_effort_notify(notifier, b, kind="interview_reminder_24h")
            fired += 1
    # T-1h: symmetric, reminded_1h
    for b in await bookings.due_reminders(window="1h", now=now):
        if await bookings.stamp_reminder_if_unset(b["_id"], "reminded_1h_at", now):
            await _best_effort_notify(notifier, b, kind="interview_reminder_1h")
            fired += 1
    # housekeeping: booked interviews whose time has passed → completed
    await bookings.complete_past(now=now)
    return fired
```

- **At-most-once per reminder (CAS stamp).** `stamp_reminder_if_unset(booking_id, field, now)` is a CAS
  update — `{"_id": …, field: None, "status": "booked"} → {"$set": {field: now}}`, `modified_count ==
  1` — so even though the sweep runs every interval, a reminder fires **exactly once** (the second
  sweep finds the field already set and skips). This is the same idempotency shape as the funnel CAS
  and the reminder design needs no external dedup. (The notify itself is **best-effort** — if the email
  fails *after* the stamp, the stamp is still set; we accept "a reminder email may rarely be missed" as
  the cost of not blocking the sweep, and the in-app row is the durable channel, exactly like the
  notifications-center email policy.)

  > **Stamp-then-notify ordering — deliberate, and the honest tradeoff.** The CAS stamp is taken
  > **before** the best-effort notify so a flaky notifier can't cause the sweep to re-fire the same
  > reminder on every tick (stamp-after would re-attempt forever on a raising notifier — an email storm).
  > The cost is the rare "stamped but email failed → reminder silently missed" case; this is the **same
  > tradeoff** the notifications center makes (the durable in-app row is written, email is lossy on top),
  > and is the correct bias for an *advisory* reminder. An outbox/retry is the documented later upgrade
  > (shared with the notifications-center §3.2 outbox note), not v1.
- **Window definition.** `due_reminders(window="24h")` = bookings that are `booked`, `reminded_24h_at
  is None`, and `now < chosen_start_at <= now + 24h`. Because the sweep runs on the
  `scheduler_interval_seconds` cadence, a reminder is "T-24h" within one interval of accuracy
  (acceptable — these are courtesy reminders, not alarms; tune the interval if tighter is wanted). If a
  booking is created **less than 24h out**, the 24h window already includes it on the next sweep, so it
  still gets one reminder; if created **less than 1h out**, only the 1h reminder fires (the 24h window
  no longer matches) — both are correct "fire the reminders that still make sense" behaviors.
- **`complete_past`** flips `booked` rows whose `chosen_start_at + duration` < now to `completed` (a
  bulk `update_many`), so reminders stop and the UI can bucket past interviews. No notification (it is
  housekeeping, not an event the candidate needs).
- **Timezone correctness.** Everything in the sweep is **UTC** (`now = datetime.now(UTC)` from the
  loop, `chosen_start_at` stored UTC). The candidate's local time is **only** a render concern (§3.9) —
  the sweep never does timezone math, eliminating the classic "reminder fired in the wrong zone" bug.

### 3.6 Reschedule & cancel

- **Reschedule (recruiter).** `Reschedule(application_id, new_slots, location?, note?)`:
  manager-scoped + `_require_schedulable`; marks the current `open` `InterviewSlots` `superseded`,
  inserts a **fresh `open` proposal**, and flips the **existing** booking back to `proposed`
  (CAS-bumping `version`, clearing `chosen_start_at` / `reminded_*`), pointing `slots_id` at the new
  proposal. Fires a best-effort `interview_rescheduled` notification to the candidate ("new times
  proposed — pick again"). The booking row identity is preserved (unique-per-application holds).
- **Cancel (either side).** `Cancel(application_id, reason?)`: candidate path
  (`aptitude._owned`) or manager path (`decision._scoped` + `_require_manager`); CAS the booking to
  `cancelled` (from `proposed` **or** `booked`), stamp `cancelled_by`. Fires a best-effort
  `interview_cancelled` notification to the **other** party. Terminal; a later re-proposal is a fresh
  `ProposeSlots` (which the eager-shell logic handles by reusing the cancelled row → `proposed`, or by
  the recruiter starting again — decided in the plan; leaning: a `cancelled` booking can be revived by
  a new `ProposeSlots` that CAS-resets it to `proposed`).
- **Idempotency.** Both are CAS on `(status, version)`, so a double-cancel / double-reschedule is a
  clean no-op (the second `modified_count == 0` → the resource treats "already in the target state" as
  success, exactly as `advance_application` treats a redelivered transition).

### 3.7 Calendar invite — ICS now, OAuth push later

**v1: generate a standards-compliant iCalendar `VEVENT`.** On `booked`, the resource produces an
**`.ics`** string via a tiny helper (`resources/scheduling_ics.py`, using the small, pure-Python
**`icalendar`** library — no network, no infra, offline-gate-safe):

- **A `GetIcs(application_id)` RPC** returns `{ filename, content }` (the `.ics` text) for the
  **booked** booking, owner/manager-scoped like every other RPC. The candidate "pick a time" page (and
  the company bookings view) render an **"Add to calendar"** download button; the same string is
  **attached to the confirmation email** (the `Notifier` seam already sends email; an ICS attachment is
  a body/MIME concern the later `SmtpNotifier` honors — `LoggingNotifier` just logs it).
- **The `VEVENT` carries:** a stable `UID` (`f"aptura-interview-{booking_id}@aptura"` — so re-downloads
  / updates **replace** rather than duplicate the calendar entry), `DTSTART`/`DTEND` in **UTC**
  (`...Z` — calendar clients convert to the viewer's zone, so UTC storage is exactly right here too),
  `SUMMARY` ("Interview — {job title}"), `LOCATION` (the booking's `location` string), `DESCRIPTION`
  (the note + a deep link back to the platform), and `ORGANIZER`/`ATTENDEE` (the company + candidate
  emails) so an accept/decline round-trips in the client. A `SEQUENCE` bumped on reschedule makes a
  re-sent invite an **update**, not a new event.
- **Why ICS is the right v1.** It is a **pure string** — zero new infra, zero OAuth, zero third-party
  account — that **every** calendar app (Google/Outlook/Apple) imports natively. It gives the candidate
  a one-click "add to calendar" and the recruiter the same, satisfying the audit's "calendar" ask
  without touching the excluded/heavy integration surface.

**Later (documented, not v1): OAuth calendar *push* (two-way Google/Outlook sync).** Pushing the event
directly into the candidate's/recruiter's calendar — and reflecting their *external* busy/free back
into proposing — needs **OAuth to Google Calendar / Microsoft Graph**, token storage, refresh, scope
consent, and per-provider event-sync reconciliation. That is a real integration project (new secrets,
new failure modes, a consent surface) and is explicitly the **next rung**, recorded here so the ICS
choice is visibly a *staged* decision, not a dead end. The seam is clean: the booking already holds the
canonical event (`chosen_start_at`, `duration`, `location`, the `UID`); a future `CalendarPusher`
Protocol (mirroring the `Notifier`/`CodeRunner`/voice-engine injected-seam pattern) would consume that
same booking and push it, swapped in via `web.py` wiring with a fake for the offline gate.

### 3.8 Indexes (declared in `infra/db.py` — the single index authority)

All indexes live in `src/admin/app/infra/db.py`'s `INDEXES` list (`IndexSpec(collection, keys,
options)`, ensured idempotently by `ensure_indexes`), alongside the existing app/aptitude/report
indexes:

```python
# interview scheduling — proposals (append-only history per application)
IndexSpec("interview_slots", [("application_id", 1), ("created_at", -1)]),
IndexSpec("interview_slots", "comp_id"),
# bookings — one current booking per application (the 1:1 invariant the CAS relies on)
IndexSpec("interview_bookings", "application_id", {"unique": True}),
IndexSpec("interview_bookings", [("comp_id", 1), ("status", 1)]),          # company "view bookings"
IndexSpec("interview_bookings", [("candidate_user_id", 1), ("status", 1)]), # candidate's interviews
# reminder sweep read path: booked rows due a reminder, by chosen time
IndexSpec("interview_bookings", [("status", 1), ("chosen_start_at", 1)]),
```

- The **unique `application_id`** on `interview_bookings` is what makes "one current booking per
  application" an enforced invariant (a duplicate eager-shell insert is impossible) and gives the CAS a
  single unambiguous target.
- The **`(status, chosen_start_at)`** compound backs the reminder sweep's `due_reminders` query (filter
  `status == "booked"` + a `chosen_start_at` range) and `complete_past` (status + past time) — an
  indexed scan over a small, mostly-terminal collection.
- `application_id` (on both) + `comp_id` (denormalized) back the erasure-cascade `delete_by_*` and
  every tenant-scoped read with no extra index beyond the above.

### 3.9 Timezone correctness — store UTC, render local (the cross-cutting discipline)

The audit calls out **"UTC timezone discipline"** as a cross-cutting requirement; scheduling is the
module where it matters most:

- **Every persisted instant is UTC.** `start_at` (proposed), `chosen_start_at`, `reminded_*`,
  `created_at`/`updated_at` are all timezone-aware UTC (`datetime.now(UTC)` defaults; Pydantic models
  carry `datetime`, Mongo stores UTC). **No naive datetimes** cross the boundary.
- **The candidate's/recruiter's timezone is a *render* concern, resolved on the client.** The
  candidate picks from offered UTC instants rendered in **their browser's zone** via
  `Intl.DateTimeFormat` (resolved from `Intl.DateTimeFormat().resolvedOptions().timeZone` — no server
  round-trip, no stored per-user tz needed for v1) — e.g. "Tue Jun 24, 2:00 PM GMT+5:30". The wire
  carries **ISO-8601 UTC strings** (`...Z`), exactly as the rest of the API serializes datetimes; the
  FE never receives a naive local time.
- **The recruiter proposes in *their* local time, converted to UTC at the boundary.** The propose form
  takes a local date+time, and the FE converts to a UTC ISO instant **before** the gRPC call (a
  `new Date(local).toISOString()` round-trip), so the server only ever ingests UTC. The proposal echoes
  back render so the recruiter sees their own zone confirmed.
- **The ICS uses UTC `DTSTART`/`DTEND` (`...Z`)** — calendar clients localize, so UTC storage is again
  exactly correct, with **zero** server-side timezone math anywhere in the module. (No date library is
  added — `Intl.DateTimeFormat` is built into the browser; see the FE note in the plan. A small
  `@ip/shared/datetime.ts` formatter wraps `Intl` so both apps format identically.)

This is the audit's "store UTC, render local" rule made concrete: the **only** place a timezone is
applied is the final string render in the browser, and it is the *viewer's* zone every time.

### 3.10 Free-text validation + rate-limiting (the boundary)

Recruiter `location`/`note` and the candidate's chosen `start_at` are **input at a contract surface**,
so they are validated, never trusted (PRODUCTION_STANDARDS §2), and the write RPCs are rate-limited:

- **`location` / `note`** length-capped (`MAX_LOCATION = 512`, `MAX_NOTE = 1_024`), trimmed; rendered
  as **plain text** in both apps (`whitespace-pre-wrap`), so a pasted `<script>`/URL is inert text, not
  markup (same posture as the messaging body). `slots` validated: count `1..MAX_SLOTS`, each `start_at`
  in the future + de-duplicated, `duration_minutes ∈ [15, 480]`.
- **`chosen_start_at`** must be a member of the proposal's offered `slots` (§3.4) — a forged time is a
  `ValidationError`, independent of the CAS.
- **Rate-limited** via the existing `lib.redis.RateLimiter` (the same primitive `routes/oauth.py`
  uses): per-user + per-application caps on `ProposeSlots`/`Reschedule`/`ChooseSlot`/`Cancel` so a
  recruiter can't slot-spam a candidate and a candidate can't thrash the CAS — an opaque `429`/
  `RESOURCE_EXHAUSTED` (`RateLimitedError` already maps in `_STATUS`) on breach. This wires the audit's
  Part A #4 ("rate-limiting + security hardening on the new endpoints") for this module. (Light caps;
  the limiter is already constructed in `web.py` for the auth servicer — thread the same instance.)

### 3.11 Erasure cascade entry (Inc 0)

Scheduling artifacts join the `CandidateEraser` cascade (overview §6 — "erasure cascade to every new
artifact"). A booking carries the candidate's `candidate_user_id` + chosen times (their PII-adjacent
schedule), and a proposal carries the offered times for their application — both are purged on
right-to-erasure:

- Add `slots` + `bookings` repositories to `CandidateEraser.__init__` + `make_eraser`
  (`routes/web.py`), alongside `reports`/`interviews`/`attempts`/`consents`/(messaging's
  threads+messages).
- In `erase(user_id)`: resolve the candidate's `application_ids` (already gathered for the reports
  delete), then `bookings.delete_by_applications(application_ids)` +
  `slots.delete_by_applications(application_ids)` (by `application_id` — denormalized onto both, a
  direct `delete_many`, no proposal→booking walk). The application tombstone the funnel relies on stays
  intact (scheduling holds no funnel state).
- `delete_by_applications` on both repos mirror `ReportRepository.delete_by_applications`.

The Inc-0 stub registers these collections in the cascade from day one (overview §8); this increment
fills in the repositories.

---

## 4. Key decisions & tradeoffs

| Decision | Rationale | Tradeoff / mitigation |
|---|---|---|
| **One-way scheduling (recruiter proposes, candidate picks)** | The simplest primitive that works; collapses authz to the existing `_owned`/`_scoped` helpers and makes the CAS target unambiguous | No mutual-availability negotiation / counter-propose; if no slot works the candidate cancels (or messages) and the recruiter re-proposes — acceptable for the demo loop |
| **Funnel-adjacent: a separate booking status machine, no `FunnelEvent`/`ApplicationState`** | The audit's explicit constraint — *don't break the AI funnel*; a scheduling bug can only mis-set a booking row, never the funnel's CAS/audit | The booking status (`proposed`/`booked`/`completed`/`cancelled`) is *not* surfaced in funnel analytics by default; a thin "has a live interview booked" derived flag is an additive follow-up |
| **Ready-for-live gate reads `interview_pending`/`shortlisted` (no new state)** | These are the live "passed the automated screen" states in the enum **today**; the module adds zero funnel surface | If the planned `assessment_review` advisory state lands, it is deliberately **excluded** from the gate (still under review ≠ ready to book); `_SCHEDULABLE_STATES` is the one tunable point |
| **Double-booking guard = CAS on the booking `(status, version)`** | Mirrors the funnel's `set_state_if`; two concurrent picks can never both win; idempotent re-pick on a lost race | A lost pick surfaces as a refetch-and-retry (`ConflictError` → friendly "that time was just taken"); the slot isn't a separately locked row (no cross-application interviewer calendar — that's out of scope) |
| **Eager booking shell on `ProposeSlots` (not lazy)** | Only the recruiter initiates, so the candidate can never act first; eager creation gives a unique CAS-ready row from propose #1 and removes a create-or-load branch from the hot `ChooseSlot` path | A proposal that's never picked leaves a `proposed` shell — harmless, erasable, and cleaned by `complete_past`/cancel |
| **Reminders ride the existing `run_schedulers` loop (one more sweep)** | Reuses the proven scheduler's cadence + error isolation (alongside `aptitude_expiry_pass`); **no new process/cron/trigger** | Reminder accuracy is ±one `scheduler_interval_seconds` — fine for courtesy reminders; tighten the interval if needed |
| **Each reminder fires at-most-once via a CAS stamp** | `stamp_reminder_if_unset` makes the idempotent without external dedup, even though the sweep re-runs every interval | Stamp-then-notify means a post-stamp email failure can rarely miss a reminder — accepted (in-app row is durable; same bias as the notifications email policy); outbox is the later upgrade |
| **ICS invite now; OAuth calendar push later** | ICS is a **pure string** every calendar app imports — zero infra/OAuth, satisfies the "calendar" ask immediately | No two-way external busy/free sync in v1; the booking holds the canonical event so a future `CalendarPusher` seam slots in cleanly (documented, not built) |
| **Best-effort notify on every status change** | A notifications outage must never block a propose/pick/reschedule/cancel | Mirrors `advance_application`'s swallow-and-log around its notifier; a dropped notification is logged, not fatal; the in-app row is the durable channel |
| **Store UTC everywhere; render local only in the browser** | Eliminates timezone bugs at the source — the sweep + ICS do zero tz math; the viewer's zone is applied once, at render | No stored per-user timezone in v1 (the browser resolves it via `Intl`); a saved-preference tz is an additive follow-up |
| **`comp_id` denormalized onto the booking; tenant + owner scoped** | Tenant-scoped reads + the erasure cascade act on `interview_bookings` directly (mirrors `AptitudeAttempt`) | A few extra fields per row; trivially worth the join-free hot path |
| **Reuse `@ip/ui` + a tab on the applicant detail (no new shell)** | The company surface is one more tab beside Report/Messages; the candidate surface is one page in the existing shell | A dedicated company "all interviews" calendar view is a follow-up; v1 is per-applicant (note so a reviewer doesn't expect a global calendar) |

---

## 5. Testing approach

TDD throughout (failing test watched fail → implement → green), per PRODUCTION_STANDARDS §2. The gate
is `bash scripts/check.sh` (ruff format, lint+security S-rules line-88, pip-audit, pytest ×5);
**baseline 423 tests** must stay green and grow. Frontend verified by `npx pnpm@9.15.0 --filter
@ip/candidate build` + `--filter @ip/company build` + `--filter @ip/{ui,shared,api-client} typecheck`
(never `next build` while `pnpm dev` is live).

- **Resource layer (`resources/scheduling.py`) — where most coverage lands (it is the contract):**
  - **Authz reuse:** a candidate can read/choose/cancel **only their own** application's schedule
    (reuses `_owned`); a manager can propose/reschedule/cancel **only their `comp_id`'s** applications
    (reuses `_scoped` + `_require_manager`); a wrong-tenant manager → `NotFoundError`; a non-manager
    company role → `ForbiddenError`; a stranger candidate → `ForbiddenError`.
  - **Ready-for-live gate:** `ProposeSlots` on an application in `applied`/`aptitude_pending`/`scored`
    → `ValidationError`; on `interview_pending` and on `shortlisted` → allowed. (Asserts the gate reads
    the funnel state and adds no state.)
  - **Slot validation:** empty `slots` / >`MAX_SLOTS` / a past `start_at` / `duration` out of
    `[15,480]` / over-cap `location`/`note` → `ValidationError`; duplicates de-duplicated.
  - **CHOOSE CAS (the double-booking core):** picking an offered slot flips `proposed → booked`, stamps
    `chosen_start_at`/`duration`/`location`, bumps `version`; a **second concurrent pick** (simulated by
    a stale `expected_version` / an already-`booked` row) → `ConflictError`, the booking stays the
    first pick (assert exactly one `booked`, the right `chosen_start_at`); picking a `start_at` **not in
    the proposal** → `ValidationError` (independent of CAS).
  - **Reschedule:** supersedes the `open` proposal, inserts a fresh `open` one, flips the **same**
    booking back to `proposed` (version bumped, `chosen_start_at`/`reminded_*` cleared); still exactly
    one booking row (unique-per-application holds).
  - **Cancel:** candidate-cancel and recruiter-cancel each CAS `proposed`/`booked` → `cancelled` with
    the right `cancelled_by`; a double-cancel is a no-op (idempotent).
  - **DTO subset:** the listed schedule/booking shape carries no internal handles beyond what the UI
    needs (no leaking of unrelated application fields).
- **Reminder sweep (`resources/scheduler.reminder_sweep`, extend `test_scheduler.py`):**
  - a `booked` interview starting in 20h with `reminded_24h_at is None` → fires **one**
    `interview_reminder_24h` (notifier called once) **and** stamps `reminded_24h_at`; a **second sweep
    fires nothing** (the CAS stamp skips it) — the at-most-once guarantee.
  - the T-1h window is symmetric; a booking created <1h out gets only the 1h reminder (24h window no
    longer matches); a `cancelled` booking is never reminded.
  - **best-effort:** a notifier that **raises** does **not** fail the sweep (the stamp is set, the raise
    is swallowed+logged) — assert the sweep completes and other due bookings still process.
  - `complete_past` flips a `booked` row whose `chosen_start_at + duration` is in the past → `completed`
    (no notification).
- **ICS generation (`resources/scheduling_ics.py`):** a `booked` booking → a valid `VEVENT` with a
  stable `UID` (re-gen is identical → an update, not a duplicate), UTC `DTSTART`/`DTEND` (`...Z`), the
  `SUMMARY`/`LOCATION`/`DESCRIPTION`, and a bumped `SEQUENCE` after a reschedule. (Pure-string unit
  test, no network — `icalendar` is offline.)
- **gRPC servicer (`routes/scheduling.py`):** mirror the decision/aptitude servicer tests — `_STATUS`
  mapping (Forbidden→PERMISSION_DENIED, NotFound→NOT_FOUND, Validation→INVALID_ARGUMENT,
  Conflict→ALREADY_EXISTS, RateLimited→RESOURCE_EXHAUSTED), `caller_identity` wired, **no authz logic in
  the adapter**.
- **Rate-limit:** a `ProposeSlots`/`ChooseSlot` flood past the cap → `RateLimitedError`
  (RESOURCE_EXHAUSTED) with `Retry-After`; under the cap → allowed (fake/limited `RateLimiter` in the
  resource test).
- **Best-effort notify trigger:** each status change (propose/booked/reschedule/cancel) invokes the
  notify path **best-effort** for the right recipient (booked → notify the recruiter side; propose/
  reschedule → notify the candidate; cancel → notify the other party); a raising notifier does **not**
  fail the operation. (The notification row/email assertions live in the notifications-center
  spec/tests; here we assert the **call** + the swallow.)
- **Erasure cascade (Inc 0):** `CandidateEraser.erase` deletes the candidate's bookings + slots (by
  application) while leaving the application tombstone; `delete_by_applications` on both repos.
- **Frontend:** `@ip/shared/scheduling.ts` client typechecks; the candidate "pick a time" page renders
  offered slots in a fake browser zone via `Intl` (assert UTC-in → local render) and a pick calls
  `ChooseSlot` then refetches; a CAS conflict surfaces the "that time was just taken" refetch; the
  company propose form converts local→UTC before the call; both app builds green. No network in unit
  tests.
- **Manual / local E2E (Chrome via preview):** recruiter opens an applicant at `interview_pending` →
  Schedule tab → proposes 3 times → the candidate's "pick a time" page shows them **in the candidate's
  zone** → candidate picks one → status `booked`, an "Add to calendar" `.ics` downloads + opens in a
  calendar app at the right local time, a confirmation email lands in the `LoggingNotifier` sink + an
  in-app notification row appears; advancing the clock past T-24h/T-1h (or a manual sweep tick) fires
  the reminders once each; recruiter reschedules → candidate re-picks; either side cancels → the other
  is notified.

---

## Resolved gaps (completeness audit 2026-06-19)

This module **closes Part A "core" #3** of `2026-06-19-v2-completeness-audit.md` (*"Interview
scheduling / calendar — book a live interview after the AI assessment passes; availability, timezone,
reminders, reschedule"*) and folds in the relevant cross-cutting Part B items for this surface:

- **The missing "next step" after the AI screen — RESOLVED (§1, §3.2).** The voice/video pillars reach
  `interview_pending`/`shortlisted` and stop; this module is the human-follow-up layer that proposes,
  books, reminds, and reschedules the **live** interview off that signal, with a **read-only**
  ready-for-live gate that never writes the funnel.
- **Don't break the AI funnel (funnel-adjacent status) — RESOLVED (§3.3).** The booking has its **own**
  status machine (`proposed`/`booked`/`completed`/`cancelled`) and `version` CAS, with **no**
  `FunnelEvent`/`ApplicationState`/application-CAS — the AI funnel's CAS, audit, and idempotency are
  untouched.
- **Timezone correctness ("UTC timezone discipline", Part B cross-cutting) — RESOLVED (§3.9).** Every
  instant is stored **UTC**; the viewer's zone is applied **only** at the browser render (`Intl`), and
  the propose form converts local→UTC at the boundary; the sweep + ICS do **zero** tz math (ICS uses
  `...Z`). No naive datetime crosses the boundary.
- **Double-booking guard (CAS) — RESOLVED (§3.4).** `choose_if_proposed` is a CAS on the booking's
  `(status, version)` (mirrors `set_state_if`); two concurrent picks can't both win; the chosen time
  must be a member of the offered set (input legitimacy) *and* the swap is atomic (write atomicity).
- **`comp_id` / ownership scoped + rate-limited (Part A #4) — RESOLVED (§3.2, §3.10).** Authz reuses
  `_owned` (candidate) / `_scoped` + `_require_manager` (manager); `comp_id` is derived from the
  application, never client input, and denormalized for scoped reads/erasure; the write RPCs are
  rate-limited via the existing `lib.redis.RateLimiter`.
- **Reminders + reschedule/cancel with notification — RESOLVED (§3.5, §3.6).** T-24h/T-1h reminders
  fire from the existing scheduler loop (at-most-once via a CAS stamp, best-effort notify);
  reschedule/cancel each fire a best-effort notification to the right party.
- **Calendar (ICS now, OAuth push later) — RESOLVED (§3.7).** A standards-compliant `VEVENT` is
  generated on `booked` (download + email attachment), a pure string with no infra; OAuth two-way
  Google/Outlook sync is the documented next rung behind a clean `CalendarPusher` seam.
- **Erasure (Inc 0) + retention — RESOLVED (§3.11, §3.5).** `interview_slots` + `interview_bookings`
  join the `CandidateEraser` cascade (delete by `application_id`); `complete_past` keeps the booking
  collection from accumulating live rows. (Both are small, terminal-heavy collections; a TTL on
  long-`completed`/`cancelled` rows is an additive follow-up if growth ever matters.)

---

## 6. Open questions / risks

- **Reminder accuracy vs. scheduler cadence.** Reminders fire within one `scheduler_interval_seconds`
  of T-24h/T-1h. *Mitigation:* courtesy reminders tolerate ±one interval; tune the interval (or add a
  dedicated faster reminder tick) if tighter is wanted. **Open:** confirm the interval is fine for the
  demo (lean: the existing value — these aren't alarms).
- **`completed` vs. the recruiter's decision.** A booking auto-`completed` (time passed) does **not**
  imply the recruiter has decided — the decision module owns that. *Mitigation:* `completed` is purely
  the booking's housekeeping terminal; we deliberately do **not** couple it to the funnel. **Open:**
  whether a "mark interview as held / no-show" recruiter affordance is worth a v1 add (lean: no — the
  decision flow already captures outcome; a no-show is a cancel/reschedule).
- **Reviving a cancelled booking.** After a `cancelled`, a fresh `ProposeSlots` must re-open scheduling.
  *Mitigation:* the eager-shell logic CAS-resets a `cancelled` booking to `proposed` (preserving the
  unique-per-application row) on a new propose. **Open:** confirm "revive the same row" vs. "the row
  stays cancelled and a new booking can't be created" (lean: revive, so the unique index never blocks a
  legitimate re-schedule after a cancel) — confirm at planning.
- **Two read surfaces? (No.)** Like messaging, scheduling has **one** surface (authed gRPC-web) — there
  is no public/anonymous read of a schedule, so the public-surface drift risk does not apply. Worth
  stating so a reviewer doesn't look for a `/public/*` twin.
- **No interviewer calendar / cross-application conflicts.** Two applications can be `booked` for the
  same wall-clock time (different candidates, same interviewer) — v1 does not model a shared interviewer
  calendar. *Mitigation:* out of scope by design (the interviewer-pool feature); the recruiter manages
  overlaps manually. Flagged so a reviewer doesn't expect conflict detection across applications.
- **Notification kinds depend on the notifications center.** The reminder/propose/booked/cancel triggers
  call the notifications center's `notify_event` (per `…-notifications-center-design.md`) with new
  `kind`s (`interview_reminder_24h`/`_1h`, `interview_proposed`, `interview_booked`,
  `interview_rescheduled`, `interview_cancelled`). *Mitigation:* if that increment hasn't landed, the
  triggers call the **best-effort** notifier shape that exists (`NotificationRequestPublisher` /
  `TransitionNotifier`) behind the same swallow-and-log boundary, and the `_MESSAGES` entries for the
  new kinds are added to the center when it lands — flagged at handoff (the same ordering note messaging
  carries).
- **ICS email attachment depends on the mailer.** `LoggingNotifier` only logs; a real ICS *email*
  attachment needs the later `SmtpNotifier`. *Mitigation:* the `GetIcs` download works regardless (the
  primary path); the attachment is additive once SMTP lands — the booking holds the canonical event so
  the attachment is a render of existing data, no re-plumbing.
