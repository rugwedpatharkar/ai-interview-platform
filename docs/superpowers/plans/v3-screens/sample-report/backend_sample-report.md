# Sample Report — Backend contract (v3 · frozen)

> **Screen.** Public viewer of the sample evidence report. **FE consumer:** [`frontend_sample-report.md`](./frontend_sample-report.md).
> **Status:** `NEW — static page · no backend, no collections, no events.`
> **Truthfulness note:** Aptura is pre-launch. This contract documents only what the UI consumes today;
> claims of integrations, customer outcomes, or unearned certifications belong nowhere — see the
> anti-fiction rule in [`_design-language.md`](../_design-language.md).

## Functionalities

- **None server-side for this page.** The sample-report page renders entirely from a static
  TypeScript constant (`sample.ts`) typed against the same DTO the authenticated applicant-report
  consumes. There is no fetch and no query key.
- **Static asset:** `public/sample-report.pdf` (a placeholder pre-launch; ultimately generated
  from the same `SAMPLE_REPORT` constant via the existing PDF pipeline if/when it exists).
- **Outbound cross-links:** `/trust`, `/ai-explainability`, `/what-we-dont-do`, `/pilot`,
  `/waitlist` — static `next/link` href constants.
- **Final-CTA buttons** — `next/link` cross-links; no fetch.
- **Deferred / out of scope.**
  - Pre-generating the sample PDF server-side and serving it via the same endpoint as real
    reports — out-of-scope here; the placeholder static asset suffices.
  - Tracking "Downloaded the sample PDF" via analytics — purely a `data-analytics` event hook on
    the FE; no RPC.

## Service & RPCs

- **No gRPC, no new REST, no proto delta.** This screen does not introduce any contract.
- The **authenticated** consumer of the same DTO is `/applications/[id]/report` — see the existing
  `applicant-report` plan. Its contract is the upstream truth; this page mirrors it locally.

## Request / Response structures

There is no data contract for this screen. The only typed shape is the static `SAMPLE_REPORT`
constant, which MUST conform to the same `ApplicantReportDTO` type the authenticated screen
consumes (so the build fails when the DTO evolves):

```ts
// sample.ts (FE static constant — pre-launch voice)
export const SAMPLE_REPORT: ApplicantReportDTO & { sample: true } = { … }

// ApplicantReportDTO (canonical; lives in packages/api-client/src/applications/report.ts
// once the authenticated screen is wired — until then, declare it locally and re-home it later):
interface ApplicantReportDTO {
  candidateName: string                     // "Sample candidate" | "Candidate A"
  role: string
  completedAtIso: string                    // ISO-8601, UTC
  overallScore: number                      // 0–100
  recommendation: "recommend" | "borderline" | "not_recommend"
  competencies: {
    name: string
    score: number                           // 0–100
    rubricAnchor: string                    // e.g. "L3 · Owns design trade-offs"
    quote: string                           // transcript snippet
    rationale: string
    transcriptSnippet?: string              // longer excerpt revealed in <details>
  }[]
  integrity: {
    events: {
      sev: "low" | "med" | "high"
      at: string                            // ISO-8601
      title: string
      body: string
      clipText: string                      // excerpt, not a media URL
      autoAction?: "warn" | "end"
    }[]
    summary: {
      score: number                         // 0–100
      counts: { low: number; med: number; high: number }
    }
  }
  advisory: {
    aiRecommendation: "recommend" | "borderline" | "not_recommend"
    humanSignedAtIso: string
    reviewerNote: string                    // labelled "(sample)" in copy
  }
}
```

All copy in this file MUST follow the **anti-fiction rule** in [`_design-language.md`](../_design-language.md):

- `candidateName` MUST be `"Sample candidate"` or `"Candidate A"` — never a real-sounding name.
- `role` MAY be a generic role title (e.g. `"Backend engineer (Sample)"`).
- `competencies[].quote` MUST be fabricated dialogue marked clearly as sample.
- `advisory.reviewerNote` MUST end with `"(sample)"`.
- No claimed certifications we haven't earned.

## Data required

- **None.** No collection read or written by this page. No derived/aggregated values, no indexes,
  no caches, no event topics.
- The `public/sample-report.pdf` file is a static asset shipped with the FE build.

## Errors & edge cases

- No fetch → no `NOT_FOUND` / `UNAUTHENTICATED` / `UNAVAILABLE` paths.
- Fully public, token-free, crawlable; SSR-renders immediately.
- DTO drift (the authenticated screen's `ApplicantReportDTO` changes shape) — the build fails on
  this page until `SAMPLE_REPORT` is updated. **This is the desired behaviour** — it keeps the
  public sample and the live report in lockstep.
- Missing static PDF — the "Download a sample PDF" link 404s; the page itself still renders.
  Acceptance criterion in the FE plan requires the placeholder asset is present at first commit.

## Cross-references

- Live consumer of the same DTO: `applicant-report` (`/applications/[id]/report`) — see the
  existing plan. **Authoritative source for the DTO shape.**
- Sibling public pages: [`../trust-architecture/backend_trust-architecture.md`](../trust-architecture/backend_trust-architecture.md),
  [`../ai-explainability/backend_ai-explainability.md`](../ai-explainability/backend_ai-explainability.md),
  [`../what-aptura-doesnt-do/backend_what-aptura-doesnt-do.md`](../what-aptura-doesnt-do/backend_what-aptura-doesnt-do.md),
  [`../accessibility-statement/backend_accessibility-statement.md`](../accessibility-statement/backend_accessibility-statement.md).
- Downstream CTAs: [`../request-pilot/backend_request-pilot.md`](../request-pilot/backend_request-pilot.md),
  [`../waitlist/backend_waitlist.md`](../waitlist/backend_waitlist.md).
- Design language: [`../_design-language.md`](../_design-language.md).
- Demo to match: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
