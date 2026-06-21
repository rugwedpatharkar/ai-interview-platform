# Application outcome — Backend contract (v3 · frozen)

> **Screen.** `/applications/[id]/outcome` — the candidate's no-ghosting verdict surface
> (Advanced / Hold / Declined + score + recommendation + competency summary + what to do next).
> **FE consumer:** [`frontend_application-outcome.md`](./frontend_application-outcome.md).
> **Status:** `EXISTING — reuse v2` · **no proto delta, no new RPC, no new collection, no new
> event.** The outcome page consumes the same `applications.listMyApplications` query the
> dashboard already runs (client-side filter on `applicationId`) + `Report.GetReport` in the
> candidate's read scope (see the scope note below) + the existing messaging seam for the
> re-score request modal.
> **Anti-fiction reminder:** Aptura is pre-launch. The outcome page renders only what
> `Report.GetReport` truly returns — `executiveSummary`, `overallScore`, `recommendation`,
> `competencies[]`, and the auto-terminated flags. Empty competency arrays produce a truthful
> fallback ("Competency-level detail isn't available for this application…"), not fabricated
> bands. The recommendation pill reads the server `recommendation` verbatim — no inflation
> language ("AI is highly confident") added on the FE. See the anti-fiction rule in
> [`_design-language.md`](../_design-language.md).
> **Real-vs-mock today.** `Report.GetReport` is **real** on the recruiter side (per the
> applicant-report contract — `ApplicationService` + `Report` gRPC over `admin`); the
> candidate-side read uses the same RPC under the existing `recordings/reports` ACL (see scope
> note below).

## Candidate-side read scope — explicit restatement

The `Report.GetReport({ applicationId })` RPC is comp-scoped on the recruiter side (a recruiter
sees only their company's applications). **Per the existing `recordings/reports` ACL, the
application's own candidate is permitted to read their own report** — this is the no-ghosting
guarantee the product promises. Confirm in
[`../applicant-report/backend_applicant-report.md`](../applicant-report/backend_applicant-report.md)
that the ACL covers candidate reads (it does today). The candidate-side response returns the
**same shape** as the recruiter-side response — the FE renders a **subset** of fields (no
decision controls, no other-applicants comparison, no integrity scrubber unless
`autoTerminated`). This contract documents what the candidate-side UI consumes; nothing in the
DTO changes.

**No new RPC.** No new collection. No new event. Both sides read the same projection.

## Functionalities (what the backend provides for this page)

- **List** the caller's applications — the outcome page filters by `applicationId` (same query,
  same key as the dashboard + detail page).
- **Get** the AI interview report for this application in the candidate's read scope
  (executive summary, overall score, recommendation, competencies, integrity scalars).
- **Post** a re-score request as a tagged message on the application's messages thread
  (decline variant only) via the existing messaging seam.

## Service & RPCs (gRPC-web; `admin`, candidate-scoped — subject from bearer token)

| Function | RPC | Auth/scope |
|---|---|---|
| List my applications | `api.applications.listMyApplications({})` → `{ applications: Application[] }` | bearer, candidate; own only |
| Get report (candidate read scope) | `api.reports.getReport({ applicationId })` → `Report` (same shape as recruiter side) | bearer, candidate; **ACL permits the application's own candidate** to read their report (per existing `recordings/reports` ACL); other roles get `PERMISSION_DENIED` |
| Post message (re-score request) | `api.messaging.postMessage({ applicationId, body, tag?: "rescore_requested" })` → ack | bearer, candidate; own only (server enforces caller is a participant) |

> **No new RPC.** The candidate-side read uses the **same** `getReport` RPC the recruiter uses;
> the ACL check on the server admits the candidate-owner read alongside the comp-scoped
> recruiter read. The re-score request is a tagged message on the **existing** messaging
> thread — no new mutation.

## Request / Response structures (camelCase per protobuf-es on the FE)

```ts
// applications.listMyApplications({}) → (same shape as the dashboard + detail page consume)
interface Application {
  applicationId: string;
  jobId: string;
  state: string;                        // funnel vocabulary
  jobTitle?: string;                    // optional EXTEND — render-if-present
  companyName?: string;                 // optional EXTEND — render-if-present
}
interface ListMyApplicationsResponse { applications: Application[] }

// reports.getReport({ applicationId: string }) → (preserved verbatim from applicant-report)
interface Report {
  applicationId: string;
  state: string;
  executiveSummary: string;
  highlights: string[];
  risks: string[];
  overallScore: number;                 // 0..1
  recommendation: string;               // "advance" | "hold" | "reject"
  competencies: Competency[];
  integrityScore: number;               // 0 for legacy reports
  integrityFlagCount: number;
  autoTerminated: boolean;
  terminatedReason?: string;
}
interface Competency {
  competency: string;
  score: number;                        // 0..1
  rationale: string;
  evidence: Evidence[];
}
interface Evidence { quote: string; note: string }

// messaging.postMessage({ applicationId, body, tag? }) → ack
//   The re-score request modal posts body = "Requesting a human review of my outcome." +
//   tag = "rescore_requested". The recruiter side renders the tag as a re-score request
//   chip in the messages thread.
```

- **FE mock shape:** none new — binds to the **existing** `api.applications.*` /
  `api.reports.*` / `api.messaging.*`. The outcome page codes against the same shapes the
  recruiter-side report page already uses; the candidate-side just renders a subset.

## Data required

- **Read:** the applications collection (caller-scoped: same fields the dashboard reads);
  the reports/scoring projection (per the applicant-report contract — body fields above);
  the messages collection (read scope to render any pre-existing re-score system messages
  back on the thread, though this page doesn't render the thread directly — the modal does
  the write only).
- **Write:** the messages collection (the re-score request message, tagged
  `rescore_requested`).
- **Derived (FE, no backend):** the verdict label (lookup over `recommendation`), the
  score band ("Strong fit" / "Solid" / "Developing" / "Below threshold" — derived from
  `overallScore`), the per-outcome next-steps variant (switch on `recommendation` for the
  c2 cell layout), the conditional integrity-note cell (renders only when
  `autoTerminated === true`).
- **Indexes:** none new (existing application/report/messaging indexes suffice).

## Errors & edge cases

- **Auth:** missing/invalid bearer → `UNAUTHENTICATED`; non-candidate role → `PERMISSION_DENIED`;
  candidate calling for an application that isn't theirs → `PERMISSION_DENIED` (the ACL
  rejects).
- **State gate:** when `state` ∉ `{scored, shortlisted, hired, rejected}`, the FE redirects
  to `/applications/[id]` before issuing the report fetch. No "outcome not ready" 404 round-trip.
- **Report not yet scored** (`Report.GetReport` returns `NOT_FOUND`) → FE renders an `<Alert
  tone="warn">` ("Outcome is being generated — we'll let you know when it's ready.") and
  polls every 3s with the same cadence the applicant-report sibling uses. The page does NOT
  dead-end; the candidate can navigate back.
- **Empty `competencies`** (legacy report) → the c1 cell falls back to a truthful
  `.cell-empty` block.
- **`autoTerminated: true`** → the c3 integrity-note cell is rendered (gold-tinted
  `.def-panel.detect`); the hero verdict pill is overridden to "Under review" so the
  candidate is not presented with a final verdict when the recruiter still has to act.
- **`UNAVAILABLE` / transport error** → the anchor cell falls back to `ErrorState` + retry;
  sidebar cells render "couldn't load right now" — the page does NOT dead-end.
- **Forged / mismatched comp_id** (recruiter trying to read another company's report) →
  `PERMISSION_DENIED` (per the existing applicant-report ACL — never leak another company's
  outcome). Not applicable to the candidate read path, but documented for completeness.
- **Re-score request modal post fails** → modal shows an inline `<Alert tone="danger">` with
  `errorMessage(err)`; the candidate can retry. No silent fail.

## Cross-references

- Restates: v2 `candidate-report.md` (§A2 the extended report message) — same shape the
  recruiter-side report consumes; the candidate-side renders a subset.
- Sibling: [`../applicant-report/backend_applicant-report.md`](../applicant-report/backend_applicant-report.md)
  — the recruiter-side counterpart that consumes the same `Report.GetReport` projection
  (plus `Report.GetIntegrityTimeline`, which the candidate-side outcome does NOT consume
  except as a sentinel via `autoTerminated`).
- Sibling: [`../application-detail/backend_application-detail.md`](../application-detail/backend_application-detail.md)
  — the per-application detail page that the outcome's "Back to application" CTA returns
  to.
- Sibling: [`../message-thread/backend_message-thread.md`](../message-thread/backend_message-thread.md)
  — the messaging seam that the re-score request modal writes through.
- Shared enum: `ApplicationState` (the state gate); `Report.recommendation`
  ("advance"/"hold"/"reject").
- Design language: [`../_design-language.md`](../_design-language.md). Reference demo:
  [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
  — pay particular attention to the `.evidence` section (`.evidence-card`, `.competency`,
  `.why` with curly-quote markers) and the `.finalcta` dual-audience CTA card.
