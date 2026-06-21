# Scheduling — Backend contract (v3 · frozen)

> **Screen.** Scheduling (`/schedule`, candidate). **FE consumer:** [`frontend_scheduling.md`](./frontend_scheduling.md).
> **Status:** `EXISTING — reuse v2` · no new collections, no proto delta. Restated from
> `../../v2-screens/scheduling.md` (`admin.scheduling.v1`).
> **Real-vs-mock today:** `SchedulingService` is the v2 NEW service; the FE codes against
> `makeMockSchedulingClient()` behind `NEXT_PUBLIC_MOCK` until `pnpm gen`. **The Aperture Pro
> rebuild changes nothing here.**
> **Anti-fiction reminder:** sample / placeholder slots on the FE use generic names; no claimed
> "Google Calendar / Outlook" integration (the FE's "Add to calendar" is a truthful `.ics`
> client-side download). See the anti-fiction rule in [`_design-language.md`](../_design-language.md).

## Functionalities (candidate side)

- **Get** the application's current schedule (open proposal's offered slots + booking
  status/chosen-time/location/note) — the poll target.
- **Choose** an offered slot (the double-booking CAS; one-way, timezone-aware, stored UTC).
- **Cancel** the interview (either role).
- **Get ICS** for a booked interview (client-side `.ics` download).

(Propose / Reschedule are recruiter RPCs on the company Schedule tab — restated for
completeness; not called by this candidate screen.)

## Service & RPCs

**Service:** `admin.scheduling.v1.SchedulingService` (authed gRPC-web on **admin**; bearer
required). **All datetimes are ISO-8601 UTC strings on the wire.**

```proto
rpc GetSchedule(GetScheduleRequest)   returns (ScheduleDTO);   // either role (scoped) — poll target
rpc ChooseSlot(ChooseSlotRequest)     returns (ScheduleDTO);   // candidate — the double-booking CAS
rpc Cancel(CancelRequest)             returns (ScheduleDTO);   // either role
rpc GetIcs(GetIcsRequest)             returns (IcsResponse);   // ICS download on booked
rpc ProposeSlots(ProposeSlotsRequest) returns (ScheduleDTO);   // recruiter (manager) — restated, not on this screen
rpc Reschedule(ProposeSlotsRequest)   returns (ScheduleDTO);   // recruiter — restated, not on this screen
```

- **`GetSchedule(application_id)`** — candidate `aptitude._owned`; returns the `open`
  proposal's offered slots + booking status/chosen-time/location/note (a **strict subset**, no
  unrelated application fields).
- **`ChooseSlot(application_id, start_at)`** — candidate `_owned`. **Validate `start_at` ∈
  offered slots → `INVALID_ARGUMENT` BEFORE any CAS write.** Then `choose_if_proposed(...)`
  CAS (filter `status=="proposed"` + `version==expected` → set `booked` + chosen fields +
  `$inc version`). Lost race / already booked → `ConflictError` → **`ALREADY_EXISTS`** (booking
  stays the first pick). Best-effort notify recruiter (`kind="interview_booked"`).
- **`Cancel(application_id)`** — either role; `cancel_if(...)` CAS `proposed`/`booked` →
  `cancelled` + `cancelled_by` + `$inc version`. Double-cancel (already cancelled) is
  **idempotent success**. Best-effort notify the **other** party (`kind="interview_cancelled"`).
- **`GetIcs(application_id)`** — load the `booked` booking, `build_ics(...)` (pure `VEVENT`,
  stable `UID=aptura-interview-{booking_id}@aptura`, UTC `DTSTART`/`DTEND`,
  `SEQUENCE=version`). → `{filename, content}`.

## Request / Response structures

```proto
message ProposedSlot       { string start_at = 1; int32 duration_minutes = 2; }   // start_at = ISO-8601 UTC
message GetScheduleRequest { string application_id = 1; }
message ChooseSlotRequest  { string application_id = 1; string start_at = 2; }     // must be an offered slot
message CancelRequest      { string application_id = 1; }
message GetIcsRequest      { string application_id = 1; }
message IcsResponse        { string filename = 1; string content = 2; }
message ScheduleDTO {
  string application_id = 1; string status = 2;          // proposed | booked | completed | cancelled
  repeated ProposedSlot slots = 3;                        // open proposal's offered set ([] if none open)
  string chosen_start_at = 4; int32 chosen_duration_minutes = 5;
  string location = 6; string note = 7; string cancelled_by = 8;
}
```

**FE mock shape** (camelCase, protobuf-es; `frontend/packages/shared/src/scheduling.ts`):

```ts
export type BookingStatus = "proposed" | "booked" | "completed" | "cancelled";
export interface ProposedSlot { startAt: string; durationMinutes: number; }   // startAt = ISO-8601 UTC
export interface ScheduleDTO {
  applicationId: string; status: BookingStatus; slots: ProposedSlot[];
  chosenStartAt: string; chosenDurationMinutes: number;
  location: string; note: string; cancelledBy: string;
}
```

## Data required

- **`interview_slots`** (append-only proposal history per application) + **`interview_bookings`**
  (**one current booking per application** — the 1:1 invariant the CAS relies on; `version` for
  CAS, `chosen_start_at` UTC, `comp_id`/`candidate_user_id` copied from the application).
- **Indexes** (single authority `infra/db.py`):
  - `("interview_slots",[("application_id",1),("created_at",-1)])`, `("interview_slots","comp_id")`.
  - `("interview_bookings","application_id",{unique:True})` — the 1:1 invariant.
  - `("interview_bookings",[("candidate_user_id",1),("status",1)])` — candidate read path.
  - `("interview_bookings",[("status",1),("chosen_start_at",1)])` — reminder sweep read path.
- **UTC discipline (load-bearing):** every persisted instant is UTC; ICS + reminder sweep do
  **zero tz math**; the viewer's zone is applied **only at render** on the FE
  (`@ip/shared/datetime.ts`).
- **Erasure cascade:** both collections join the `CandidateEraser` cascade via
  `delete_by_applications`.

## Errors & edge cases

- **UNAUTHENTICATED** — missing/invalid bearer. **PERMISSION_DENIED** — non-owner candidate.
- **INVALID_ARGUMENT** — `ChooseSlot` `start_at` not in the offered set (rejected **before** any
  CAS write).
- **ALREADY_EXISTS** — `ChooseSlot` lost the double-booking CAS (FE shows the friendly "that
  time was just taken" + refetch, never a hard error). **RESOURCE_EXHAUSTED** — write RPC
  rate-limited (`RateLimitedError`).
- **Idempotent** double-cancel (already cancelled → success). **Empty state** — no open proposal
  and no booking → `status` with empty `slots`/`chosen_*` (FE shows "No interview scheduled").
- Status mapping (`routes/auth._STATUS`): `ForbiddenError`→PERMISSION_DENIED,
  `NotFoundError`→NOT_FOUND, `ValidationError`→INVALID_ARGUMENT, `ConflictError`→ALREADY_EXISTS,
  `RateLimitedError`→RESOURCE_EXHAUSTED.

## Cross-references

- Restates `../../v2-screens/scheduling.md` Part A (`SchedulingService`).
- Design language: [`../_design-language.md`](../_design-language.md).
- Demo to match: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
- **Funnel untouched (load-bearing):** the booking has its **own** status + `version` CAS; the
  ready-for-live gate only **reads** `application.state ∈ {interview_pending, shortlisted}`
  (enforced on the recruiter `ProposeSlots`). No new `ApplicationState`/`FunnelEvent`/application-CAS.
- Best-effort notify kinds (`interview_proposed` / `interview_booked` / `interview_cancelled` /
  `interview_rescheduled`) flow into `../notifications/backend_notifications.md`.
