# Candidate dashboard — Backend contract (v3 · frozen)

> **Screen.** Signed-in candidate dashboard / application tracker. **FE consumer:** [`frontend_candidate-dashboard.md`](./frontend_candidate-dashboard.md).
> **Status:** `EXISTING — reuse v2` · no proto delta, no new RPC, no new collections, no new events.
> **Real-vs-mock today:** `ApplicationService` + `RecommendationService` are **real** (built; gRPC-web over `admin`). The v3 work is a **complete UI rebuild** (Aperture Pro design language) — the backend contract documented here is **frozen**; reuse every existing RPC and field exactly.
> **Anti-fiction reminder:** Aptura is pre-launch. Empty / fallback states must use truthful copy ("Sample employer", `Job {jobId}` fallback) — never fabricated company names. See the anti-fiction rule in [`_design-language.md`](../_design-language.md).

## Functionalities (what the backend provides for this page)

- **List** the caller's applications (with funnel `state`) for the tracker.
- **Apply** to a job (existing apply form).
- **Withdraw** an application (existing confirm flow).
- **Get** the caller's recommended roles (for the recommendations cell).
- *(First-run only)* surface onboarding state — see `../v2-screens/onboarding.md`; not required for the tracker render.

## Service & RPCs (gRPC-web; `admin`, candidate-scoped — subject from bearer token)

| Function | RPC | Auth/scope |
|---|---|---|
| List my applications | `api.applications.listMyApplications({})` → `{ applications: Application[] }` | bearer, candidate; own only |
| Apply | `api.applications.apply({ jobId, consent })` → ack | bearer, candidate |
| Withdraw | `api.applications.withdrawApplication({ applicationId })` → ack | bearer, candidate; own only |
| Recommendations | `api.recommendations.getCandidateRecommendations({})` → `{ matches: Match[] }` | bearer, candidate; own only |

> **No new RPC.** The funnel position, the 4 KPI tiles, the "up next" interview pick, and the recent-activity rows are all **pure functions of the existing `Application[]`** (computed in the FE). Optional EXTEND (render-if-present, **not required**): embed `jobTitle` + `companyName` on each `Application` so rows show the role/company; absent → FE falls back to `Job {jobId}`.

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

- **FE mock shape:** none new — binds to the **existing** `api.applications.*` / `api.recommendations.*` (real today). The rebuild codes against the same shapes; nothing to mock.

## Data required

- **Read:** the applications collection (caller-scoped: `applicationId`, `jobId`, `state`; optional `jobTitle` / `companyName` join); the recommendation projection (`jobId`, `score`, `reasons`).
- **Derived (FE, no backend):** KPI counts (apps in flight = non-terminal count; interviews scheduled = `interview_pending` count; responses = `scored` + `shortlisted` count; total submitted = lifetime count), funnel step index (`funnelStage(state)`), next-interview pick for "up next", recent-activity rows.
- **Indexes:** none new (existing application/recommendation indexes suffice).

## Errors & edge cases

- **Auth:** missing/invalid bearer → `UNAUTHENTICATED`; non-candidate role → `PERMISSION_DENIED`.
- **Empty:** no applications → FE empty branch (`.cell-empty` + inline apply form); no recommendations → cell renders its own empty copy ("We'll line these up once you've applied."). `UNAVAILABLE` / transport error → FE `ErrorState` + retry inside the anchor cell.
- **Apply:** duplicate/closed job handled by the existing servicer (`FAILED_PRECONDITION` / `NOT_FOUND`) — FE toasts; unchanged.
- **The 10s poll** is the live tracker; idles once every app state ∈ `TERMINAL_STATES` (`{withdrawn, hired, rejected, expired, abandoned}`). The FE `.status` pill mirrors this gate.

## Cross-references

- Restates: v2 `../v2-screens/candidate-dashboard.md` (+ `../v2-screens/onboarding.md` for first-run).
- Shared enum: `ApplicationState` (the funnel `state` vocabulary) + `TERMINAL_STATES` (`{withdrawn, hired, rejected, expired, abandoned}`); `gated_out` is a stop but **not** terminal.
- Sibling screens that consume the same data shapes: [`../jobs-list/backend_jobs-list.md`](../jobs-list/backend_jobs-list.md) (applications history), [`../marketplace-search/backend_marketplace-search.md`](../marketplace-search/backend_marketplace-search.md) (job navigation target).
- Design language: [`../_design-language.md`](../_design-language.md). Reference demo: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
