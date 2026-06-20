# Backend — Candidate dashboard

> **Screen:** Signed-in candidate dashboard / application tracker.
> **FE consumer:** `frontend_candidate-dashboard.md`.
> **Status:** **EXISTING — reuse v2.** Source: `../v2-screens/candidate-dashboard.md` (+ first-run
> `../v2-screens/onboarding.md`). The v3 work is an **appearance-only reskin** — no proto delta, no new RPC.
> **Real-vs-mock today:** `ApplicationService` + `RecommendationService` are **real** (built; gRPC-web over
> `admin`). The funnel + KPI strip + up-next are **derived client-side** from existing data — no backend change.

## Functionalities (what the backend must provide for this page)
- **List** the caller's applications (with funnel `state`) for the tracker.
- **Apply** to a job (existing apply form).
- **Withdraw** an application (existing confirm flow).
- **Get** the caller's recommended roles (for the recommendations column).
- *(First-run only)* surface onboarding state — see `../v2-screens/onboarding.md`; not required for the tracker render.

## Service & RPCs (gRPC-web; `admin`, candidate-scoped — subject from bearer token)
| Function | RPC | Auth/scope |
|---|---|---|
| List my applications | `api.applications.listMyApplications({})` → `{ applications: Application[] }` | bearer, candidate; own only |
| Apply | `api.applications.apply({ jobId, consent })` → ack | bearer, candidate |
| Withdraw | `api.applications.withdrawApplication({ applicationId })` → ack | bearer, candidate; own only |
| Recommendations | `api.recommendations.getCandidateRecommendations({})` → `{ matches: Match[] }` | bearer, candidate; own only |

> **No new RPC.** The funnel position, the 4 KPI tiles, and the "up next" interview panel are all **pure functions of
> the existing `Application[]`** (computed in the FE). Optional EXTEND (render-if-present, **not required**): embed
> `jobTitle` + `companyName` on each `Application` so rows show the role name instead of `Job {jobId}`.

## Request / Response structures (camelCase per protobuf-es on the FE)
```ts
// applications.listMyApplications({}) →
interface Application {
  applicationId: string;
  jobId: string;
  state: string;          // funnel vocabulary (code-verified): applied | aptitude_pending | gated_out |
                          // interview_pending | interview_in_progress | interviewed | scored | shortlisted |
                          // hired | rejected | withdrawn | expired | abandoned
  jobTitle?: string;      // optional EXTEND — render-if-present
  companyName?: string;   // optional EXTEND — render-if-present
}
interface ListMyApplicationsResponse { applications: Application[] }

// applications.apply({ jobId: string, consent: boolean }) → ack (invalidates ["applications"] + ["recommendations"])
// applications.withdrawApplication({ applicationId: string }) → ack (same invalidations)

// recommendations.getCandidateRecommendations({}) →
interface Match { jobId: string; score: number; reasons: string[] }
interface GetCandidateRecommendationsResponse { matches: Match[] }
```
- **FE mock shape:** none new — binds to the **existing** `api.applications.*` / `api.recommendations.*` (real today).
  The reskin codes against the same shapes; nothing to mock.

## Data required
- **Read:** the applications collection (caller-scoped: `applicationId`, `jobId`, `state`; optional `jobTitle`/`companyName`
  join); the recommendation projection (`jobId`, `score`, `reasons`).
- **Derived (FE, no backend):** KPI counts (apps in flight = non-terminal count, interviews scheduled, responses,
  avg response time as available), funnel step index (`funnelStage(state)`), next-interview pick for "up next".
- **Indexes:** none new (existing application/recommendation indexes suffice).

## Errors & edge cases
- **Auth:** missing/invalid bearer → `UNAUTHENTICATED`; non-candidate role → `PERMISSION_DENIED`.
- **Empty:** no applications → FE empty state ("No applications yet" → apply form); no recommendations → `RecommendedRoles`
  own empty. `UNAVAILABLE`/transport error → FE `ErrorState` + retry.
- **Apply:** duplicate/closed job handled by the existing servicer (`FAILED_PRECONDITION`/`NOT_FOUND`) — FE toasts; unchanged.
- **The 10s poll** is the live tracker; idles once every app state ∈ `TERMINAL_STATES`.

## Cross-references
- Restates `../v2-screens/candidate-dashboard.md` (+ `../v2-screens/onboarding.md` for first-run).
- Shared enum: `ApplicationState` (the funnel `state` vocabulary) + `TERMINAL_STATES`
  (`{withdrawn, hired, rejected, expired, abandoned}`) — `gated_out` is a stop but not terminal.
