# Applicant schedule (recruiter side) — Backend contract (v3 · frozen)

> **Screen.** `/company/jobs/[id]/applicants/[appId]/schedule` recruiter-side scheduling
> surface. **FE consumer:** [`frontend_applicant-schedule.md`](./frontend_applicant-schedule.md).
> **Status:** `EXISTING — reuse v2` · no new collection, no proto delta. Same
> `admin.scheduling.v1.SchedulingService` the candidate `/schedule` screen consumes — this
> plan documents the **recruiter-side** methods (`ProposeSlots`, `Reschedule`, `Cancel`,
> `GetSchedule`) of the same service. Restated from
> [`../scheduling/backend_scheduling.md`](../scheduling/backend_scheduling.md).
> **Anti-fiction reminder:** Sample / placeholder slots never appear; no claimed "Google
> Calendar / Outlook" integration; no fake "AI-suggested availability". The candidate context
> card never invents a recommendation or an integrity score — if the report is `NOT_FOUND` /
> still generating, the recommendation hides cleanly. See the anti-fiction rule in
> [`_design-language.md`](../_design-language.md).
> **Real-vs-mock today:** `SchedulingService` is the v2 NEW service; the FE codes against
> `makeMockSchedulingClient()` behind `NEXT_PUBLIC_MOCK` until `pnpm gen`. **The recruiter
> side reuses the same shared mock + real client as the candidate side** — both pages call
> different methods on the same client.

## Functionalities (recruiter side)

- **Get** the application's current schedule (the same `GetSchedule` the candidate uses; the
  recruiter sees the same `ScheduleDTO`, scoped to comp_id via `_member_scoped`).
- **Propose** 1..3 slots (with optional location + note) → opens a `proposed` schedule for the
  candidate.
- **Reschedule** — replace the offered slot set (and invalidate any existing booking).
- **Cancel** the interview (either role; idempotent double-cancel).
- **Context reads** for the left column: `Job.GetJob`, `Application.ListApplicants` (filtered
  to `appId`), `Report.GetIntegrityTimeline`, `Report.GetReport` — all existing.

(The candidate-side `ChooseSlot` and `GetIcs` are NOT called from this page; they remain on
the candidate `/schedule` route.)

## Service & RPCs

`admin.scheduling.v1.SchedulingService` (gRPC-web) — **the same service the candidate
consumes**. Bearer required; recruiter methods are **manager-scoped** (`recruiter` /
`company_admin`) + **comp-scoped** (target application must belong to the caller's comp;
cross-tenant `application_id` → `NOT_FOUND`).

```proto
// (Restated from ../scheduling/backend_scheduling.md — the proto is unchanged.)
rpc GetSchedule(GetScheduleRequest)   returns (ScheduleDTO);   // either role (scoped) — poll target
rpc ProposeSlots(ProposeSlotsRequest) returns (ScheduleDTO);   // recruiter (manager)
rpc Reschedule(ProposeSlotsRequest)   returns (ScheduleDTO);   // recruiter (manager)
rpc Cancel(CancelRequest)             returns (ScheduleDTO);   // either role
rpc ChooseSlot(ChooseSlotRequest)     returns (ScheduleDTO);   // candidate — not called here
rpc GetIcs(GetIcsRequest)             returns (IcsResponse);   // candidate — not called here
```

- **`ProposeSlots(application_id, slots[], location?, note?)`** — recruiter `_application_member_scoped`.
  Validate `1 ≤ slots.length ≤ 3`, each `start_at` is a parsable ISO-8601 UTC string in the
  future, each `duration_minutes ∈ [5, 480]`. Server creates a new `interview_slots` row
  (append-only proposal history) + sets the `interview_bookings` row's `status="proposed"` +
  `proposed_slots = slots`, bumps `version`. Best-effort notify candidate
  (`kind="interview_proposed"`). Errors: `INVALID_ARGUMENT` for any validation failure.
- **`Reschedule(application_id, slots[], location?, note?)`** — recruiter. Same as
  `ProposeSlots` but valid against an existing `booked` or `proposed` booking; on a `booked`
  booking the server clears the chosen slot (status flips back to `proposed`). Best-effort
  notify candidate (`kind="interview_rescheduled"`). Errors: `INVALID_ARGUMENT` (bad slots);
  `NOT_FOUND` (cross-tenant); `FAILED_PRECONDITION` (booking is `completed` or `cancelled` —
  use `ProposeSlots` to start a fresh proposal).
- **`Cancel(application_id)`** — either role; `cancel_if(...)` CAS `proposed`/`booked` →
  `cancelled` + `cancelled_by` ("recruiter" / "candidate") + `$inc version`. Double-cancel
  (already cancelled) is **idempotent success**. Best-effort notify the **other** party
  (`kind="interview_cancelled"`).
- **`GetSchedule(application_id)`** — either role `_member_scoped`; returns the current
  proposal's offered slots + booking status/chosen-time/location/note (a strict subset). The
  FE polls this every 15s (`refetchInterval: 15_000`, `refetchIntervalInBackground: false`).

**Context reads** (the candidate context card on the left):

- `Job.GetJob({ jobId })` — manager + comp-scoped. Returns the role title for the sub-line.
- `Application.ListApplicants({ jobId })` — manager + comp-scoped. The FE filters to the
  matching `appId` on the client (no per-applicant getter today; the dashboard pre-warms the
  cache).
- `Report.GetIntegrityTimeline({ applicationId })` — non-blocking; returns integrity score +
  flag count.
- `Report.GetReport({ applicationId })` — non-blocking; returns the recommendation. Polls
  with the existing `NOT_FOUND` → retry-every-3s predicate (but the scheduler page does NOT
  block on it).

## Request / Response structures (camelCase per protobuf-es on the FE)

Restated from [`../scheduling/backend_scheduling.md`](../scheduling/backend_scheduling.md)
verbatim — same shapes.

```proto
message ProposedSlot       { string start_at = 1; int32 duration_minutes = 2; }   // start_at = ISO-8601 UTC
message GetScheduleRequest { string application_id = 1; }
message ProposeSlotsRequest {
  string application_id = 1;
  repeated ProposedSlot slots = 2;          // 1..3 slots
  string location = 3;                      // optional
  string note = 4;                          // optional
}
message CancelRequest      { string application_id = 1; }
message ScheduleDTO {
  string application_id = 1; string status = 2;     // proposed | booked | completed | cancelled
  repeated ProposedSlot slots = 3;                   // open proposal's offered set ([] if none open)
  string chosen_start_at = 4; int32 chosen_duration_minutes = 5;
  string location = 6; string note = 7; string cancelled_by = 8;
}
```

**FE-only adapter** (`frontend/packages/shared/src/scheduling.ts`):

```ts
// New helper on the recruiter side; the candidate side does not need it.
// Converts a `datetime-local` input string (the viewer's local time) into a UTC ISO string.
export function toServerIso(localStr: string, _durationMinutes: number): string {
  // Date.parse on a `datetime-local` string treats it as local time (the platform contract).
  // We then call .toISOString() to serialize as UTC.
  // Examples (in America/New_York):
  //   "2024-03-10T01:30"  → "2024-03-10T06:30:00.000Z"  (EST, no DST)
  //   "2024-03-10T03:30"  → "2024-03-10T07:30:00.000Z"  (EDT, post-DST-spring)
  //   "2024-11-03T01:30"  → ambiguous; the platform resolves to the standard-time
  //                         interpretation per ECMA-262 §21.4.1.21.3 (acceptable).
  const t = new Date(localStr);
  if (isNaN(t.getTime())) throw new Error(`Invalid datetime-local value: ${localStr}`);
  return t.toISOString();
}
```

Unit tests cover non-DST, DST-spring-forward, and DST-fall-back dates in the viewer's local
zone. The candidate side **never** sees a non-UTC value — `toServerIso` is the single
local→UTC point on the recruiter side.

**FE mock shape** (`frontend/packages/shared/src/scheduling.ts`, unchanged):

```ts
export type BookingStatus = "proposed" | "booked" | "completed" | "cancelled";
export interface ProposedSlot { startAt: string; durationMinutes: number; }   // startAt = ISO-8601 UTC
export interface ScheduleDTO {
  applicationId: string; status: BookingStatus; slots: ProposedSlot[];
  chosenStartAt: string; chosenDurationMinutes: number;
  location: string; note: string; cancelledBy: string;
}

export interface SchedulingClient {
  // Candidate-side methods (existing — not called from the recruiter page):
  getSchedule(req: { applicationId: string }): Promise<ScheduleDTO>;
  chooseSlot(req: { applicationId: string; startAt: string }): Promise<ScheduleDTO>;
  cancel(req: { applicationId: string }): Promise<ScheduleDTO>;
  getIcs(req: { applicationId: string }): Promise<{ filename: string; content: string }>;
  // Recruiter-side methods (existing — called from this page):
  proposeSlots(req: { applicationId: string; slots: ProposedSlot[]; location?: string; note?: string }): Promise<ScheduleDTO>;
  reschedule(req: { applicationId: string; slots: ProposedSlot[]; location?: string; note?: string }): Promise<ScheduleDTO>;
}
```

## Data required

- **`interview_slots`** (append-only proposal history per application) + **`interview_bookings`**
  (one current booking per application — the 1:1 invariant the CAS relies on). Both
  collections + indexes are restated from
  [`../scheduling/backend_scheduling.md`](../scheduling/backend_scheduling.md):
  - `("interview_slots",[("application_id",1),("created_at",-1)])`, `("interview_slots","comp_id")`.
  - `("interview_bookings","application_id",{unique:True})` — the 1:1 invariant.
  - `("interview_bookings",[("candidate_user_id",1),("status",1)])` — candidate read path.
  - `("interview_bookings",[("status",1),("chosen_start_at",1)])` — reminder sweep read path.
- **UTC discipline (load-bearing):** every persisted instant is UTC; ICS + reminder sweep do
  zero tz math; the viewer's zone is applied only at render on the FE. The recruiter side's
  `toServerIso` is the single local→UTC point.
- **Erasure cascade:** both collections join the `CandidateEraser` cascade via
  `delete_by_applications`.

## Errors & edge cases

- **UNAUTHENTICATED** — missing/invalid bearer.
- **PERMISSION_DENIED** — non-manager caller (recruiter methods are manager-scoped).
- **NOT_FOUND** — cross-tenant `application_id` (`_member_scoped` enforces comp scoping).
- **INVALID_ARGUMENT** — `ProposeSlots` / `Reschedule` validation failures (slots.length not
  in [1,3]; `start_at` in the past or not parsable; `duration_minutes` out of [5,480]).
- **FAILED_PRECONDITION** — `Reschedule` on a `completed` or `cancelled` booking (FE surfaces
  the truthful copy + offers **Propose new times**).
- **ALREADY_EXISTS** — N/A on the recruiter side (that's the candidate `ChooseSlot` lost-race
  path).
- **RESOURCE_EXHAUSTED** — write RPC rate-limited (`RateLimitedError`).
- **Idempotent** double-cancel (already cancelled → success).
- **Empty state** — no open proposal and no booking → `status` with empty `slots`/`chosen_*`
  (FE shows `<NoProposalCard />` with + Propose slots CTA).
- Status mapping (`routes/auth._STATUS`): `ForbiddenError`→PERMISSION_DENIED,
  `NotFoundError`→NOT_FOUND, `ValidationError`→INVALID_ARGUMENT, `ConflictError`→ALREADY_EXISTS,
  `RateLimitedError`→RESOURCE_EXHAUSTED.

## Cross-references

- Restates: [`../scheduling/backend_scheduling.md`](../scheduling/backend_scheduling.md) (the
  candidate-side counterpart documents the same service from the candidate's perspective).
- Sibling FE consumer (inline tab): [`../applicant-report/frontend_applicant-report.md`](../applicant-report/frontend_applicant-report.md)
  §Task 7 (the inline Schedule tab renders the same `<RecruiterScheduler />` primitive — no
  fork).
- Context reads: [`../applicant-report/backend_applicant-report.md`](../applicant-report/backend_applicant-report.md)
  (`Report.GetReport`, `Report.GetIntegrityTimeline`),
  [`../job-pipeline/backend_job-pipeline.md`](../job-pipeline/backend_job-pipeline.md)
  (`Application.ListApplicants`),
  [`../job-edit/backend_job-edit.md`](../job-edit/backend_job-edit.md) (`Job.GetJob`).
- Design language: [`../_design-language.md`](../_design-language.md).
- Demo to match: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
- **Funnel untouched (load-bearing):** the booking has its own status + `version` CAS; the
  ready-for-live gate only reads `application.state ∈ {interview_pending, shortlisted}`. No
  new `ApplicationState` / `FunnelEvent` / application-CAS. Best-effort notify kinds flow into
  `../notifications/backend_notifications.md`.
