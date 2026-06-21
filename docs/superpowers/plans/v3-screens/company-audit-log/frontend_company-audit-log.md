# Company audit log — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Build the **decision audit-trail viewer** at `/company/audit` — the page that backs the
landing's truthful promise "every decision is logged with the reviewer's name and reason".
Today the audit is **written** server-side on every `Decision.DecideApplication` /
`Decision.OverrideGate` call (the v2 decision contract documents the audit collection); this
screen is the first surface that **reads** it back. The page is a filter-driven table inside
the `.app` company shell:

- **Header** — filter chips bar (decision type · reviewer · date-range · job · applicant) +
  an Export `.btn.btn-ghost` (CSV download of the current filtered view).
- **Body** — `.table-wrap > table.data` with one row per `AuditEntry`. Columns: timestamp ·
  applicant · role · decision · reviewer · reason snippet · audit id (mono).
- **Side drawer** (opens on row click) — full evidence shown at decision time + the reviewer's
  comment + the audit entry's immutable id. Read-only — audit entries are never edited.

**Backend status: NEW scope, contract TBD (the data may already exist — confirm with the
backend session).** The audit collection is likely already populated by
`decideApplication` / `overrideGate` (per the v2 decision contract); what's missing is a
public RPC to read it back. This plan documents the **proposed surface** the FE builds
against — `AuditService.ListDecisionAudit` and `AuditService.GetDecisionAudit` — via a typed
mock client. When the backend session confirms the underlying collection and exposes the
read RPCs, the FE flip is the existing 1-line client swap.

Admin-only. Recruiters do not see audit history (they see their own decisions in the
applicant-report timeline, but the cross-job audit trail is admin scope). The landing
page's truthful claim "every decision is logged" needs an admin-visible surface that
**proves** it; this is that surface.

## Route + role

`/company/audit` (`apps/company/app/audit/page.tsx`) · **company — ADMIN ONLY**, guarded by
`useRequireRole(["company_admin"])`. The sidebar **Audit log** nav entry is only rendered for
admins. A recruiter who hits the route via a deep-link sees the in-page `<AdminGate />`
fallback (the shell already redirects; the in-page fallback is the bypass fallback only).

## Approved mockup (build to this exactly)

- **Live demo:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
  — `.cell` (anchor + supporting), `.table-wrap > table.data` for the audit rows, `.pill-good
  / .pill-warn / .pill-danger` for decision-type pills, `.tag` mono for the audit id, side-
  drawer pattern (re-use the same drawer primitive the applicant-report's integrity timeline
  uses for evidence excerpts).
- **Sibling reference:** the team-permissions plan
  ([`../team-permissions/frontend_team-permissions.md`](../team-permissions/frontend_team-permissions.md))
  — same `.app` company shell with the same admin-only gate; the `<AdminGate />` fallback
  pattern is identical. The data-table styling is shared (same `.table-wrap > table.data`
  vocabulary).
- **Screenshots:** `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-{light,dark}-full.jpeg`.

No per-screen mockup yet — Task 0 builds it.

## Existing code being REPLACED (not modified)

**NEW screen — no existing code is being replaced.** The route does not exist today; the
audit collection is server-side only with no consumer UI.

What is **NOT** touched: `CompanyShell` (existing `.app` shell + role gate), the
`useRequireRole` hook (used as-is with the stricter `["company_admin"]` scope), the toast +
ConfirmDialog primitives in `@ip/ui`, or any `*.proto` / generated client. This screen
**creates new FE files only**, no edits to existing services. The applicant-report's decision
timeline (inline on the applicant detail page) is the **per-applicant** view; this page is
the **cross-job + cross-applicant** view. They consume the same underlying audit collection
but render different slices.

## Section spine — 4 regions, in order

Build each as its own component under `frontend/apps/company/components/audit/`.

| # | Region | Component | Notes |
|---|---|---|---|
| 0 | App shell | `<CompanyShell>` (existing) | `.app` sidebar + topbar. Sidebar **Audit log** entry (admin-only) carries `aria-current="page"`. Topbar crumb = `<Company> / Audit log`. |
| 1 | Page head + filter chips | `<AuditHead />` | h1.display "Decision audit log" + `.sub` "Every decision made on every applicant, with the reviewer's name and reason. Read-only and immutable." Trailing `.btn.btn-ghost` **Export CSV** (downloads the current filtered view as `audit-<comp>-<from>-<to>.csv` via a client-side `Blob` of the same rows the table shows; only present when ≥1 row). Below the head, a filter chip bar: a row of `<FilterChip />`s for **Decision type** (multi-select: `decideApplication` / `overrideGate`), **Outcome** (multi-select: `shortlisted` / `rejected` / `hired` / `held`), **Reviewer** (single-select reviewer email, populated from `TeamService.ListMembers`), **Date range** (a popover `.cell.tight` with two `.input[type=date]` from/to + quick presets `Today` / `Last 7 days` / `Last 30 days` / `Custom`), **Job** (single-select; populated from `Job.ListJobs`), **Applicant** (text `.input` searching by candidate name). Active filters render as `.pill-teal` chips with a `[×]` clear button; clicking the chip jumps focus to the filter control. Below the chips, a mono count line: "<N> decisions match" or "No decisions match these filters." |
| 2 | Admin gate | `<AdminGate />` | When the caller is not a `company_admin`, render a calm `.cell` (same pattern as team-permissions / company-billing): `.tag` mono "ADMINS ONLY", h3 "The audit log is admin-managed", truthful copy ("Only company admins can view the cross-applicant decision audit. Ask your admin if you need access. Per-applicant decisions are visible on each applicant's report."), Link back to `/company`. The shell already redirects; this is the bypass fallback. |
| 3 | Audit table | `<AuditTable />` | One `.cell.tight` wrapping a `.table-wrap > table.data`. Columns: **Timestamp** (mono `.tnum` `formatLocal(entry.timestamp, "d MMM yyyy · HH:mm")`) · **Applicant** (`.who .nm` candidate name + `.sub` candidate email — clicking the row opens the side drawer; clicking the name navigates to `/company/jobs/[jobId]/applicants/[appId]`) · **Role** (`.who .nm` job title — clicking navigates to `/company/jobs/[jobId]`) · **Decision** (a `.pill-good` "Advanced" / `.pill-warn` "Held" / `.pill-danger` "Rejected" / `.pill-teal` "Override" pill based on `entry.decision` + `entry.outcome`) · **Reviewer** (`.who .nm` reviewer email + `.sub` role at the time, e.g., "recruiter") · **Reason snippet** (one-line truncated `reasonText` with `…` overflow) · **Audit id** (`.tag` mono, e.g., `dl_2026_a3f9c1`). Rows are clickable (`<tr role="button">`) and open the side drawer. Sorted desc by `timestamp`. Pagination at the bottom (centered `.btn.btn-ghost.btn-sm` page row) when `total > pageSize`. |
| 4 | Side drawer | `<AuditEntryDrawer />` | Slides in from the right (or full-screen sheet ≤540px) when a row is clicked. Contents: full `entry.reasonText` (preserves line breaks via `white-space: pre-wrap`), the **evidence-at-decision-time** block (a JSON-ish summary card showing the report score + integrity score + flag count + recommendation as they were at the moment of decision — pulled from `entry.evidenceSnapshot`), the reviewer's email + role + IP/UA mono pinpoint (`entry.reviewerCtx` — read-only forensics), the audit id (mono, copyable), and two close affordances: `.btn.btn-ghost` "Close" + the standard close `×` in the drawer header. **No edit controls.** Audit entries are immutable. |

## Layout & components — map to `@ip/ui` and tokens

Pull every primitive from `@ip/ui` per [`_design-language.md`](../_design-language.md).

| Region | Primitive | Tokens |
|---|---|---|
| Shell | `CompanyShell` (existing) | already on the new tokens via the design-language Task 1 |
| Page head | `h1.display` + `.sub` + `.btn.btn-ghost` | typography + button tokens |
| Admin gate | `.cell` + `.tag` mono + `h3` + `.btn.btn-ghost` | semantic tokens; calm, no scary red |
| Filter chip bar | row of `<FilterChip />` (each a `.btn.btn-ghost.btn-sm` chip with a leading mono key + value + trailing `[×]`) | `--surface-2`, `--ink`, `--line` |
| Active filter chip | `.pill-teal` with a `[×]` clear button | teal pill tokens |
| Date-range popover | `.cell.tight` floated below the chip + two `.input[type=date]` + preset list | popover tokens |
| Audit table | `.cell.tight` + `.table-wrap > table.data` | `--surface`, `--line`; `tr:hover` uses `--surface-2`; `tr:focus-visible` shows the standard 2px teal outline |
| Decision pill | `.pill-good` / `.pill-warn` / `.pill-danger` / `.pill-teal` | semantic tokens only |
| Mono columns (timestamp, audit id) | `.tnum` (Geist Mono) | `--ink`, `--ink-3` for the id |
| Side drawer | `Drawer` primitive in `@ip/ui` (right slide-in; bottom sheet ≤540px) | `--surface`, `--line`; backdrop = `color-mix(in oklch, var(--ink-deep) 60%, transparent)` |
| Reviewer / forensics block | mono `.tnum` lines inside the drawer | `--ink-3` |
| Evidence snapshot card | nested `.cell.tight` inside the drawer (a card-in-a-drawer is OK; the ban is only on card-inside-card grids) | `--surface-2` |

All new primitives live in `@ip/ui/src/app.css` (one shared file). **No new tokens.**
**Anti-slop ban** — no side-stripe borders on the table rows (use the `tr` border via
`--line`), no glassmorphism on the drawer, no "AI-summarised decisions" line (the audit is
verbatim — what the reviewer typed is what's shown; no LLM rewrite), no fake "your decisions
saved 32 hours" callouts, no upsell ribbons.

## Data wiring / seam

**Backend status: NEW scope, contract TBD (data likely already exists, RPC may not).** The FE
codes against a typed mock client today; the backend session owns the real contract (confirm
whether the audit collection from `decideApplication`/`overrideGate` is already surfaceable
via existing reads or if a new `AuditService` is needed).

The mock client lives at `apps/company/app/audit/audit-client.ts` and is gated by
`NEXT_PUBLIC_MOCK=1`. When the backend lands, the mock seam flips to
`createAuditClient(api)` — components unchanged.

| Region | Hook | Query key | Source (TBD) |
|---|---|---|---|
| Audit list | `useAuthedQuery(token, auditClient.listQueryKey(filters, page), () => auditClient.listDecisionAudit({ ...filters, page, pageSize: 50 }))` | `["audit","list", filters, page]` | `AuditService.ListDecisionAudit` (TBD; may already exist as a derived read over the existing audit collection) |
| Audit entry (drawer) | `useAuthedQuery(token, auditClient.entryQueryKey(id), () => auditClient.getDecisionAudit({ auditId: id }), { enabled: !!openId })` | `["audit","entry", id]` | `AuditService.GetDecisionAudit` (TBD) |
| Reviewer filter source | `useAuthedQuery(token, ["team","members"], () => teamClient.listMembers())` (reuse) | `["team","members"]` | `TeamService.ListMembers` (existing) |
| Job filter source | `useAuthedQuery(token, ["jobs","list"], () => api.jobs.listJobs({}))` (reuse) | `["jobs","list"]` | `Job.ListJobs` (existing) |
| Export | client-side CSV `Blob` from the **already-fetched** `entries` (no separate fetch); when `total > pageSize`, the Export button warns "Exporting only the current page; clear filters to export all." | — | (FE-only) |

**Mock seam (lives at `apps/company/app/audit/audit-client.ts`):**

```ts
import type { AuditEntry, AuditEntryFull, AuditListFilters } from "./types";

export interface AuditClient {
  listDecisionAudit(req: AuditListFilters & { page: number; pageSize: number }):
    Promise<{ entries: AuditEntry[]; total: number; page: number; pageSize: number }>;
  getDecisionAudit(req: { auditId: string }): Promise<AuditEntryFull>;

  listQueryKey(filters: AuditListFilters, page: number): readonly unknown[];
  entryQueryKey(id: string): readonly unknown[];
}

// Mock client returns a small, generic "Sample" fixture for the page to render in dev — never
// representing real candidate names or real reviewer decisions. Labelled "Sample" in every row.
export function makeAuditClient(): AuditClient { /* … sample fixture … */ }

// Real client (post-backend-confirmation — TBD; one-line swap).
export function createAuditClient(api: unknown): AuditClient { /* … binds to api.audit.* … */ }
```

**Filter state (`AuditListFilters`)** — derived from the URL querystring so deep-links are
shareable:

```ts
export interface AuditListFilters {
  decisionTypes: ("decideApplication" | "overrideGate")[];   // multi-select
  outcomes: ("shortlisted" | "rejected" | "hired" | "held")[];   // multi-select
  reviewerEmail: string;                                       // single
  jobId: string;                                               // single
  applicantQuery: string;                                      // text search by candidate name
  fromAt: string;                                              // ISO date (yyyy-MM-dd) in viewer's local zone
  toAt: string;                                                // ISO date (yyyy-MM-dd) in viewer's local zone
}
```

The URL adapter `parseFilters(searchParams)` ↔ `serializeFilters(filters)` keeps the
querystring in sync (`/company/audit?reviewer=alice@example.com&job=j_123&from=2026-06-01`).
Clearing all filters resets the page param.

**Anti-fiction guard.**

- The mock client returns a small, generic "Sample" fixture (3–5 rows max) — every row's
  applicant name is "Candidate A" / "Candidate B" / "Sample candidate"; every reviewer email
  is `reviewer@example.com`; every reason is `"Sample reason — for layout only"`. Each row's
  audit id is `sample_<n>` so it's obvious in dev. The mock NEVER fabricates a real-looking
  audit trail.
- The empty state ("No decisions match these filters.") is the **default** when filters
  exclude everything. The page does NOT auto-loosen filters or invent results.
- The drawer's evidence-snapshot card shows only what `entry.evidenceSnapshot` contains —
  if the snapshot is missing for an old audit entry (created before the snapshot field was
  added), the card renders "Evidence snapshot not available for this entry." (truthful, not
  "loading…").
- The reviewer's IP/UA forensics line uses real values when present (server-supplied) — if
  absent, the line shows "—" instead of inventing one.
- The Export CSV downloads exactly what the table shows (no extra fake "summary stats" row).
- **No AI summary of decisions.** The reason text is verbatim what the reviewer typed.

## Tasks (TDD-style, build → screenshot-verify → commit per task)

> **Task 0 — Build the per-screen mockup.** Create
> `docs/brand/redesign-v3/screens/company-audit-log.html` linking
> `@ip/ui/src/{tokens.css,app.css}` and the SVG sprite. Embed the `.app` shell verbatim from
> the design language; build the page head + filter chip bar (with 2 active filter
> `.pill-teal` chips for "Reviewer: alice@example.com" and "Job: Sample role") + the audit
> table (5 sample rows clearly labelled "Sample" — mix of Advanced / Held / Rejected /
> Override pills) + the side drawer open on row 2 (showing a sample reason, sample
> evidence snapshot, sample audit id). Verify in both themes at 1440×900 and 390×844 against
> `D-aperture-pro-{light,dark}-full.jpeg`. Commit the new HTML file only.

- **Task 1 — Shell + page head + admin gate + filter URL adapter.** Mount the page under
  `CompanyShell` with the `useRequireRole(["company_admin"])` gate already provided by the
  shell. Render `<AuditHead />` (without filter chips yet — they land in Task 2) +
  `<AdminGate />` as the in-page fallback for non-admins. Build the URL filter adapter
  `parseFilters` / `serializeFilters` (querystring ↔ `AuditListFilters`) with unit tests.
  Verify a recruiter loading `/company/audit` is redirected by the shell; the in-page
  fallback only fires if the redirect is bypassed. Commit
  `apps/company/app/audit/page.tsx`,
  `apps/company/app/audit/filter-url.ts`,
  `apps/company/components/audit/{audit-head,admin-gate}.tsx`.

- **Task 2 — Mock client + DTO types + filter chip bar.** Create
  `apps/company/app/audit/audit-client.ts` + `apps/company/app/audit/types.ts` with
  `AuditEntry`, `AuditEntryFull`, `AuditListFilters`. The mock returns a 3–5 row "Sample"
  fixture; reviewer / job filter sources read from the **existing** `TeamService.ListMembers`
  + `Job.ListJobs` queries. Build `<FilterChips />` — the row of filter controls
  (multi-select chips for Decision type + Outcome, single-select dropdowns for Reviewer + Job,
  popover date-range with presets, text input for Applicant). Render the active filters as
  `.pill-teal` chips with `[×]` clear; clicking a chip jumps focus to its filter control.
  Below: mono count "<N> decisions match" or empty state. Wire the URL adapter so changes
  persist on reload. Commit
  `apps/company/app/audit/{audit-client.ts,types.ts}`,
  `apps/company/components/audit/{filter-chips,filter-chip,date-range-popover}.tsx`.

- **Task 3 — Audit table.** Build `<AuditTable />` reading from the `["audit","list",
  filters, page]` query. Render the `.table-wrap > table.data` with 7 columns. Rows are real
  `<tr role="button" tabindex="0">` that open the side drawer on click / Enter. Pagination at
  the bottom (only when `total > pageSize`). Empty state: "No decisions match these filters."
  centered in a single `.cell`. Loading state: skeleton rows. Error state: inline
  `.pill-warn` "Couldn't load audit data" with retry. Commit
  `apps/company/components/audit/audit-table.tsx`.

- **Task 4 — Side drawer.** Build `<AuditEntryDrawer />` reading from
  `["audit","entry", id]` (only when `openId` is set). Render the full reason (pre-wrap),
  the evidence snapshot card (nested `.cell.tight`), the reviewer forensics block (mono
  email + role + IP/UA pinpoint), and the audit id (mono + copy button). Close affordances:
  `×` in the drawer header + `.btn.btn-ghost` "Close" + ESC. The drawer is keyboard-trap +
  ARIA-modal. Mobile ≤540px: full-screen sheet with drag-handle (per design-language
  Responsive rules). Commit
  `apps/company/components/audit/audit-entry-drawer.tsx`.

- **Task 5 — Export CSV.** Build the Export `.btn.btn-ghost` in the head. On click, generates
  a CSV from the **already-fetched** `entries` (no separate fetch — the page never invents
  rows the user can't see), wraps it as a `Blob`, triggers a client-side download via an
  anchor tag with `download="audit-<comp>-<from>-<to>.csv"`. When `total > pageSize`, the
  button warns inline "Exporting only the current page; clear filters to export all." The
  button is disabled when `entries.length === 0`. Commit
  `apps/company/components/audit/export-csv-button.tsx`.

- **Task 6 — Page assembly + fidelity verify.**
  1. `apps/company/app/audit/page.tsx` mounts `<CompanyAuditLog />` inside `<CompanyShell>`
     with the admin gate.
  2. `--filter @ip/company build` + `--filter @ip/company exec tsc --noEmit` are green.
  3. Boot the dev server with `NEXT_PUBLIC_MOCK=1`, sign in as a `company_admin`, screenshot
     `/company/audit` in both themes at 1440×900 and 390×844 against the Task-0 HTML.
  4. Walk filter interactions: apply a reviewer filter → URL updates → list refetches → count
     line updates → empty state when no match → clear all → list expands.
  5. Click a row → drawer opens → ESC closes → click outside closes.
  6. Click the candidate name in a row → navigates to the applicant detail; click the job
     title → navigates to the job pipeline.
  7. Export CSV → downloads a sample CSV with the right columns + the right row count.
  8. Confirm a recruiter loading `/company/audit` is redirected by `CompanyShell`; the
     in-page `<AdminGate />` is the bypass fallback only.
  9. Document in the README of the audit folder that the **real contract lands separately
     via the backend session** (confirm whether the underlying collection already exists from
     `decideApplication`/`overrideGate` and just needs a read RPC, or if a fresh `AuditService`
     is required).

  **Responsive verification** — sub-task (do not skip; quoted verbatim from the design-
  language `_design-language.md` Responsive section):

  1. **Screenshot at all 7 reference sizes:** 375 × 667 · 430 × 932 · 768 × 1024 portrait ·
     820 × 1180 portrait · 1024 × 1366 portrait · 1366 × 1024 landscape · 1440 × 900 ·
     1920 × 1080.
  2. **No horizontal scroll** at any width ≥ 320 px (test with
     `document.documentElement.scrollWidth`).
  3. **Every interactive element ≥ 44 × 44 px** when measured at the smallest breakpoint.
  4. **Keyboard does not cover form inputs** on iOS Safari (manual test or
     `visualViewport.height` check).
  5. **Orientation change** (portrait ↔ landscape) on iPad sizes — layout adapts gracefully,
     no clipped content.
  6. **`prefers-reduced-motion`** — every animation no-ops (test by enabling reduce-motion in
     DevTools).
  7. **Cross-browser:** iOS Safari, Chrome Android, Samsung Internet, desktop Safari /
     Chrome / Firefox / Edge — at minimum Safari + Chrome on every OS.
  8. **Save side-by-side proof** to
     `docs/brand/redesign-v3/verify/company-audit-log-{mobile,tablet,desktop}.jpeg`.

## States & a11y

- **States.** Each region behaves independently:
  - **Loading** — table renders 8 skeleton rows; filter chips render a single skeleton chip.
  - **Empty (filtered)** — "No decisions match these filters." centered `.cell`; the count
    line shows "0 decisions match".
  - **Empty (truly no decisions yet)** — table renders a single row "No decisions logged
    yet. Once your team makes their first decision, it will appear here." (truthful — this
    is the state for a brand-new company that hasn't decided on anything).
  - **Error** — inline `.pill-warn` "Couldn't load audit data" + retry; rest of the page
    stays mounted.
  - **Success** — table renders real rows; pagination when `total > pageSize`.
  - **Drawer** — `opening` (fade-in + slide-in 240ms) · `open` (focus trapped, ESC closes) ·
    `closing` (fade-out 150ms) · `closed` (unmounted).
  - **Export** — `disabled` (no rows) · `enabled` · `downloading` (button shows a spinner;
    triggers the download synchronously, so the spinner is brief).
  - **Admin gate (non-admin caller)** — the in-page `<AdminGate />` (calm, no scary red)
    explains the gate and offers a Link back to `/company`.
- **Responsive.** Sidebar collapses ≤1000px per the design language. The filter chip bar
  goes from a single row at ≥1100px to a wrapped 2-row grid at ≤1100px to a vertical stack
  at ≤760px. The audit table scrolls inside `.table-wrap` under 760px **and** converts to a
  card-stack at ≤540px (per the design-language Responsive table rule — each row → self-
  contained `.cell.tight` with label : value pairs). The side drawer is a right slide-in at
  ≥541px and a full-screen bottom sheet with drag-handle at ≤540px.
- **Dark + light.** All color via tokens; decision pills resolve to semantic tones; the
  drawer backdrop uses `color-mix(in oklch, var(--ink-deep) 60%, transparent)`. Per-user
  Appearance accent recolors `--teal` (active filter chips, focus rings, hover row tint).
- **A11y.** One `<h1>` per page (the audit head). `<main>` + `<table>` semantics; the table
  has real `<th scope="col">` headers and `<caption class="sr-only">` ("Decision audit
  log"). Each row is `<tr role="button" tabindex="0" aria-label="View audit entry for
  <candidate> · <decision> by <reviewer> at <timestamp>">` so screen-readers announce the
  full context before the user opens the drawer. The filter chips are inside a real
  `<fieldset>` with `<legend class="sr-only">("Filter audit entries")`; each chip is a real
  `<button>` with `aria-pressed`. The date-range popover is a `<dialog>` with focus trap and
  ESC-to-close. The side drawer is `role="dialog"` + `aria-modal="true"` + focus trap +
  ESC-to-close + a labelled close. Decision pills carry real text labels (not color-only).
  Touch targets ≥ 44 × 44 px. Contrast ≥ 4.5:1 body (`--ink-2` on `--bg`). Focus rings via
  `:focus-visible` — `--teal` 2px / 4px halo. Reduced-motion: drawer slide-in fades only;
  no animations on filter changes.

## Acceptance

- Looks 1:1 like the per-screen Task 0 HTML AND the relevant slices of
  [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html). Side-by-side
  screenshot proof committed under
  `docs/brand/redesign-v3/verify/company-audit-log-{light,dark}.jpeg`.
- `--filter @ip/company build` is green; `tsc --noEmit` is green; no console errors /
  warnings.
- **The mock seam is a typed contract.** The mock client + DTO types live at
  `apps/company/app/audit/{audit-client.ts,types.ts}`. When the backend session lands /
  exposes `AuditService.{ListDecisionAudit, GetDecisionAudit}` (or confirms an equivalent
  surface), the components stay unchanged — only `createAuditClient(api)` binds to
  `api.audit.*`.
- **The data may already exist.** Per the v2 decision contract, `decideApplication` /
  `overrideGate` write to an audit collection on every call. The backend session is asked to
  confirm whether (a) a read RPC already exists and just needs to be wired into the FE, (b) a
  thin read RPC needs to be added over the existing collection, or (c) the audit collection
  itself needs to be added. The FE plan does not block on that decision.
- **Anti-fiction posture is enforced.** Mock returns a small "Sample" fixture clearly
  labelled in every row. The drawer never invents an evidence snapshot — when the snapshot
  is missing for an old entry, the card says "Evidence snapshot not available for this
  entry." The Export CSV downloads exactly what the table shows; no fake summary stats. No
  AI-summary of the reviewer's reason — verbatim only.
- A non-admin (recruiter / hiring_manager) loading `/company/audit` is still redirected by
  `CompanyShell`'s `useRequireRole(["company_admin"])`; the in-page `<AdminGate />` is the
  bypass-only fallback.
- The landing page's truthful claim "every decision is logged with the reviewer's name and
  reason" now has an admin-visible surface that proves it. This is the page the founder shows
  to a security-conscious buyer who asks "how do we audit AI-influenced decisions?".
