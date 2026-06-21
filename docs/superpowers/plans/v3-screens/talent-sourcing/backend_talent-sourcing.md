# Talent sourcing — Backend contract (v3 · frozen)

> **Screen.** `/company/talent` talent pool + candidate search. **FE consumer:** [`frontend_talent-sourcing.md`](./frontend_talent-sourcing.md).
> **Status:** **EXISTING — reuse v2.** Restated from [`../../v2-screens/talent-sourcing.md`](../../v2-screens/talent-sourcing.md)
> §A (`SourcingService.SearchCandidates` over own-company applicants). The Aperture Pro v3
> redesign is **appearance-only** — no proto delta, no new collection, no new endpoint beyond the
> v2 contract.
> **Anti-fiction reminder:** Aptura is pre-launch. The page renders only what these RPCs truly
> return. Empty data shows truthful empties ("No applicants yet", "No candidates match") — never
> fabricated candidates, never a global candidate index, never claimed integrations the product
> does not have. See the anti-fiction rule in [`_design-language.md`](../_design-language.md).
> **Real-vs-mock today:** `Talent.GetTalentPool` (the empty-query default view) is **live**.
> `Sourcing.SearchCandidates` is the v2 delta — the FE codes against `sourcing-client.ts`
> (`makeMockSourcingClient`, `USE_MOCK_SOURCING`) until it lands.

**Privacy note (carried into the contract).** The response carries **no ID / background /
biometric fields** — only the human-in-the-loop subset (masked handle, application count to this
company, fit score, furthest stage reached, matched skills). Candidate-data scope is the general
recruiting profile only. The search universe is the company's **own applicants only**; there is no
global candidate index path in this product.

## Functionalities

- **List / browse** the company's full talent pool (default, no-query view) — masked handles +
  application counts.
- **Search** the company's **own applicants only** by keyword, with optional stage + min-score
  filters; return ranked hits with a **fit score**, the furthest funnel stage reached, and the
  matched-skill chips.

## Service & RPCs

`admin.talent.v1.TalentService` · `admin.sourcing.v1.SourcingService` (gRPC-web). All
**bearer-auth, manager-scoped** (`company_admin` / `recruiter`); `comp_id` derived from the
**token, never the request**.

| Function | RPC | Status | Auth / scope |
|---|---|---|---|
| Get talent pool | `TalentService.GetTalentPool({})` → `{ entries: { candidateUserId, applicationCount }[] }` | EXISTING | manager + comp-scoped, read-only |
| Search candidates | `SourcingService.SearchCandidates({ query, stage?, minScore?, page?, pageSize? })` → `{ hits, total, page, pageSize }` | **NEW v2 RPC** (mock today) | manager + comp-scoped; `pageSize` clamped ≤50 |

- **`comp_id` is from the token, never the request.** The candidate set = **every candidate with
  an application to ANY job owned by this `comp_id`** (the same seed set `resources/talent.py`
  builds for `GetTalentPool`). There is **no global candidate index** path.

## Request / Response structures (camelCase per protobuf-es on the FE)

- **`GetTalentPool`** — req `{}` (comp from token); resp
  `{ entries: { candidateUserId: string /*masked handle on the wire*/, applicationCount: bigint }[] }`.
  The FE widens `applicationCount` with `Number(...)` and slices the masked handle to
  `slice(0,12) + "…"` for display.
- **`SearchCandidates`** — req
  `{ query /*keyword over profile/skills/experience text*/, stage /*optional funnel filter; "" = any*/,
    minScore /*0..1 fit floor; 0 = any*/, page, pageSize /*≤50*/ }`; resp
  `{ hits: { candidateUserId: string, applicationCount: bigint, fitScore: number /*0..1*/,
            topStage: string /*ApplicationState*/, matchedSkills: string[] }[],
     total: bigint, page: number, pageSize: number }`.
- **FE mock shape** (`apps/company/app/talent/sourcing-types.ts`) — what the search codes against
  before the RPC lands:
  ```ts
  export interface CandidateHitDTO {
    candidateUserId: string;
    applicationCount: number;
    fitScore: number;          // 0..1
    topStage: string;          // ApplicationState
    matchedSkills: string[];
  }
  export interface SearchCandidatesResult {
    hits: CandidateHitDTO[];
    total: number;
    page: number;
    pageSize: number;
  }
  export interface SearchCandidatesParams {
    query: string;
    stage?: string;
    minScore?: number;
    page?: number;
    pageSize?: number;
  }
  ```
  The page binds to a small `sourcing-client.ts` interface (`searchCandidates`);
  `makeMockSourcingClient()` returns ranked fixtures with realistic-shaped (but clearly sample)
  data. The real binding is `api.sourcing.searchCandidates(p)` after `pnpm gen`. The empty-query
  pool view binds directly to the already-generated `api.talent.getTalentPool` — no mock needed
  there.

## Data required

- **Reads** the `applications` repo (seed candidate ids scoped to the token's `comp_id`) joined to
  the talent/profile repo for the skill/experience text the keyword match runs over. **No new
  collection** — reuses `applications` + profile data.
- **Derived:** `fitScore` = keyword/score relevance over the candidate's profile + skills +
  experience text; `topStage` = furthest funnel state across the candidate's applications to this
  company; `matchedSkills` = skills that matched the query.
- **Search-universe invariants (each a BE test):**
  (a) a candidate of another company **never appears**;
  (b) a `rejected` applicant **still surfaces** (universe = application-existence, not current
      funnel state);
  (c) an applicant to a `closed`/`paused` job **still surfaces**;
  (d) a candidate who never applied here is **unreachable**.

## Errors & edge cases

- **Empty `query`** → the FE does not call search (`enabled: query.length > 0`); the live pool
  renders. Server-side, an empty query may return a bounded set or `INVALID_ARGUMENT` per the
  contract — the FE never hits this path.
- **No matches** → `200` with `hits: []` → FE truthful empty "No candidates match — try a broader
  keyword or a different stage."
- **No applicants at all** → pool returns `entries: []` → FE truthful empty "No applicants yet —
  candidates will show up here as they apply to your jobs."
- **Forged / mismatched tenant `comp_id`** → never leaks another company's applicants; comp-scoping
  is enforced server-side (`PERMISSION_DENIED` or scoped-empty).
- **`UNAVAILABLE` / transient** → the pool retains its `ErrorState` + retry; the search query
  surfaces the error inline in the results region.
- **`pageSize` over the cap** → clamped to ≤50 server-side; the FE never relies on the request
  being honored verbatim.
- **No global search.** The contract does NOT support a global candidate index. The UI must not
  ship affordances that imply it does.

## Cross-references

- Restates: [`../../v2-screens/talent-sourcing.md`](../../v2-screens/talent-sourcing.md) §A
  (`SourcingService`, the search universe, the no-sensitive-data rule).
- Pillar: job-marketplace (Task 12 — `SearchCandidates` over own-company applicants; §3.4
  universe + privacy rule).
- Shared enum: `ApplicationState` (drives `topStage` + the stage filter, mapped via
  `applicationStatus()` on the FE for label/tone). No new enum introduced by this screen.
- Design language: [`../_design-language.md`](../_design-language.md).
- Demo to match: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
