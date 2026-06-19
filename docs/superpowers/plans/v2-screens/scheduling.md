# Screen: Interview scheduling — FE plan + BE contract

> Part of the [v2 build program](../2026-06-20-v2-build-program.md) (Wave 5, scheduling).
> **Routes:** `apps/candidate/app/schedule/page.tsx` (candidate picks a slot) + a company applicant-view "propose slots" surface (a **Schedule tab** on `apps/company/app/jobs/[id]/applicants/[appId]/page.tsx`) · **Mockup:** `aptura_interview_scheduling` · **Pillar:** [interview-scheduling](../../v2/2026-06-19-interview-scheduling.md)
> **Goal:** Coordinate the **live human interview** after the AI screen passes. A recruiter **proposes a set of time slots** for an application that reached `interview_pending`/`shortlisted`; the candidate **picks one** (one-way, timezone-aware, **stored UTC**). A **double-booking CAS** prevents two picks winning; an **ICS invite** is generated on `booked`; **T-24h/T-1h reminders** ride the existing admin scheduler loop.

Scheduling is **funnel-adjacent**: it reuses the admin authed-gRPC pattern (`useAuth().api.scheduling.*`), owns its own Mongo, has its **own** booking status machine (`proposed`/`booked`/`completed`/`cancelled`) with a `version` CAS, and **never writes funnel state** — it only **reads** the application's `state` for the ready-for-live gate. **No new `FunnelEvent`/`ApplicationState`/application CAS.** **UTC discipline:** every persisted instant is UTC; the viewer's zone is applied **only** at render (`Intl.DateTimeFormat`); the propose form converts local→UTC **before** the call.

---

## A. Backend contract (hand this to a backend session)

**Status:** NEW · **Service:** `admin.scheduling.v1` — a new authed gRPC-web `SchedulingService` on **admin** (owns Mongo), mirroring `routes/decision.py`. A thin `SchedulingServicer` adapts gRPC→`resources/scheduling.py` (the contract: authz + ready-for-live gate + tenancy + CAS pick + status + reminders + DTO + best-effort notify).

### RPC signatures (`package admin.scheduling.v1`; all datetimes are **ISO-8601 UTC strings** on the wire)

```proto
service SchedulingService {
  rpc ProposeSlots(ProposeSlotsRequest) returns (ScheduleDTO);    // recruiter (manager) — creates open proposal + eager proposed booking
  rpc Reschedule(ProposeSlotsRequest) returns (ScheduleDTO);      // same shape; resource branches (booking exists)
  rpc GetSchedule(GetScheduleRequest) returns (ScheduleDTO);      // either role (scoped) — poll target
  rpc ChooseSlot(ChooseSlotRequest) returns (ScheduleDTO);        // candidate — the double-booking CAS
  rpc Cancel(CancelRequest) returns (ScheduleDTO);                // either role
  rpc GetIcs(GetIcsRequest) returns (IcsResponse);                // ICS download on booked
  rpc ListCandidateInterviews(ListCandidateRequest) returns (BookingListResponse);
  rpc ListCompanyBookings(ListCompanyRequest) returns (BookingListResponse);
}
message ProposedSlot { string start_at = 1; int32 duration_minutes = 2; }     // start_at = ISO-8601 UTC
message ProposeSlotsRequest { string application_id = 1; repeated ProposedSlot slots = 2; string location = 3; string note = 4; }
message GetScheduleRequest { string application_id = 1; }
message ChooseSlotRequest { string application_id = 1; string start_at = 2; }  // start_at must be an offered slot
message CancelRequest { string application_id = 1; }
message GetIcsRequest { string application_id = 1; }
message IcsResponse { string filename = 1; string content = 2; }
message ScheduleDTO {
  string application_id = 1; string status = 2;          // proposed | booked | completed | cancelled
  repeated ProposedSlot slots = 3;                        // the open proposal's offered set ([] if none open)
  string chosen_start_at = 4; int32 chosen_duration_minutes = 5;
  string location = 6; string note = 7; string cancelled_by = 8;
}
message BookingDTO { string application_id = 1; string status = 2; string chosen_start_at = 3; int32 chosen_duration_minutes = 4; string location = 5; }
message ListCandidateRequest { int32 page = 1; int32 page_size = 2; }
message ListCompanyRequest { string status = 1; int32 page = 2; int32 page_size = 3; }
message BookingListResponse { repeated BookingDTO bookings = 1; int32 page = 2; int32 page_size = 3; int32 total = 4; }
```

**Request/response semantics:**

- **`ProposeSlots(application_id, slots[], location, note)`** — manager-auth (`decision._require_manager` + `decision._scoped`). **Ready-for-live gate:** `application.state ∈ {interview_pending, shortlisted}` else `INVALID_ARGUMENT` (no slots/booking written). Slot validation (boundary): non-empty, ≤ `MAX_SLOTS=10`, every `start_at` future (vs clock), `duration_minutes ∈ [15, 480]`, `location ≤ 512`, `note ≤ 1024`, duplicates de-duped. Supersede any `open` proposal, insert a fresh `open` `InterviewSlots`, and **eager-create** (or `reset_to_proposed`) **one** `proposed` booking (`comp_id`/`candidate_user_id` copied from the application, `version=0`, `chosen_start_at=None`). Best-effort notify candidate (`kind="interview_proposed"`). → `ScheduleDTO`.
- **`Reschedule(...)`** — same shape, minus eager-create (the booking exists): supersede + new `open` proposal + CAS `reset_to_proposed` (clears `chosen_start_at`/`reminded_*`, bumps `version`). Notify `kind="interview_rescheduled"`.
- **`GetSchedule(application_id)`** — either role (candidate `aptitude._owned`, manager `decision._scoped`); returns the `open` proposal's offered slots + booking status/chosen-time/location/note — a **strict subset** (no unrelated application fields).
- **`ChooseSlot(application_id, start_at)`** — candidate-auth (`_owned`). **Validate `start_at` ∈ offered slots → `INVALID_ARGUMENT` BEFORE any CAS write.** Then `bookings.choose_if_proposed(booking_id, expected_version=booking.version, chosen_start_at, duration, location, now)` (filter `status=="proposed"` + `version==expected_version` → set `booked` + chosen fields + `$inc version`). On `False` (lost race / already booked) → `ConflictError` → **`ALREADY_EXISTS`** (the booking stays the first pick). Best-effort notify recruiter (`kind="interview_booked"`). → `ScheduleDTO`.
- **`Cancel(application_id)`** — either role; `bookings.cancel_if(..., by=<role-derived>)` CAS `proposed`/`booked` → `cancelled` + `cancelled_by` + `$inc version`. A **double-cancel** (`modified_count == 0`, already cancelled) is treated as success (idempotent). Best-effort notify the **other** party (`kind="interview_cancelled"`).
- **`GetIcs(application_id)`** — load the `booked` booking, resolve job title + emails, `build_ics(...)` (pure `VEVENT`, stable `UID = aptura-interview-{booking_id}@aptura`, UTC `DTSTART`/`DTEND`, `SEQUENCE = version` so a re-sent invite is an update). → `{filename, content}`.
- **`ListCandidateInterviews` / `ListCompanyBookings`** — owner/tenant-scoped booking lists for the candidate interviews list + a future company view.

**Auth/scope:** bearer. **Authz reuses existing primitives — do NOT invent a new one:** candidate → `aptitude._owned`; manager → `decision._require_manager` + `decision._scoped` (authorize against the **application**; slots + booking are 1:1-per-application with it). Write RPCs rate-limited (`lib.redis.RateLimiter` → `RateLimitedError` → **`RESOURCE_EXHAUSTED`**). Status mapping (`routes/auth._STATUS`, verbatim from real code): `ForbiddenError`→PERMISSION_DENIED, `NotFoundError`→NOT_FOUND, `ValidationError`→INVALID_ARGUMENT, **`ConflictError`→ALREADY_EXISTS**, **`RateLimitedError`→RESOURCE_EXHAUSTED**, no token→UNAUTHENTICATED.

**Backed by:**
- `src/admin/app/resources/scheduling.py` (NEW — all logic) + `resources/scheduling_ics.py` (NEW — pure `icalendar` `VEVENT`) + `resources/scheduler.py` (+`reminder_sweep`, mirror `aptitude_expiry_pass`).
- `src/admin/app/infra/repositories/interview_slots.py` (NEW — `InterviewSlotsRepository`: create/get_open_for_application/supersede_open/list_for_application/delete_by_applications) + `interview_bookings.py` (NEW — `InterviewBookingRepository`: create/get_by_application/**`choose_if_proposed`** CAS/**`cancel_if`** CAS/**`reset_to_proposed`** CAS/**`stamp_reminder_if_unset`** CAS/due_reminders/complete_past/list_for_candidate/list_for_company/delete_by_applications).
- `src/admin/app/model/scheduling.py` (NEW — `ProposedSlot`, `InterviewSlots`, `InterviewBooking`; UTC datetimes).
- **Collections:** `interview_slots` (append-only proposal history per application) + `interview_bookings` (**one current booking per application** — the 1:1 invariant the CAS relies on). **Indexes** (single authority `src/admin/app/infra/db.py`):
  ```python
  IndexSpec("interview_slots", [("application_id", 1), ("created_at", -1)]),
  IndexSpec("interview_slots", "comp_id"),
  IndexSpec("interview_bookings", "application_id", {"unique": True}),
  IndexSpec("interview_bookings", [("comp_id", 1), ("status", 1)]),
  IndexSpec("interview_bookings", [("candidate_user_id", 1), ("status", 1)]),
  IndexSpec("interview_bookings", [("status", 1), ("chosen_start_at", 1)]),  # reminder sweep read path
  ```
- Both collections **join the `CandidateEraser` cascade** (Inc 0) via `delete_by_applications`.

**Funnel untouched (load-bearing):** no `ApplicationState`/`FunnelEvent`/application-CAS — the booking has its **own** status + `version` CAS; the gate only **reads** `state`. Every notify is **best-effort** (try/except + `get_logger`, never blocks). The reminder sweep is a **system job** (no authz) wired into `main.py`'s `run_schedulers()` next to `aptitude_expiry_pass`; ICS + sweep do zero tz math.

**Proto/REST file:** `src/admin/app/routes/pb/scheduling.proto` (NEW) → generated `scheduling_pb2*.py` (buf/protoc) + the TS client via `pnpm gen`; `routes/scheduling.py` (NEW — `SchedulingServicer`); `routes/web.py` (+register; +slots/bookings in `make_eraser`; thread `RateLimiter(redis)` + the notifier). **Pillar cross-ref:** [interview-scheduling](../../v2/2026-06-19-interview-scheduling.md) Tasks 1–8 (models/repos/indexes, propose/reschedule gate, choose/cancel CAS, ICS, reminder_sweep, proto, servicer, erasure).

**FE mock shape** (`frontend/packages/shared/src/scheduling.ts` types — the FE codes against this until `pnpm gen` exposes the real generated `ScheduleDTO`/`BookingDTO`):

```ts
export type BookingStatus = "proposed" | "booked" | "completed" | "cancelled";
export interface ProposedSlot { startAt: string; durationMinutes: number; }   // startAt = ISO-8601 UTC
export interface ScheduleDTO {
  applicationId: string; status: BookingStatus; slots: ProposedSlot[];
  chosenStartAt: string; chosenDurationMinutes: number;
  location: string; note: string; cancelledBy: string;
}
export interface BookingDTO {
  applicationId: string; status: BookingStatus; chosenStartAt: string;
  chosenDurationMinutes: number; location: string;
}
```

---

## B. Frontend plan (TDD, bite-sized)

> **Grounding (verbatim from real code — mirror, don't invent):**
> - **gRPC api-client barrel** `frontend/packages/api-client/src/index.ts`: an import block `import { DecisionService } from "./gen/decision_pb.js";`, a re-export `export * from "./gen/decision_pb.js";`, the `ApiClients` interface (`decisions: Client<typeof DecisionService>; …`), and `clientsFromTransport` (`decisions: createClient(DecisionService, transport), …`). Mirror **exactly** to add `scheduling`.
> - **Authed gRPC pattern** (`frontend/apps/company/app/jobs/[id]/page.tsx`): `const { api, token } = useAuth(); const { id } = useParams<{ id: string }>(); useAuthedQuery(token, { queryKey, queryFn: () => api.jobs.getJob({ jobId: id }) });`. Mutations: `useMutation({ mutationFn: () => api.decisions.decideApplication({...}), onSuccess: () => { toast.success(...); queryClient.invalidateQueries({ queryKey: [...] }); }, onError: (err) => toast.error(errorMessage(err)) })` (`frontend/apps/company/components/decision-control.tsx`).
> - **Tabs** (`frontend/apps/company/app/jobs/[id]/page.tsx`): `<Tabs defaultValue="applicants"><TabsList><TabsTrigger value="applicants">Applicants</TabsTrigger>…</TabsList><TabsContent value="applicants">…</TabsContent></Tabs>`. **The applicant-detail page `apps/company/app/jobs/[id]/applicants/[appId]/page.tsx` currently has NO tabs** — it renders a `ReportView` directly. This plan **wraps it in `Tabs`** (Report + Schedule) — the first task is the refactor.
> - **`@ip/ui` exports** (`frontend/packages/ui/src/index.ts`): `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`, `RadioGroup`/`RadioGroupItem`, `ConfirmDialog`, `Card`/`CardHeader`/`CardTitle`/`CardContent`, `Field`, `Input`, `Textarea`, `Select`/`SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem`, `Button` (`variant`/`loading`/`leadingIcon`/`size`), `Badge` (`tone`: neutral/info/success/warning/danger · `variant`: subtle/solid/outline), `Alert` (`tone`: info/success/warning/danger), `EmptyState`/`ErrorState`/`LoadingState`, `PageHeader`, `toast`, `buttonVariants`. **lucide icons imported in the app**, never via `@ip/ui`.
> - **Errors + query:** `errorMessage`/`isCode`/`Code`/`ConnectError` from `@ip/shared`; `makeQueryClient` → `retry:false`; `refetchUntil`. **No date library** — `Intl.DateTimeFormat` is built-in; all tz conversion lives in a new `@ip/shared/datetime.ts`.
> - **Candidate auth** `frontend/apps/candidate/lib/auth.tsx` + **company auth** `frontend/apps/company/lib/auth.tsx`: `useAuth()` → `{ api, token, ready, identity }`; `useRequireAuth`/`useRequireRole`. Candidate shell `frontend/apps/candidate/components/candidate-shell.tsx` `NAV`; company shell `frontend/apps/company/components/company-shell.tsx` `NAV`.

**Files:**
- Create: `frontend/packages/shared/src/datetime.ts` (`formatLocal`/`localInputToUtcIso`/`viewerTimeZone`) + `frontend/packages/shared/src/datetime.test.ts`
- Create: `frontend/packages/shared/src/scheduling.ts` (`createSchedulingClient(api)` + query-key helpers + the mock) + export in `index.ts`
- Modify: `frontend/packages/api-client/src/index.ts` (+`scheduling` after `pnpm gen`)
- Create: `frontend/apps/candidate/lib/use-schedule.ts`, `frontend/apps/candidate/app/schedule/page.tsx`
- Modify: `frontend/apps/candidate/components/candidate-shell.tsx` (+`{ href: "/schedule", label: "Interviews" }`)
- Create: `frontend/apps/company/components/schedule-panel.tsx`
- Modify: `frontend/apps/company/app/jobs/[id]/applicants/[appId]/page.tsx` (wrap in `Tabs`; add a **Schedule** tab)

**Query keys (owned in `scheduling.ts` so views + invalidation never drift):** `["scheduling","schedule",applicationId]` · `["scheduling","candidate-interviews"]` · `["scheduling","company-bookings",status ?? "all"]`.

---

### Task 1: `datetime.ts` — the single UTC↔local boundary (pure, testable)

- [ ] **Step 1: Write the failing test** — `frontend/packages/shared/src/datetime.test.ts` (run with a fixed `TZ` so the assertion is stable):
```ts
import { describe, it, expect } from "vitest";
import { localInputToUtcIso, formatLocal } from "./datetime.js";

describe("datetime boundary", () => {
  it("localInputToUtcIso converts a datetime-local value to a UTC ISO instant", () => {
    // With TZ=UTC in the test env, local == UTC.
    expect(localInputToUtcIso("2026-06-24T14:00")).toBe("2026-06-24T14:00:00.000Z");
  });
  it("formatLocal renders a UTC instant in the viewer zone (TZ=UTC → no shift)", () => {
    expect(formatLocal("2026-06-24T14:00:00.000Z")).toMatch(/2026/);
  });
});
```
- [ ] **Step 2: Run it, verify it fails** — `TZ=UTC npx pnpm@9.15.0 --filter @ip/shared test datetime` → FAIL.
- [ ] **Step 3: Implement `datetime.ts`** (pure, no deps — `Intl` is built-in):
```ts
/** Render a UTC ISO instant in the viewer's resolved zone, e.g. "Jun 24, 2026, 2:00 PM GMT+5:30". */
export function formatLocal(isoUtc: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium", timeStyle: "short", timeZoneName: "short",
  }).format(new Date(isoUtc));
}
/** Convert a <input type="datetime-local"> value → a UTC ISO instant BEFORE the gRPC call. */
export function localInputToUtcIso(localDateTime: string): string {
  return new Date(localDateTime).toISOString();
}
/** The viewer's resolved zone, for a "times shown in {zone}" caption. */
export function viewerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
```
- [ ] **Step 4: Run test → PASS** — `TZ=UTC npx pnpm@9.15.0 --filter @ip/shared test datetime` → PASS.
- [ ] **Step 5: Commit** — `git add frontend/packages/shared/src/datetime.ts frontend/packages/shared/src/datetime.test.ts && git commit -m "feat(scheduling): UTC<->local datetime boundary (@ip/shared)"`

### Task 2: `scheduling.ts` shared client + query keys + mock (lets both surfaces build before `pnpm gen`)

- [ ] **Step 1:** Create `frontend/packages/shared/src/scheduling.ts` — mirror `interview.ts`/`jd.ts` as a `create*Client(api)` factory over the **gRPC `ApiClients`** (not REST). Query-key helpers owned here. The caller passes **UTC ISO `start_at`** (the form converts via `localInputToUtcIso` first — the client never sends local time). Errors surface as `ConnectError` (no try/except here — the React layer renders via `errorMessage`):
```ts
import type { ApiClients } from "@ip/api-client";

export type BookingStatus = "proposed" | "booked" | "completed" | "cancelled";
export interface ProposedSlot { startAt: string; durationMinutes: number; }
export interface ScheduleDTO {
  applicationId: string; status: BookingStatus; slots: ProposedSlot[];
  chosenStartAt: string; chosenDurationMinutes: number;
  location: string; note: string; cancelledBy: string;
}
export const scheduleQueryKey = (applicationId: string) => ["scheduling", "schedule", applicationId] as const;
export const candidateListQueryKey = () => ["scheduling", "candidate-interviews"] as const;
export const companyListQueryKey = (status?: string) => ["scheduling", "company-bookings", status ?? "all"] as const;

export function createSchedulingClient(api: ApiClients) {
  return {
    scheduleQueryKey, candidateListQueryKey, companyListQueryKey,
    getSchedule: (applicationId: string) => api.scheduling.getSchedule({ applicationId }),
    propose: (applicationId: string, slots: ProposedSlot[], location?: string, note?: string) =>
      api.scheduling.proposeSlots({ applicationId, slots, location: location ?? "", note: note ?? "" }),
    reschedule: (applicationId: string, slots: ProposedSlot[], location?: string, note?: string) =>
      api.scheduling.reschedule({ applicationId, slots, location: location ?? "", note: note ?? "" }),
    // startAtUtcIso must be one of the offered slots' startAt (already UTC).
    choose: (applicationId: string, startAtUtcIso: string) =>
      api.scheduling.chooseSlot({ applicationId, startAt: startAtUtcIso }),
    cancel: (applicationId: string) => api.scheduling.cancel({ applicationId }),
    getIcs: (applicationId: string) => api.scheduling.getIcs({ applicationId }),
    listCandidate: () => api.scheduling.listCandidateInterviews({}),
    listCompany: (status?: string) => api.scheduling.listCompanyBookings({ status: status ?? "" }),
  };
}
```
- [ ] **Step 2: Add a mock behind a flag** (lets the screens build before `pnpm gen`/the proto lands). In `scheduling.ts`, add `makeMockSchedulingClient()` returning the same interface over an in-memory fixture (`status: "proposed"` with 3 future slots; `choose` flips to `booked`); the apps select it via `process.env.NEXT_PUBLIC_MOCK === "1"`. (Once the proto regenerates, drop the mock — the real `api.scheduling.*` satisfies the same surface.)
- [ ] **Step 3: Barrel** — export `createSchedulingClient`, `scheduleQueryKey`/`candidateListQueryKey`/`companyListQueryKey`, and re-export `ScheduleDTO`/`BookingDTO`/`ProposedSlot`/`BookingStatus` from `frontend/packages/shared/src/index.ts`.
- [ ] **Step 4: Verify** — `npx pnpm@9.15.0 --filter @ip/shared typecheck`. *(Until `pnpm gen` adds `scheduling` to `ApiClients`, the `api.scheduling.*` references won't typecheck — guard this task behind the mock interface, or land Task 3 (`pnpm gen`) first. State the chosen order at execution.)*
- [ ] **Step 5: Commit** — `git commit -am "feat(scheduling): shared gRPC client + query keys + mock (@ip/shared)"`

### Task 3: api-client wiring (after `pnpm gen`)

- [ ] **Step 1:** After the BE session lands `scheduling.proto` and `pnpm gen` regenerates `frontend/packages/api-client/src/gen/scheduling_pb.js`, edit `frontend/packages/api-client/src/index.ts` mirroring `decisions` exactly — four edits:
```ts
import { SchedulingService } from "./gen/scheduling_pb.js";   // (a) import block
export * from "./gen/scheduling_pb.js";                        // (b) re-export block
// (c) in ApiClients:
scheduling: Client<typeof SchedulingService>;
// (d) in clientsFromTransport return:
scheduling: createClient(SchedulingService, transport),
```
- [ ] **Step 2: Verify** — `npx pnpm@9.15.0 --filter @ip/api-client typecheck` then `--filter @ip/shared typecheck` (api-client first — shared depends on its generated types). Now drop the `scheduling.ts` mock; the real `api.scheduling.*` satisfies `createSchedulingClient`.
- [ ] **Step 3: Commit** — `git commit -am "feat(scheduling): wire SchedulingService into api-client (post-gen)"`

### Task 4: candidate `useSchedule` hook + `app/schedule/page.tsx` (pick a slot) + nav

- [ ] **Step 1: `useSchedule(applicationId)`** — `frontend/apps/candidate/lib/use-schedule.ts`. `const { api } = useAuth(); const sched = useMemo(() => createSchedulingClient(api), [api]);`. **Poll** `getSchedule` (`refetchInterval: 15_000, refetchIntervalInBackground: false`). **choose mutation:** on a `ConnectError` with code `already_exists` (the CAS lost-race) → `toast.error("That time was just taken — here are the current options")` + refetch; other errors → `toast.error(errorMessage(err))`; on success invalidate `scheduleQueryKey` + `candidateListQueryKey`. **cancel mutation** + invalidate. Expose `{ schedule, isLoading, isError, error, refetch, choose, choosing, cancel, cancelling }`.
```tsx
"use client";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSchedulingClient, errorMessage, isCode, Code, toast } from "@ip/shared"; // toast is from @ip/ui — import accordingly
import { useAuth } from "./auth";

export function useSchedule(applicationId: string) {
  const { api } = useAuth();
  const qc = useQueryClient();
  const sched = useMemo(() => createSchedulingClient(api), [api]);
  const q = useQuery({
    queryKey: sched.scheduleQueryKey(applicationId),
    queryFn: () => sched.getSchedule(applicationId),
    refetchInterval: 15_000, refetchIntervalInBackground: false,
  });
  const choose = useMutation({
    mutationFn: (startAtUtcIso: string) => sched.choose(applicationId, startAtUtcIso),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sched.scheduleQueryKey(applicationId) });
      qc.invalidateQueries({ queryKey: sched.candidateListQueryKey() });
    },
    onError: (err) => {
      if (isCode(err, Code.AlreadyExists)) { toast.error("That time was just taken — here are the current options"); void q.refetch(); }
      else toast.error(errorMessage(err));
    },
  });
  const cancel = useMutation({
    mutationFn: () => sched.cancel(applicationId),
    onSuccess: () => qc.invalidateQueries({ queryKey: sched.scheduleQueryKey(applicationId) }),
    onError: (err) => toast.error(errorMessage(err)),
  });
  return { schedule: q.data, isLoading: q.isLoading, isError: q.isError, error: q.error,
    refetch: q.refetch, choose: choose.mutate, choosing: choose.isPending,
    cancel: cancel.mutate, cancelling: cancel.isPending };
}
```
- [ ] **Step 2: `app/schedule/page.tsx`** — `"use client"`, `useRequireAuth` + `useRequireRole(["candidate"])`, inside `<CandidateShell>`, `PageHeader` "Interviews". For v1 this page is **per-application**: read the application id from the query string (`?application=<id>`) — entered from a dashboard "Schedule interview" link on an `interview_pending` card — and render the pick-a-time surface. Branch on `schedule.status`:
  - **`"proposed"`** → a `Card` listing the offered `slots` rendered with `formatLocal(slot.startAt)` (candidate's zone) + a "times shown in {viewerTimeZone()}" caption; each slot a `RadioGroupItem`; a **"Confirm time"** `Button` (disabled until selected / while `choosing`) calls `choose(selectedStartAt)`. Show `location`/`note` (`whitespace-pre-wrap`). Wrap the slot list in `<div role="status" aria-live="polite">` so a newly-polled proposal is announced.
  - **`"booked"`** → a confirmation `Card`: "Interview confirmed for {formatLocal(chosenStartAt)}", the `location`, an **"Add to calendar"** `Button` → `getIcs` → client-side download (`new Blob([content], { type: "text/calendar" })` → an `<a download>` click), and a **"Cancel"** `ConfirmDialog` → `cancel`.
  - **`"cancelled"`** → `Alert tone="warning"` ("This interview was cancelled" + `cancelledBy`); **`"completed"`** → `Alert tone="neutral"` ("This interview has taken place").
  - states: `LoadingState`; no-proposal-no-booking → `EmptyState title="No interview scheduled" description="When the hiring team proposes times, they'll appear here."`; `isError` → `ErrorState message={errorMessage(error)} retry={refetch}`.
```tsx
"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth, useRequireAuth, useRequireRole } from "../../lib/auth";
import { CandidateShell } from "../../components/candidate-shell";
import { PageHeader, Card, CardContent, RadioGroup, RadioGroupItem, Button, Alert, ConfirmDialog, EmptyState, LoadingState, ErrorState } from "@ip/ui";
import { errorMessage, formatLocal, viewerTimeZone, createSchedulingClient } from "@ip/shared";
import { useSchedule } from "../../lib/use-schedule";

export default function SchedulePage() {
  const { token, ready, identity, api } = useAuth();
  useRequireAuth(token, ready, "/login");
  useRequireRole(identity?.role, ["candidate"], ready);
  const applicationId = useSearchParams().get("application") ?? "";
  const { schedule, isLoading, isError, error, refetch, choose, choosing, cancel, cancelling } = useSchedule(applicationId);
  const [picked, setPicked] = useState("");
  if (!token) return null;
  async function addToCalendar() {
    const { content, filename } = await createSchedulingClient(api).getIcs(applicationId);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: "text/calendar" }));
    a.download = filename; a.click(); URL.revokeObjectURL(a.href);
  }
  return (
    <CandidateShell>
      <PageHeader title="Interviews" />
      {isLoading && <LoadingState />}
      {isError && <ErrorState message={errorMessage(error)} retry={() => refetch()} />}
      {schedule && schedule.status === "proposed" && (
        <Card><CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">Times shown in {viewerTimeZone()}</p>
          <div role="status" aria-live="polite">
            <RadioGroup value={picked} onValueChange={setPicked}>
              {schedule.slots.map((s) => (
                <label key={s.startAt} className="flex items-center gap-3 py-1.5">
                  <RadioGroupItem value={s.startAt} />
                  <span>{formatLocal(s.startAt)} · {s.durationMinutes} min</span>
                </label>
              ))}
            </RadioGroup>
          </div>
          {schedule.note && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{schedule.note}</p>}
          <Button disabled={!picked || choosing} loading={choosing} onClick={() => choose(picked)} className="self-start">Confirm time</Button>
        </CardContent></Card>
      )}
      {schedule && schedule.status === "booked" && (
        <Card><CardContent className="flex flex-col gap-3">
          <p className="font-display font-semibold">Interview confirmed for {formatLocal(schedule.chosenStartAt)}</p>
          {schedule.location && <p className="whitespace-pre-wrap text-sm">{schedule.location}</p>}
          <div className="flex gap-3">
            <Button onClick={() => void addToCalendar()}>Add to calendar</Button>
            <ConfirmDialog trigger={<Button variant="outline" loading={cancelling}>Cancel</Button>}
              title="Cancel this interview?" onConfirm={() => cancel()} />
          </div>
        </CardContent></Card>
      )}
      {schedule && schedule.status === "cancelled" && <Alert tone="warning" title="This interview was cancelled">{schedule.cancelledBy && `Cancelled by ${schedule.cancelledBy}.`}</Alert>}
      {schedule && schedule.status === "completed" && <Alert tone="neutral" title="This interview has taken place" />}
      {!isLoading && !schedule && <EmptyState title="No interview scheduled" description="When the hiring team proposes times, they’ll appear here." />}
    </CandidateShell>
  );
}
```
- [ ] **Step 3: Nav** — add `{ href: "/schedule", label: "Interviews" }` to `candidate-shell.tsx`'s `NAV`; on the dashboard `interview_pending` card add a `Link` to `/schedule?application={a.applicationId}`.
- [ ] **Step 4: Verify build + preview** — `NEXT_PUBLIC_MOCK=1 npx pnpm@9.15.0 --filter @ip/candidate build` clean; preview (no `next build` while `pnpm dev` is live): offered slots render in the **local** zone; picking + Confirm flips to `booked`; "Add to calendar" downloads an `.ics`; polling stops on a hidden tab. Screenshot.
- [ ] **Step 5: Commit** — `git commit -am "feat(scheduling): candidate pick-a-time page + useSchedule + nav"`

### Task 5: company Schedule tab — wrap the applicant-detail page in `Tabs` + `schedule-panel.tsx`

- [ ] **Step 1: Refactor the applicant-detail page to `Tabs`** — `frontend/apps/company/app/jobs/[id]/applicants/[appId]/page.tsx` currently renders `ReportView` directly (no tabs). Wrap it: a `Report` tab (the existing `ReportView`) + a new `Schedule` tab. Mirror the `jobs/[id]/page.tsx` `Tabs` shape:
```tsx
// inside the component, replacing the bare <ReportView /> render:
<Tabs defaultValue="report">
  <TabsList>
    <TabsTrigger value="report">Report</TabsTrigger>
    <TabsTrigger value="schedule">Schedule</TabsTrigger>
  </TabsList>
  <TabsContent value="report">{/* existing ReportView */}</TabsContent>
  <TabsContent value="schedule"><SchedulePanel applicationId={appId} /></TabsContent>
</Tabs>
```
  (`appId` comes from the existing `useParams<{ id: string; appId: string }>()`. If a Messaging tab already added `Tabs`, just add the `Schedule` `TabsTrigger`/`TabsContent`.)
- [ ] **Step 2: `SchedulePanel({ applicationId })`** — `frontend/apps/company/components/schedule-panel.tsx`. `"use client"`. Reads `getSchedule` first (`createSchedulingClient(api)` via `useMemo`). Branches:
  - **Gate awareness:** if `proposeSlots` returns `INVALID_ARGUMENT` (application not `interview_pending`/`shortlisted`), surface `Alert tone="info"` "This candidate isn’t ready for a live interview yet (they must pass the automated screen)." rather than a raw error.
  - **Propose form** (no `open` proposal, or after reschedule): up to `MAX_SLOTS=10` rows of a **`datetime-local` `Input`** + a duration `Select` (15/30/45/60/90), a `location` `Input`, a `note` `Textarea`. On submit **convert each local input via `localInputToUtcIso`** (the client never sends local time), call `propose`/`reschedule`, `toast.success`, `invalidateQueries(scheduleQueryKey)`. Client guard: ≥1 slot, each future, `location`/`note` within caps (server stays authoritative).
  - **Current booking view** (`booked`): "Booked for {formatLocal(chosenStartAt)}" + `location` + "Add to calendar" (`getIcs`), a **"Reschedule"** (re-opens the propose form), a **"Cancel"** `ConfirmDialog` → `cancel` (notifies the candidate).
  - states: `LoadingState`/`ErrorState`/`EmptyState`.
```tsx
"use client";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { Card, CardContent, Field, Input, Textarea, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Button, Alert, ConfirmDialog, LoadingState, ErrorState, toast } from "@ip/ui";
import { createSchedulingClient, errorMessage, formatLocal, localInputToUtcIso, isCode, Code } from "@ip/shared";

const DURATIONS = [15, 30, 45, 60, 90];

export function SchedulePanel({ applicationId }: { applicationId: string }) {
  const { api } = useAuth();
  const qc = useQueryClient();
  const sched = useMemo(() => createSchedulingClient(api), [api]);
  const [rows, setRows] = useState<{ local: string; duration: number }[]>([{ local: "", duration: 60 }]);
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const q = useQuery({ queryKey: sched.scheduleQueryKey(applicationId), queryFn: () => sched.getSchedule(applicationId), refetchInterval: 15_000, refetchIntervalInBackground: false });
  const propose = useMutation({
    mutationFn: () => {
      const slots = rows.filter((r) => r.local).map((r) => ({ startAt: localInputToUtcIso(r.local), durationMinutes: r.duration }));
      const isReschedule = q.data?.status === "booked";
      return isReschedule ? sched.reschedule(applicationId, slots, location, note) : sched.propose(applicationId, slots, location, note);
    },
    onSuccess: () => { toast.success("Times proposed"); qc.invalidateQueries({ queryKey: sched.scheduleQueryKey(applicationId) }); },
    onError: (err) => isCode(err, Code.InvalidArgument)
      ? undefined  // surfaced as the gate Alert below via q/err inspection
      : toast.error(errorMessage(err)),
  });
  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} retry={() => q.refetch()} />;
  if (propose.isError && isCode(propose.error, Code.InvalidArgument))
    return <Alert tone="info" title="Not ready for a live interview">This candidate isn’t ready yet — they must pass the automated screen first.</Alert>;
  const booked = q.data?.status === "booked";
  return (
    <div className="flex flex-col gap-4">
      {booked && (
        <Card><CardContent className="flex flex-col gap-3">
          <p className="font-display font-semibold">Booked for {q.data && formatLocal(q.data.chosenStartAt)}</p>
          {q.data?.location && <p className="text-sm">{q.data.location}</p>}
          <div className="flex gap-3">
            <Button variant="outline" onClick={async () => { const { content, filename } = await sched.getIcs(applicationId); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content], { type: "text/calendar" })); a.download = filename; a.click(); }}>Add to calendar</Button>
            <ConfirmDialog trigger={<Button variant="outline">Cancel</Button>} title="Cancel this interview?" onConfirm={() => sched.cancel(applicationId).then(() => qc.invalidateQueries({ queryKey: sched.scheduleQueryKey(applicationId) }))} />
          </div>
        </CardContent></Card>
      )}
      <Card><CardContent className="flex flex-col gap-3">
        <p className="font-display font-semibold">{booked ? "Reschedule — propose new times" : "Propose interview times"}</p>
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <Input type="datetime-local" value={r.local} onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, local: e.target.value } : x))} />
            <Select value={String(r.duration)} onValueChange={(v) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, duration: Number(v) } : x))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{DURATIONS.map((d) => <SelectItem key={d} value={String(d)}>{d} min</SelectItem>)}</SelectContent>
            </Select>
          </div>
        ))}
        {rows.length < 10 && <Button variant="ghost" size="sm" className="self-start" onClick={() => setRows((rs) => [...rs, { local: "", duration: 60 }])}>Add another time</Button>}
        <Field label="Location / link"><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Google Meet / office address" /></Field>
        <Field label="Note (optional)"><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <Button loading={propose.isPending} disabled={!rows.some((r) => r.local)} onClick={() => propose.mutate()} className="self-start">Propose times</Button>
      </CardContent></Card>
    </div>
  );
}
```
- [ ] **Step 3: Verify build + preview** — `NEXT_PUBLIC_MOCK=1 npx pnpm@9.15.0 --filter @ip/company build` clean; preview: open an applicant at `interview_pending` → Schedule tab → propose 3 times (entered in the recruiter's local zone) → they appear on the candidate's `/schedule?application=<id>` **in the candidate's zone** → candidate picks → the recruiter tab shows `booked` within one poll; reschedule → candidate re-picks; cancel → the other side is notified. Screenshot.
- [ ] **Step 4: Commit** — `git commit -am "feat(scheduling): company Schedule tab (propose/booked/reschedule/cancel)"`

### Task 6: Final verify

- [ ] **Step 1:** `npx pnpm@9.15.0 --filter @ip/candidate build` + `--filter @ip/company build` + `--filter @ip/{ui,shared,api-client} typecheck` all green (`@ip/ui` typechecks even though untouched — proves no accidental coupling).
- [ ] **Step 2:** Confirm **UTC discipline**: grep the propose form — every slot goes through `localInputToUtcIso` before the call; the wire carries `...Z` ISO. Confirm the `ALREADY_EXISTS` lost-pick path surfaces the friendly "that time was just taken" refetch, not a hard error.
- [ ] **Step 3: Commit** — `git commit -am "chore(scheduling): verify both builds + typechecks green"`

---

## C. States & acceptance

- **States (both surfaces):** loading (`LoadingState`), empty (`EmptyState` — "No interview scheduled"), error (`ErrorState` + retry), success. Candidate branches on booking status (`proposed`→pick / `booked`→confirm+ICS+cancel / `cancelled`→warning / `completed`→neutral); the company panel adds the **propose/reschedule form** + the **not-ready gate** `Alert` (when the app isn't `interview_pending`/`shortlisted`).
- **Double-booking CAS:** a lost pick (`ChooseSlot` → `ALREADY_EXISTS`) surfaces as `toast.error("That time was just taken — here are the current options")` + a refetch (the current proposal/booking renders) — never a hard error; the booking stays the first pick. A non-offered `start_at` is rejected `INVALID_ARGUMENT` **before** any CAS write.
- **UTC discipline (the whole point):** every persisted instant is UTC; the viewer's zone is applied **only** at render via `@ip/shared/datetime.ts` (`formatLocal`); the propose form converts local→UTC via `localInputToUtcIso` **before** the gRPC call; the wire carries `...Z` ISO strings. A unit test with a fixed `TZ` locks the boundary.
- **Funnel untouched:** scheduling writes **no** funnel state — the booking has its own status + `version` CAS; the gate only reads `state`. The AI funnel/interview regression stays green.
- **Responsive:** the candidate slot list + the recruiter propose rows stack on mobile. **Dark mode:** tokens only — automatic.
- **A11y:** the candidate slot list is a labelled `RadioGroup` inside `role="status" aria-live="polite"` (a newly-polled proposal is announced); the propose form fields use `Field`'s `<Label htmlFor>`; the "times shown in {zone}" caption sets expectations; `ConfirmDialog` gates cancel; decorative lucide icons `aria-hidden`.
- **Acceptance:** matches the `aptura_interview_scheduling` mockup; the full **propose (recruiter zone) → pick (candidate zone) → `booked` + an `.ics` that opens at the right local time → reschedule → cancel** loop works against the mock today and against `SchedulingService` once the proto regenerates (flip `NEXT_PUBLIC_MOCK`, no component change); both app builds + all four typechecks green.
