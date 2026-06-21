# Job pipeline — Backend contract (v3 · frozen)

> **Screen.** `/company/jobs/[id]` (Pipeline / Ranked / Reports / Scores / Settings tabs).
> **FE consumer:** [`frontend_job-pipeline.md`](./frontend_job-pipeline.md).
> **Status:** **EXISTING — reuse v2** (mostly existing RPCs; the `assessment_review` state +
> `gate_mode` are the v2 EXTENDs). Restated from
> [`../../v2-screens/applicants-pipeline.md`](../../v2-screens/applicants-pipeline.md) §A. **The
> Aperture Pro v3 redesign is appearance-only — no proto delta beyond what v2 already planned.**
> **Anti-fiction reminder:** The kanban renders only what `ListApplicants` returns. Empty
> pipeline shows truthful copy ("No applicants yet — share the role link") — never seeded with
> fake applicants. The integrity pill on each card reads the **server-authoritative** severity
> (`severity_of()`); the FE never invents a severity. See the anti-fiction rule in
> [`_design-language.md`](../_design-language.md).
> **Real-vs-mock today:** `ListApplicants`, `DecideApplication`, `OverrideGate`,
> `GetJobRankedCandidates` are **live**. The advisory branch (`ApplicationState.assessment_review`)
> + per-job `gate_mode` (+ `UpdateJob` carrying it) land via v2's EXTEND; the FE compiles against
> them via an optional-chain (`job.data?.aptitudeConfig?.gateMode ?? "auto"`) before `pnpm gen`.

## Functionalities

- **List applicants** for a job — funnel-state rows (incl. `assessment_review`).
- **Rank candidates** — AI match order with reasons.
- **Decide** on an applicant — shortlist / hire / reject (audited, notifies the candidate).
- **Advance** a held / gated applicant — `OverrideGate` (advisory queue → interview).
- **Batch decide** — fan-out `DecideApplication` over a selection (no new RPC).
- **Drag-to-move stage** — pure UI sugar on top of `DecideApplication` / `OverrideGate`. No
  new RPC, no new ordering field. The backend's funnel state remains the source of truth.
- **Set the per-job gate mode** — `auto | advisory` (create + `UpdateJob` + `GetJob` echo).
- Score distribution + reports panels read existing per-job aggregates.

## Service & RPCs (`admin.*` gRPC-web)

All **bearer, manager + comp-scoped** — `comp_id` from the **token, never the request**.

| Function | RPC | Status | Notes |
|---|---|---|---|
| List applicants | `Application.ListApplicants({ jobId }) → { applications: ApplicationResponse[] }` | EXISTING | `state` includes `assessment_review` for advisory jobs |
| Rank candidates | `Recommendation.GetJobRankedCandidates({ jobId }) → { matches: { candidateUserId, score, reasons[] }[] }` | EXISTING | AI match order; FE keys by `candidateUserId` |
| Decide | `Decision.DecideApplication({ applicationId, outcome }) → ...` | EXISTING | `outcome ∈ {shortlisted,hired,rejected}`; audited; **notifies candidate** |
| Advance / override | `Decision.OverrideGate({ applicationId }) → ...` | EXISTING | advances held / gated; audited |
| Get job (gate seed) | `Job.GetJob(...) → { ..., aptitudeConfig: { gateMode } }` | EXISTING (echoes new field) | seeds the Settings tile |
| Update gate mode | `Job.UpdateJob({ jobId, gateMode }) → JobResponse` | **NEW (v2)** | 404 if job not in caller's comp |

## Request / Response structures (camelCase per protobuf-es)

- **`ListApplicants`** — req `{ jobId }`; resp `{ applications: ApplicationResponse[] }`,
  `ApplicationResponse { applicationId, candidateUserId, state, ... }`. `state` is the funnel
  state string, incl. `"assessment_review"`.
- **`GetJobRankedCandidates`** — req `{ jobId }`; resp
  `{ matches: { candidateUserId, score: number, reasons: string[] }[] }`. FE builds a
  `Map<candidateUserId, score>` to label each kanban card with a mono `.pct`.
- **`DecideApplication`** — req
  `{ applicationId, outcome: "shortlisted"|"hired"|"rejected" }`; batch = `Promise.allSettled`
  fan-out per id (no new RPC, no transaction promise).
- **`OverrideGate`** — req `{ applicationId }`.
- **`UpdateJob` (gate)** — req `{ jobId, gateMode: "auto"|"advisory" }`; resp `JobResponse`
  (carries `aptitudeConfig.gateMode`). `GetJob` echoes `aptitudeConfig.gateMode`.
- **FE mock shape** (`frontend/apps/company/app/jobs/[id]/pipeline-types.ts`):
  ```ts
  export type GateMode = "auto" | "advisory";
  export interface ApplicantRow { applicationId: string; candidateUserId: string; state: string; }
  export interface BatchOutcome { applicationIds: string[]; outcome: "shortlisted"|"hired"|"rejected"; }
  ```
  No mock **client** is needed — `ListApplicants` / `OverrideGate` / `DecideApplication` exist.
  The only mock surface is `gate_mode` on the job: the optional-chain seed (`?? "auto"`)
  compiles before the field exists and binds to the real value after regen.

## `assessment_review` semantics (v2 EXTEND, restated)

- New non-terminal `ApplicationState.assessment_review` — a **post-grade human hold** (not
  terminal, not a decision, not in the retry set). The candidate sees **"Under review"**
  (shared `applicationStatus` token, `warning` tone).
- `funnel.next_state`: when `gate_mode == "advisory"`, `aptitude_pending --aptitude.graded-->
  assessment_review` for **both** pass and fail (no auto-advance, no auto-reject). Exits:
  `gate.override → interview_pending`, `recruiter.decision(rejected) → rejected`; edge exits
  (`withdrawn` / `expired`) already work (non-terminal).
- `grade_aptitude` puts `gate_mode` on the `aptitude.graded` payload (no second job read).
- **Behavior preservation:** `auto` (default) is byte-for-byte today's funnel; the advisory
  branch is additive + default-off. The FE's **Advance** = existing `OverrideGate`; **Decline**
  = existing `DecideApplication(rejected)` — no new RPC.

## Drag-to-move stage — mapping to existing RPCs

Drop target → RPC fired (no new endpoint, no ordering metadata persisted):

| Target lane | Source state(s) | RPC |
|---|---|---|
| **Interview pending** | `assessment_review` | `Decision.OverrideGate({ applicationId })` |
| **Shortlisted** | any `decidable` state | `Decision.DecideApplication({ applicationId, outcome: "shortlisted" })` |
| **Rejected** | any `decidable` state | `Decision.DecideApplication({ applicationId, outcome: "rejected" })` |
| any other lane | — | drop invalid; card snaps back; no RPC |

`decidable = {scored, shortlisted, assessment_review}` (matches `lib/selection.ts`
`selectableIds`).

## Data required

- **Mongo `applications`** (comp-scoped, by `job_id`): applicant rows + funnel `state`; the
  audit / state-history backs Advance / Decline exits.
- **Mongo `jobs`**: `aptitude_config.gate_mode` (`auto|advisory`, default `auto`; proto3
  missing-scalar `"" → "auto"`, no backfill).
- Ranking aggregate (existing), score-distribution + reports aggregates (existing).

## Errors & edge cases

- `PERMISSION_DENIED` — non-manager / cross-tenant.
- `NOT_FOUND` — `UpdateJob` on a job not owned by the caller's comp.
- `UNAVAILABLE` / partial batch — `Promise.allSettled` surfaces a failed-count toast (no
  silent drop); each decision is independent + idempotent.
- **Empty.** No applicants → truthful `EmptyState` "No applicants yet — share the role link"
  (the kanban renders all 6 lanes empty rather than collapsing). Legacy / `auto` jobs never
  produce `assessment_review` rows (the advisory lane stays empty by design).

## Cross-references

- Restates: [`../../v2-screens/applicants-pipeline.md`](../../v2-screens/applicants-pipeline.md)
  §A (the `assessment_review` funnel branch + `gate_mode` + batch fan-out).
- Shared enum: `ApplicationState` (`assessment_review`, terminal set) — one source via
  `applicationStatus` / `StatusPill`.
- Shared event: `aptitude.graded` (carries `gate_mode`).
- Sibling pages: [`post-a-job`](../post-a-job/backend_post-a-job.md) (sets `gate_mode`),
  [`applicant-report`](../applicant-report/backend_applicant-report.md)
  (`Report.GetIntegrityTimeline`),
  [`recruiter-dashboard`](../recruiter-dashboard/backend_recruiter-dashboard.md) (needs-decision
  queue reuses these decision RPCs).
- Design language: [`../_design-language.md`](../_design-language.md).
- Demo to match: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
