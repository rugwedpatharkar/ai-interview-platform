# Backend — `talent-sourcing` (Midnight v3)

> **Screen:** Talent pool / sourcing · **FE consumer:** [`frontend_talent-sourcing.md`](./frontend_talent-sourcing.md)
> **Status:** **EXISTING — reuse v2.** Restated from [`../../v2-screens/talent-sourcing.md`](../../v2-screens/talent-sourcing.md)
> §A (`SourcingService.SearchCandidates` over own-company applicants). The Midnight redesign is **appearance-only** —
> no proto delta, no new collection, no new endpoint beyond the v2 contract.
> **Real-vs-mock today:** `Talent.GetTalentPool` (the empty-query default view) is **live**. The candidate **search**
> (`SourcingService.SearchCandidates`) is the v2 delta — the FE codes against `sourcing-client.ts`
> (`makeMockSourcingClient`, `USE_MOCK_SOURCING`) until it lands.

**Privacy note:** the response carries **no ID / background / biometric fields** — only the human-in-the-loop subset
(masked handle, counts, fit score, stage, matched skills). Candidate-data scope is the general recruiting profile only.

## Functionalities
- **List / browse** the company's full talent pool (default, no-query view) — masked handles + application counts.
- **Search** the company's **own applicants only** by keyword, with optional stage + min-score filters; return ranked
  hits with a **fit score** (the "fit" badge), furthest stage reached, and matched skills.

## Service & RPCs (`admin` gRPC)
| Function | RPC | Auth/scope |
|---|---|---|
| Get talent pool | `api.talent.getTalentPool({})` → `Talent.GetTalentPool` | bearer; **manager + comp-scoped** (`comp_id` from token) |
| Search candidates | `api.sourcing.searchCandidates({ query, stage?, minScore?, page?, pageSize? })` → `admin.sourcing.v1.SourcingService.SearchCandidates` **(NEW v2 RPC)** | bearer; **manager + comp-scoped**; `pageSize` clamped ≤50 |

- **`comp_id` comes from the token, never the request.** The candidate set = **every candidate with an application to
  ANY job owned by this `comp_id`** (the same seed set `resources/talent.py` builds for `GetTalentPool`). There is
  **no global candidate index** path.

## Request / Response structures
**`SearchCandidates` request** (camelCase on the FE per protobuf-es):
```
{ query /*keyword over profile/skills/experience text*/, stage /*optional funnel filter; "" = any*/,
  minScore /*0..1 fit floor; 0 = any*/, page, pageSize /*≤50*/ }
```
**`SearchCandidates` response:**
```
{ hits: [{ candidateUserId /*masked handle on the wire*/, applicationCount /*to THIS company*/,
           fitScore /*0..1*/, topStage /*furthest funnel state reached*/, matchedSkills[] }],
  total, page, pageSize }
```
**FE mock shape** (`app/talent/sourcing-types.ts`) — what the search codes against before the RPC lands:
`CandidateHitDTO { candidateUserId, applicationCount, fitScore, topStage, matchedSkills[] }`,
`SearchCandidatesResult { hits[], total, page, pageSize }`,
`SearchCandidatesParams { query, stage?, minScore?, page?, pageSize? }`. The empty-query view binds directly to the
already-generated `api.talent.getTalentPool` — no mock needed there.

## Data required
- **Reads** the `applications` repo (seed candidate ids scoped to the token's `comp_id`) joined to the talent/profile
  repo for the skill/experience text the keyword match runs over. **No new collection** — reuses `applications` +
  profile data.
- **Derived:** `fitScore` = keyword/score relevance; `topStage` = furthest funnel state across the candidate's apps
  to this company; `matchedSkills` = skills that matched the query.
- **Search-universe invariants (each a BE test):** (a) a candidate of another company **never appears**; (b) a
  `rejected` applicant **still surfaces** (universe = application-existence, not current funnel state); (c) an
  applicant to a `closed`/`paused` job **still surfaces**; (d) a candidate who never applied here is **unreachable**.

## Errors & edge cases
- Empty `query` → the FE does not call search (`enabled: query.length > 0`); the live pool renders. Server-side, an
  empty query may still return a bounded set or `INVALID_ARGUMENT` per the contract — the FE never hits this path.
- No matches → `200` with `hits: []` → FE `EmptyState` "No candidates match".
- Forged / mismatched tenant `comp_id` → never leaks another company's applicants (comp-scoping enforced server-side;
  `PERMISSION_DENIED` / scoped-empty).
- `UNAVAILABLE` / transient → the pool retains its `ErrorState` + retry; search surfaces the query error inline.
- `pageSize` over the cap → clamped to ≤50 server-side.

## Cross-references
- Restates: [`../../v2-screens/talent-sourcing.md`](../../v2-screens/talent-sourcing.md) §A (`SourcingService`,
  the search universe, the no-sensitive-data rule).
- Pillar: job-marketplace (Task 12 — `SearchCandidates` over own-company applicants; §3.4 universe + privacy rule).
- Shared enum: `ApplicationState` (drives `topStage` + the stage filter, mapped via `applicationStatus` on the FE for
  label/tone). No new enum introduced by this screen.
