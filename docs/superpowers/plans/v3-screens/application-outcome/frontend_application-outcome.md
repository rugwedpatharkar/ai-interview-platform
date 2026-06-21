# Application outcome — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

**THE no-ghosting surface.** Every applicant gets an answer + a reason — this is the candidate's
side of the verdict. Renders the application's outcome (Advanced / Hold / Declined), the Aptura
score, the recommendation rationale, the per-competency summary (when the candidate's read scope
allows it), and a clear "what to do next" path (re-score request + reapply roadmap for declines;
scheduled-next-step CTA for advances). Lives inside the **Aperture Pro** `.app` candidate shell.
The data layer is **FROZEN** — `applications.listMyApplications` + `Report.GetReport` in the
candidate's read scope are the only RPCs consumed.

## Route + role

`/applications/[id]/outcome` · **candidate** (`useRequireAuth` + `useRequireRole(["candidate"])`).
Caller must own the application; the server enforces this on both `listMyApplications` and
`Report.GetReport`. The route is gated on `state` ∈ `{scored, shortlisted, hired, rejected}` —
earlier states redirect to `/applications/{id}` (the detail page) with an inline note ("Outcome
not ready yet — we'll let you know.").

## Approved mockup (build to this exactly)

- **Design language (canonical):** [`../_design-language.md`](../_design-language.md) — see the
  `.app` candidate shell, `.cell.anchor`, `.ring` (the score donut), the `.evidence-card +
  .competency + .why` competency vocabulary, and the dual-audience `.finalcta` for the "what to
  do next" block.
- **Reference demo:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
  — pull the `.ring`, the `.evidence-card`, the `.competency`/`.why` markup, and the dual-CTA
  treatment from the landing's #evidence and #final-cta sections.
- **Sibling reference (the recruiter side of the same data):**
  [`../applicant-report/frontend_applicant-report.md`](../applicant-report/frontend_applicant-report.md)
  — the recruiter's report page consumes the same `Report.GetReport` RPC; the candidate-side
  outcome page is a **subset** of that view (no decision controls, no other-applicants
  comparison, no integrity scrubber unless the application was auto-terminated).

No per-screen mockup file yet. Build to the design language + the applicant-report sibling and
verify side-by-side at task end that the two surfaces feel like the same product.

## Existing code being REPLACED (not modified)

**This is a NEW screen — there is no existing code per screen.** Today, a candidate's only
view of their outcome is the dashboard tracker row's status pill + (for some states) a one-line
toast. The outcome page is the proper "no-ghosting" surface.

Files that will be **created** by this plan (no replacements):

- `frontend/apps/candidate/app/applications/[id]/outcome/page.tsx` — new route file; mounts
  `<ApplicationOutcome />`.
- `frontend/apps/candidate/components/application-outcome.tsx` — new outcome component.
- `frontend/apps/candidate/components/outcome-verdict-hero.tsx` — the hero strip primitive
  (verdict label + `.ring` score + recommendation reason).

The candidate-shell sidebar + topbar live in `@ip/ui` (introduced by the landing rebuild's
design-system task) and are consumed here unchanged.

## Layout & components

**Shell:** `.app` sidebar + topbar (candidate audience). Sidebar shows `Applications` as
`aria-current="page"`. The crumb reads "Home / Applications / `{jobTitle}` / Outcome" with the
penultimate segment linking to `/applications/[id]`.

| Region | Markup / class | Notes |
|---|---|---|
| Sidebar | `.app > .side` | Same nav as the dashboard. `Applications` is the active item. |
| Topbar | `.topbar` | Left: `.crumb` "Home / Applications / `{jobTitle ?? "Job {jobId}"}` / Outcome". Right: audience pill, notification bell, avatar. |
| Page head | `.page-head` | `<h1 class="display">Your outcome</h1>` (Schibsted 700, `--step-3`) + `.sub` "{jobTitle ?? "Job {jobId}"} · {companyName ?? "Employer"}". Right side: `.btn.btn-ghost` "Back to application" → `/applications/[id]`. |
| Hero strip | `.cell.anchor` (full row, `grid-column: span 6` at ≥ 1100 px) — **Outcome verdict** | Three-column body at ≥ 900 px (stacks ≤ 900 px): **(1)** verdict label — a large pill rendered at display scale (Schibsted 700, `--step-2`): `.pill-teal` "Advanced" / `.pill-warn` "On hold" / `.pill-coral` "Not advancing this round". Below the pill: a one-line subtitle (`--ink-2`, `--step-1`) — e.g., "We'll be in touch with next-step details within 5 business days." (advance) / "Our team is finishing reviews — we'll be in touch shortly." (hold) / "Thanks for taking the time — here's what we found and what's next." (decline). **(2)** the `.ring` (Aptura score, `--pct: overallScore * 100`) with `Geist Mono` value inside and "/ 100" suffix; below the ring, a mono `.score-band` label ("Strong fit" ≥ 80 / "Solid" 60–79 / "Developing" 40–59 / "Below threshold" < 40). **(3)** the recommendation rationale — a `<blockquote>` with the server's `executiveSummary` (curly-quote markers per the design language `.evidence` block), capped at ~3 lines with a "Read full report ↓" link to scroll to the competency cards below. |
| Body — competencies (visible when allowed by candidate read scope) | `.cell.c1` (`grid-column: span 6` at ≥ 1100 px) — **Competency summary** | `<h3>How you scored</h3>` + a grid of `.evidence-card` (one per `Competency` in `report.competencies`): leading mono micro-label (`COMPETENCY`) + competency name (`--step-1`) + `.bar` (5px height, fill `--teal`, value `competency.score * 100`) + a `.why` block with the rationale + ONE evidence quote (curly-quote markers, `--ink-2`). The c1 cell renders only when the candidate is allowed competency-level detail; when the read scope returns competencies, the cell renders all of them. **Anti-fiction.** When the array is empty (legacy reports), the cell falls back to a single `.cell-empty` block ("Competency-level detail isn't available for this application — your overall score and recommendation above are the final outcome.") rather than fabricating bands. |
| Body — what to do next (full row) | `.cell.c2` (`grid-column: span 6` at ≥ 1100 px) — **What to do next** | Renders a different sub-layout per outcome: **Advance** → a two-column block: left = "Your next step" with a `.btn.btn-primary` "View scheduled details →" → `/applications/[id]` (Events tab); right = "Get ready" with a `.btn.btn-coral` "Try a practice run" → `/practice`. **Hold** → a single centered block: "Hang tight — we'll update you here as soon as the team finishes." + a `.btn.btn-ghost` "Open application timeline" → `/applications/[id]`. **Decline** → a three-column block: left = "Why" (recap of the recommendation rationale + the strongest competency the candidate did well in, both pulled from the report); middle = "Request a re-score" with a `.btn.btn-coral` "Request human review" → opens the existing re-score request modal (see Data wiring); right = "Reapply roadmap" with a `<ul>` of 3 truthful suggestions ("Practice in our sandbox", "Try a different role family", "Build a public portfolio") + a `.btn.btn-ghost` "Browse roles" → `/jobs`. |
| Body — integrity note (conditional, full row) | `.cell.c3` (`grid-column: span 6` at ≥ 1100 px) — **Integrity note** | Visible only when `report.autoTerminated === true`. Renders a `.def-panel.detect` (gold-tinted) with the truthful note: "Your interview ended automatically due to a serious integrity signal. The recruiter has been notified; our team will review before any final decision." + a `.btn.btn-ghost` "Read the integrity policy" → `/legal/integrity-policy`. NO clip viewer here — that lives on the recruiter side. |

> **Primitives reference (do NOT redefine):** `.app · .side · .topbar · .crumb · .toolbar · .pill · .pill-{teal,good,warn,danger,coral} · .status · .cell · .cell.anchor · .cell.{c1,c2,c3} · .ring · .bar · .evidence-card · .competency · .why · .def-panel · .badge · .btn · .btn-{primary,ghost,coral,sm}` — all defined in `@ip/ui/src/app.css` per the [design language](../_design-language.md).

**New presentational pieces to build:** `<OutcomeVerdictHero>` (a composition of the existing
`.pill`, `.ring`, and `<blockquote>` primitives — no new CSS beyond a thin layout wrapper);
`<NextStepsBlock>` (the per-outcome variant of the c2 cell; pure layout, composes existing
primitives).

## Data wiring / seam (FROZEN — preserve every existing seam)

- **Client/seam:** `useAuth().api.applications.*` and `useAuth().api.reports.*` over the
  existing protobuf-es gRPC-web client. **Unchanged.**
- **Query keys (unchanged):**
  - `["applications"]` — reuses the dashboard's existing key; filters client-side to find the
    current `applicationId`. The verdict label + the page-head title come from this.
  - `["reports","detail", applicationId]` — `reports.getReport({ applicationId })`. **Per the
    [applicant-report contract](../applicant-report/backend_applicant-report.md), the report
    RPC is comp-scoped on the recruiter side, BUT the existing `recordings/reports` ACL
    permits the application's own candidate to read their report.** The candidate read scope
    returns the same shape; the FE renders the candidate-side subset (no decision controls,
    no integrity scrubber by default — only the conditional auto-terminated note above).
    The contract DOC for this screen restates the candidate-side scope explicitly so future
    readers can confirm without grepping.
- **Mutations:** **NONE today** for the re-score path. The "Request human review" `.btn.btn-coral`
  on the decline variant opens an existing `<RequestReviewModal>` (sibling — owned by the
  messaging seam) that posts a system message to the application's thread tagged
  `rescore_requested`. **No new RPC.** When the messaging-seam already exposes a typed mutation
  for this (see `messaging.postSystemMessage` / equivalent), the modal calls it; otherwise it
  posts a regular message with the same tag and the recruiter side renders it as a re-score
  request. Either way, this screen does not introduce a new RPC.
- **Fields consumed** (per [`backend_application-outcome.md`](./backend_application-outcome.md)):
  - `Application`: `applicationId`, `jobId`, `state`, optional `jobTitle` / `companyName`.
  - `Report`: `executiveSummary`, `overallScore` (0..1 → `--pct: overallScore * 100`),
    `recommendation` ("advance" / "hold" / "reject"), `competencies[]` (optional — empty for
    legacy reports), `autoTerminated`, `terminatedReason` (when present).
- **Client-derived (no new RPC):** the verdict label (lookup over `recommendation`), the
  score band ("Strong fit" / "Solid" / "Developing" / "Below threshold"), the per-outcome
  next-steps variant (Advance / Hold / Decline switch on `recommendation`).

## Tasks (build → screenshot-verify → commit per task)

> **Task 0 — Design language is the mockup.** No per-screen HTML mockup. Build to the design
> language + the applicant-report sibling; verify side-by-side that the candidate-side outcome
> page reads as a clean subset of the recruiter-side report.

- **Task 1 — Route + shell + hero strip.** Create
  `apps/candidate/app/applications/[id]/outcome/page.tsx` and
  `apps/candidate/components/application-outcome.tsx`. Render the `.app` candidate shell, the
  `.crumb`, the page-head, and the `<OutcomeVerdictHero>` anchor `.cell`. Wire both queries
  (`applications` filtered by `applicationId`, `reports.getReport({ applicationId })`). Render
  the `.ring` with `--pct: overallScore * 100`, the verdict pill keyed off
  `recommendation`, and the `<blockquote>` of `executiveSummary`. Verify the hero renders for
  each of the 3 recommendation values; verify the in-state gate redirects pre-scored states
  to `/applications/[id]`. Commit explicit paths.

- **Task 2 — Competency summary cell.** Build the `.cell.c1` (Competency summary) — render
  `.evidence-card` per `competency` with `.bar` for the score and `.why` for the rationale +
  one evidence quote. Empty-array fallback: the `.cell-empty` truthful block. Verify the
  cards stack to 1 column at ≤ 760 px (per the design language responsive rules); verify the
  curly-quote markers render in both themes. Commit.

- **Task 3 — Next-steps cell (per-outcome variants).** Build the `.cell.c2` (What to do next)
  with the three variants (Advance / Hold / Decline) keyed off `recommendation`. The decline
  variant wires the "Request human review" CTA to the existing re-score modal (or, if the
  modal isn't built yet, opens a minimal `<form>` that posts a tagged message via
  `messaging.postMessage` — same key the message-thread page uses; no new RPC). Verify the
  variants render correctly for each `recommendation` and that the "Try a practice run" CTA
  routes to `/practice`. Commit.

- **Task 4 — Integrity note cell (conditional).** Build the `.cell.c3` (Integrity note) that
  renders only when `report.autoTerminated === true`. Use the `.def-panel.detect` gold-tinted
  treatment. Verify the cell is **not** rendered in the default path; verify it appears for
  a forced auto-terminated fixture. Commit.

- **Task 5 — Full assembly + fidelity verify + Responsive verification.**
  1. `--filter @ip/candidate build` is green; `--filter @ip/candidate exec tsc --noEmit` is
     green.
  2. Run the dev server, sign in as a candidate with a scored application; navigate to the
     outcome page; verify the three recommendation variants render correctly (force via a
     dev hatch).
  3. Side-by-side fidelity check vs. the applicant-report sibling — the candidate-side
     outcome page must read as a clean subset (no decision controls, no other-applicants
     comparison, no integrity scrubber unless auto-terminated). Save proofs at
     `docs/brand/redesign-v3/verify/application-outcome-{light,dark}.jpeg`.
  4. Confirm the deep-links: from the dashboard's row "View outcome" action (Task 4 of the
     dashboard) AND from the application-detail Report tab's "Open outcome" link.
  5. **Responsive verification** — execute the 8-step list from
     [`../_design-language.md`](../_design-language.md) §"Mandatory verification":
     1. **Screenshot at all 7 reference sizes:** 375 × 667 · 430 × 932 · 768 × 1024 portrait ·
        820 × 1180 portrait · 1024 × 1366 portrait · 1366 × 1024 landscape · 1440 × 900 ·
        1920 × 1080.
     2. **No horizontal scroll** at any width ≥ 320 px (test with
        `document.documentElement.scrollWidth`).
     3. **Every interactive element ≥ 44 × 44 px** when measured at the smallest breakpoint.
     4. **Keyboard does not cover form inputs** on iOS Safari (manual test or
        `visualViewport.height` check) — the re-score request modal's `<textarea>` honors
        this rule.
     5. **Orientation change** (portrait ↔ landscape) on iPad sizes — layout adapts
        gracefully, no clipped content; the hero strip's 3-column body stacks correctly on
        narrower tablets.
     6. **`prefers-reduced-motion`** — every animation no-ops (test by enabling reduce-motion
        in DevTools); the `.ring` doesn't animate its fill.
     7. **Cross-browser:** iOS Safari, Chrome Android, Samsung Internet, desktop Safari /
        Chrome / Firefox / Edge — at minimum Safari + Chrome on every OS.
     8. **Save side-by-side proof** to
        `docs/brand/redesign-v3/verify/application-outcome-{mobile,tablet,desktop}.jpeg`.

## States & a11y

- **States.**
  - **Loading** — `LoadingState` inside the anchor hero cell; the `.ring` shows a
    skeleton ring; competency cards render skeletons.
  - **Not yet scored** — the in-state gate redirects to `/applications/[id]` before render
    (does not flash empty content).
  - **No report found** (`Report.GetReport` returns `NOT_FOUND`) — defensive fallback: the
    page renders an `<Alert tone="warn">` ("Outcome is being generated — we'll let you know
    when it's ready.") + a `.btn.btn-ghost` "Back to application" → `/applications/[id]`.
    Poll every 3s while the alert is up (same cadence the applicant-report sibling uses).
  - **Empty competencies** — c1 falls back to the truthful `.cell-empty` block.
  - **Auto-terminated** — c3 renders the integrity note; the hero verdict pill is forced to
    `.pill-warn` "Under review" (overriding the lookup over `recommendation`) so the
    candidate is not presented with a final verdict when the recruiter still has to act.
  - **Error** (transport) — anchor cell shows `ErrorState` + retry; sidebar cells render
    "couldn't load right now."
- **Responsive.**
  - ≥ 1100 px — hero anchor spans the full row; c1 (competencies) and c2 (next steps) span
    full rows below; c3 (integrity, when present) spans the full row beneath.
  - 760–1099 px — hero stacks (verdict on top, ring below, blockquote below); c2 next-steps
    layout collapses to 2 columns (Advance) / 1 column (Hold / Decline middle and right
    stack).
  - ≤ 760 px — sidebar collapses to a drawer; hero stacks to 1 column; all CTAs become
    full-width sticky to `safe-area-inset-bottom`; the decline variant's 3-column layout
    becomes 1 column ("Why" first, "Request human review" second, "Reapply roadmap" third).
  - ≤ 540 px — competency cards stack to 1 column; the `.ring` shrinks to 96 px to fit.
- **Dark + light:** all colors via tokens; the `.ring` fill is `--teal` (resolves to the
  per-user accent); the verdict pill uses the semantic token swatches (teal for advance,
  warn for hold, coral for decline); the integrity panel uses `--gold-soft`.
- **Reduced motion:** `prefers-reduced-motion: reduce` disables the `.ring` reveal and any
  `.rise` reveal — content remains visible.
- **A11y.**
  - One `<h1>` per page ("Your outcome"); cells use `<h3>` and labelled regions
    (`aria-labelledby`).
  - `aria-current="page"` on the active sidebar nav (`Applications`).
  - The `.ring` carries `aria-label="Aptura score {pct} out of 100"`.
  - The verdict pill carries a text label (not color-only); screen readers announce
    "Outcome: {label}".
  - Each competency card is an `<article>` with `aria-labelledby` pointing at the
    competency name; the `.bar` carries `role="progressbar"` with `aria-valuemin/max/now`.
  - The re-score request modal is focus-trapped, returns focus to the trigger button on
    close, and the trigger is a real `<button>` (not a div).
  - The integrity-note cell uses `<aside role="region" aria-labelledby="integrity-note">`.
  - Focus rings via tokens (`--teal` 2px outline + 4px halo); touch targets ≥ 44 × 44;
    body contrast ≥ 4.5:1.

## Acceptance

- The outcome page reads as a clean candidate-side subset of the applicant-report sibling —
  same tokens, same `.ring`, same `.evidence-card`/`.competency`/`.why`, same dual-audience
  CTA treatment. Side-by-side proof committed at
  `docs/brand/redesign-v3/verify/application-outcome-{light,dark}.jpeg` and the responsive
  trio at `…-{mobile,tablet,desktop}.jpeg`.
- `--filter @ip/candidate build` is green; `tsc --noEmit` is green; no console errors /
  warnings; reduced-motion is honored.
- **Zero functional diff vs. today** beyond adding the new route: `Report.GetReport` is
  called with the candidate as the caller (per the existing `recordings/reports` ACL); the
  existing messaging seam owns the re-score modal write path; no new RPC.
- The page is **gated** on `state` ∈ `{scored, shortlisted, hired, rejected}` — earlier
  states never see this surface (they get redirected to `/applications/[id]` with an inline
  note).
- The conditional integrity-note cell appears only when `report.autoTerminated === true`,
  and the verdict pill is overridden to "Under review" in that case (no final verdict shown
  to the candidate when the recruiter still has to act).
- Strict-proctored interview surface is **not** referenced from this screen except via the
  integrity-note link to `/legal/integrity-policy`; no proctoring controls appear here.
- Pre-launch anti-fiction posture preserved: empty competency arrays produce a truthful
  fallback block, not fabricated bands; the score band labels are derived from the actual
  `overallScore` (no inflation); "Reapply roadmap" suggestions are generic and don't claim
  fictional partnerships or integrations.
