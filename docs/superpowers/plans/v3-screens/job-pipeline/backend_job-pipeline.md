# Backend — `job-pipeline` (Midnight v3)

> **Screen:** Applicants pipeline + advisory gate · **FE consumer:** [`frontend_job-pipeline.md`](./frontend_job-pipeline.md)
> **Status:** **EXISTING — reuse v2** (mostly existing RPCs; the `assessment_review` state + `gate_mode` are the v2 EXTENDs). Restated from [`../../v2-screens/applicants-pipeline.md`](../../v2-screens/applicants-pipeline.md) §A. **The Midnight redesign is appearance-only — no proto delta beyond what v2 already planned.**
> **Real-vs-mock today:** `ListApplicants`, `DecideApplication`, `OverrideGate`, `GetJobRankedCandidates` are **live**. The advisory branch (`ApplicationState.assessment_review`) + per-job `gate_mode` (+ `UpdateJob` carrying it) land via v2's EXTEND; the FE compiles against them via an optional-chain (`job.data?.aptitudeConfig?.gateMode ?? "auto"`) before `pnpm gen`.

## Functionalities
- **List applicants** for a job — funnel-state rows (incl. `assessment_review`).
- **Rank candidates** — AI match order with reasons.
- **Decide** on an applicant — shortlist / hire / reject (audited, notifies the candidate).
- **Advance a held/gated applicant** — `OverrideGate` (advisory queue → interview).
- **Batch decide** — fan-out `DecideApplication` over a selection (no new RPC).
- **Set the per-job gate mode** — `auto | advisory` (create + `UpdateJob` + `GetJob` echo).
- Score distribution + reports panels read existing per-job aggregates.

## Service & RPCs (`admin.*` gRPC-web). All **bearer, manager + comp-scoped** — `comp_id` from the **token, never the request**.
| Function | RPC | Status | Notes |
|---|---|---|---|
| List applicants | `Application.ListApplicants({ jobId }) → { applications: ApplicationResponse[] }` | EXISTING | `state` includes new `assessment_review` for advisory jobs |
| Rank candidates | `Recommendation.GetJobRankedCandidates({ jobId }) → { matches: { candidateUserId, score, reasons[] }[] }` | EXISTING | AI match order |
| Decide | `Decision.DecideApplication({ applicationId, outcome }) → ...` | EXISTING | `outcome ∈ {shortlisted,hired,rejected}`; audited; **notifies candidate** |
| Advance / override | `Decision.OverrideGate({ applicationId }) → ...` | EXISTING | advances held/gated; audited |
| Get job (gate seed) | `Job.GetJob(...) → { ..., aptitudeConfig: { gateMode } }` | EXISTING (echoes new field) | seeds the Settings control |
| Update gate mode | `Job.UpdateJob({ jobId, gateMode }) → JobResponse` | **NEW (v2)** | 404 if job not in caller's comp |

## Request / Response structures (camelCase per protobuf-es)
- **`ListApplicants`** — req `{ jobId }`; resp `{ applications: ApplicationResponse[] }`, `ApplicationResponse { applicationId, candidateUserId, state, ... }`. `state` is the funnel state string, incl. `"assessment_review"`.
- **`GetJobRankedCandidates`** — req `{ jobId }`; resp `{ matches: { candidateUserId, score: number, reasons: string[] }[] }`.
- **`DecideApplication`** — req `{ applicationId, outcome: "shortlisted"|"hired"|"rejected" }`; batch = `Promise.allSettled` fan-out per id.
- **`OverrideGate`** — req `{ applicationId }`.
- **`UpdateJob` (gate)** — req `{ jobId, gateMode: "auto"|"advisory" }`; resp `JobResponse` (carries `aptitudeConfig.gateMode`). `GetJob` echoes `aptitudeConfig.gateMode`.
- **FE mock shape** (`frontend/apps/company/app/jobs/[id]/pipeline-types.ts`):
  ```ts
  export type GateMode = "auto" | "advisory";
  export interface ApplicantRow { applicationId: string; candidateUserId: string; state: string; }
  export interface BatchOutcome { applicationIds: string[]; outcome: "shortlisted"|"hired"|"rejected"; }
  ```
  No mock **client** is needed — `ListApplicants`/`OverrideGate`/`DecideApplication` exist. The only mock surface is `gate_mode` on the job: the optional-chain seed (`?? "auto"`) compiles before the field exists and binds to the real value after regen.

## `assessment_review` semantics (v2 EXTEND, restated)
- New non-terminal `ApplicationState.assessment_review` — a **post-grade human hold** (not terminal, not a decision, not in the retry set). The candidate sees **"Under review"** (shared `applicationStatus` token, `warning` tone).
- `funnel.next_state`: when `gate_mode == "advisory"`, `aptitude_pending --aptitude.graded--> assessment_review` for **both** pass and fail (no auto-advance, no auto-reject). Exits: `gate.override → interview_pending`, `recruiter.decision(rejected) → rejected`; edge exits (`withdrawn`/`expired`) already work (non-terminal).
- `grade_aptitude` puts `gate_mode` on the `aptitude.graded` payload (no second job read).
- **Behavior preservation:** `auto` (default) is byte-for-byte today's funnel; the advisory branch is additive + default-off. The FE's **Advance** = existing `OverrideGate`; **Decline** = existing `DecideApplication(rejected)` — no new RPC.

## Data required
- **Mongo `applications`** (comp-scoped, by `job_id`): applicant rows + funnel `state`; the audit/state-history backs Advance/Decline exits.
- **Mongo `jobs`**: `aptitude_config.gate_mode` (`auto|advisory`, default `auto`; proto3 missing-scalar `"" → "auto"`, no backfill).
- Ranking aggregate (existing), score-distribution + reports aggregates (existing).

## Errors & edge cases
- `PERMISSION_DENIED` — non-manager / cross-tenant.
- `NOT_FOUND` — `UpdateJob` on a job not owned by the caller's comp.
- `UNAVAILABLE` / partial batch — `Promise.allSettled` surfaces a failed-count toast (no silent drop); each decision is independent + idempotent.
- **Empty:** no applicants → `EmptyState`; legacy/`auto` jobs never produce `assessment_review` rows (the advisory cluster is never rendered).

## Cross-references
- Restates: [`../../v2-screens/applicants-pipeline.md`](../../v2-screens/applicants-pipeline.md) §A (the `assessment_review` funnel branch + `gate_mode` + batch fan-out).
- Shared enum: `ApplicationState` (`assessment_review`, terminal set) — one source via `applicationStatus`/`StatusPill`.
- Shared event: `aptitude.graded` (carries `gate_mode`).
- Sibling pages: [`post-a-job`](../post-a-job/backend_post-a-job.md) (sets `gate_mode`), [`applicant-report`](../applicant-report/backend_applicant-report.md) (`Report.GetIntegrityTimeline`), [`recruiter-dashboard`](../recruiter-dashboard/backend_recruiter-dashboard.md) (needs-decision queue reuses these decision RPCs).
