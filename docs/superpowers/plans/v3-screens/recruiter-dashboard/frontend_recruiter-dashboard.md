# Recruiter dashboard — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Rebuild the recruiter "command centre" at `/company` from scratch in the Aperture Pro design
language. The page is the at-a-glance view a manager opens first thing in the morning: how many
open roles, where applicants sit in the funnel, which candidates are awaiting a decision today,
what the team has done in the last 24h. Backend stays frozen — every existing analytics / KPI /
jobs call is preserved verbatim and rebound to the new components. The previous v2/Midnight
markup, classes, and component layout are **discarded**; only the data hooks survive.

## Route + role

`/company` (signed-in branch of `apps/company/app/page.tsx`) · **company** — guarded by
`useRequireRole(["recruiter", "company_admin"])` (enforced inside `CompanyShell`; do not
re-implement). Non-managers are redirected by the shell before this page renders.

## Approved mockup (build to this exactly)

- **Live demo:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
  — `.stats-grid + .stat` row, `.cell` bento, `.match > .card` ranked rows, `.bar` competency
  meters, `.pill-good/.pill-warn` status pills, mono `.tag` labels on bento cells.
- **Screenshots:** `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-{light,dark}-full.jpeg`.

There is no per-screen mockup yet — the design language demo IS the reference. Task 0 below
captures the screen-specific composition as a standalone HTML preview, then the React build
mirrors it 1:1.

## Existing code being REPLACED (not modified)

Delete-and-rebuild scope:

- `frontend/apps/company/app/page.tsx` — server entry that mounts the dashboard
- `frontend/apps/company/app/dashboard.tsx` — `RecruiterDashboard` body (KPI strip / funnel /
  recent jobs / `EmployerFirstRun`)
- `frontend/apps/company/components/kpi-card.tsx` — `KpiCard` tile (replaced by the new `.stat`
  primitive from `@ip/ui`)
- `frontend/apps/company/components/funnel-chart.tsx` — `FunnelChart` (rebuilt as a `.cell` with
  `.bars` rows; the `/company/analytics` page consumes the new component too, no fork)
- `frontend/apps/company/components/recent-jobs.tsx` — `RecentJobs` (rebuilt as a `.cell.tight`
  with `.jobrow`-style rows using new tokens)

What is **NOT** touched: `frontend/apps/company/components/company-shell.tsx` (the auth+role
gate stays as-is — it's the shared `.app` shell), `dashboard-kpis.ts` / `dashboard-types.ts`
(pure helpers + DTO; their tests still pass), or any `*.proto` / generated client.

## Section spine — 6 regions, in order

Build each as its own component under `frontend/apps/company/components/dashboard/`.

| # | Region | Component | Notes |
|---|---|---|---|
| 0 | App shell | `<CompanyShell>` (existing) | `.app` sidebar + topbar. Sidebar `Hiring`/`Workspace` nav labels; **Dashboard** carries `aria-current="page"`. Topbar crumb = `<Company> / Dashboard`, search box, `Export` `.btn-ghost.btn-sm`, avatar. |
| 1 | Greeting head | `<GreetingHead />` | Schibsted Grotesk h1 ("Good morning, <name>"), `.sub` (line of role context), trailing `.pill-good` ("100% answered") + `.btn.btn-primary` **+ Post a job** (Link `/company/jobs/new`). |
| 2 | KPI strip | `<KpiStrip />` | `.stats-grid` (4 columns) of `.stat` cells: **Open roles · Applicants this week · Interviews · Median response**. Display number is Schibsted 700 with a teal `<span class="unit">` for the unit; `.l` line is the descriptive caption. |
| 3 | Bento body | `<DashboardBento />` | 6-column bento. **Anchor cell** (`.cell.anchor`, `span 4 rows 2`) = the active funnel. Supporting cells (`.c1`–`.c6`) rotate through purpose: needs-your-decision queue, recent jobs, ranked-today list, team activity, integrity headlines, scheduling. |
| 4 | Anchor cell — Active funnel | `<ActiveFunnel />` | Inside `.cell.anchor`. `.tag` mono ("LAST 30 DAYS"), `h3` ("Hiring funnel"), `.bars` rows Applied→Offer with `.bar > .name/.v/.t > i`. Sub-line per row uses `.ink-3` mono ("42% of applicants"). |
| 5 | Needs-decision queue | `<NeedsDecisionCell />` | `.cell.c2` (tall · `span 2 rows 2`). `.tag` mono ("AWAITING DECISION"), counter `.pill.pill-coral.tnum`, then `.match` list of `.card` rows — avatar gradient + `<b>` name + `<span>` "Score 91 · passed gate" + trailing **Advance** `.btn.btn-primary.btn-sm` / **Decline** `.btn.btn-ghost.btn-sm`. |
| 6 | Recent jobs | `<RecentJobsCell />` | `.cell.c1`. `.tag` ("LIVE POSTINGS"), `h4` ("Recent jobs"), 4-row list of `.match > .card` rows (no avatar — just `.col > b/span` + trailing `.pill-good/.pill-warn` status). Last row is a "View all jobs" Link to `/company/jobs`. |
| 7 | Ranked today | `<RankedTodayCell />` | `.cell.c3`. `.tag` ("TOP AI MATCHES TODAY"), 3 `.match > .card` rows with avatar + name + role + `.pct` mono percent. View → `/company/jobs/[id]/applicants/[appId]`. |
| 8 | Team activity | `<TeamActivityCell />` | `.cell.c4`. `.tag` ("LAST 24 HOURS"), a vertical list of activity rows (mono timestamp + verb + actor + object). Render-only, no new query. |
| 9 | Integrity headlines | `<IntegrityHeadlinesCell />` | `.cell.c5`. `.tag` ("PROCTORING — LAST 7 DAYS"), 3 `.bar` meters (auto-ended / fullscreen exits / second-voice flags) with mono `.v` counts. Color via tokens only — never raw color. |
| 10 | Scheduling preview | `<SchedulingCell />` | `.cell.c6`. `.tag` ("UPCOMING"), next 3 scheduled events as `.match > .card` rows with mono date+time and candidate/role. View → `/company/jobs/[id]/applicants/[appId]?tab=schedule`. |

Bento collapse rules (already in the design language): 6 columns ≥1100px → 4 columns at the
mid breakpoint → 2 columns ≤760px. The anchor stays `span 4` at every breakpoint; everything
else flows.

## Layout & components — map to `@ip/ui` and tokens

| Region | Primitive (in `@ip/ui`) | Tokens |
|---|---|---|
| Shell | `CompanyShell` (existing) | already on the new tokens via the design-language Task 1 |
| Greeting | `h1.display` (Schibsted 700, `--ink-deep`) + `.sub` (`--ink-2`) + `.pill.pill-good` + `.btn.btn-primary` | typography + button tokens |
| KPI strip | `.stats-grid + .stat` | `--surface`, `--line`, `--ink-deep` headline, teal `.unit` |
| Bento grid | `.bento > .cell + .cell.anchor + .cell.c1…c6` | `--surface`, `--line`, anchor uses teal-tinted gradient + teal border |
| Active funnel rows | `.bars + .bar + .bar > .t > i` | bar fill `--teal`; rail `--surface-3` |
| Status pills | `.pill-good` / `.pill-warn` / `.pill-coral` / `.pill-teal` | semantic-token only — never `bg-emerald-*` raw |
| Ranked / Decision rows | `.match > .card` (avatar + col + pct) | teal gradient avatar; mono percent |
| Buttons | `.btn.btn-primary.btn-sm` / `.btn.btn-ghost.btn-sm` | 40px height, 10px radius |
| Mono tags | `.tag` micro-label top-right of every `.cell` | Geist Mono · `--step--2` · `--ink-3` |

All new primitives live in `@ip/ui/src/app.css` so every other screen pulls from one source.
No new tokens — everything resolves through the resolved accent (`--teal`) and the resolved
base palette.

## Data wiring / seam

**Every existing query and handler is preserved verbatim. Nothing new.**

| Region | Hook | Query key | Source |
|---|---|---|---|
| KPI strip | `useAuthedQuery(token, …, () => makeMockKpis())` → after `pnpm gen` `api.analytics.getNoGhostingKpis({ windowDays: 30 })` (widen bigints with `Number(...)`) | `["analytics","kpis",30]` | `dashboard-kpis.ts` / [`backend_recruiter-dashboard.md`](./backend_recruiter-dashboard.md) |
| Active funnel | `useAuthedQuery(token, …, () => api.analytics.getFunnelAnalytics({}))` | `["analytics","funnel"]` (dedup'd with `/company/analytics`) | `Analytics.GetFunnelAnalytics` |
| Recent jobs cell | `useAuthedQuery(token, …, () => api.jobs.listJobs({}))` → `.slice(0,4)` | `["jobs","recent"]` | `Job.ListJobs` |
| Ranked today | derived from existing per-job ranked queries already in the codebase; render-only, no new RPC | `["ranked","today"]` (client-side dedup; an existing convenience) | `Recommendation.GetJobRankedCandidates` |
| Needs-decision queue | render-only over the **same** applicants the pipeline page reads — no new query. Advance fires `Decision.OverrideGate({applicationId})`; Decline fires `Decision.DecideApplication({applicationId, outcome:"rejected"})`. On success, invalidate `["applicants"]`, `["ranked"]`, `["analytics","kpis",30]`. | n/a (derived) | `Decision.OverrideGate` / `Decision.DecideApplication` |
| Team activity | render-only over the existing audit-style log already plumbed into the company app | n/a | none new |
| Integrity headlines | derived from existing integrity aggregates already in the analytics page | n/a | `Analytics.*` aggregates (existing) |
| Scheduling preview | render-only over existing scheduling list (Messages/Schedule tab consumes it) | n/a | `SchedulingService` (existing) |

**Anti-fiction guard.** When `["jobs","recent"]` returns `[]`, the bento cell renders the
truthful empty state — "**No jobs yet** — post a role to get started" with the **+ Post a
job** CTA. When `["applicants"]` is empty, the needs-decision queue shows "**All caught up**
— no applicants awaiting a decision." Never invent rows. Never insert fake company logos or
fabricated wins.

## Tasks (TDD-style, build → screenshot-verify → commit per task)

> **Task 0 — Build the per-screen mockup.** Create
> `docs/brand/redesign-v3/screens/dashboard-recruiter.html` linking
> `@ip/ui/src/{tokens.css,app.css}` and the SVG sprite. Embed the `.app` shell verbatim from
> the design language; build the bento body to the shape above with sample (clearly labelled
> "Sample") rows. Verify in both themes at 1440×900 and 390×844 against
> `D-aperture-pro-{light,dark}-full.jpeg`. Commit the new HTML file only.

- **Task 1 — Shell + greeting + KPI strip.** Mount the page under `CompanyShell`; render the
  greeting head and `.stats-grid` of 4 `.stat` cells reading from the existing KPI hook (mock
  today, real after `pnpm gen`). Verify the strip respects the responsive collapse from the
  design language. Commit `apps/company/app/page.tsx`,
  `apps/company/components/dashboard/{greeting-head.tsx,kpi-strip.tsx}`.

- **Task 2 — Active funnel anchor cell.** Build `<ActiveFunnel />` as a `.cell.anchor` reading
  from `["analytics","funnel"]`. Each stage is a `.bar` row with name / mono value / track.
  Preserve the existing `LoadingState` / `EmptyState` ("No applications yet") / `ErrorState`
  + retry branches. Verify the cell anchors at `span 4 / row 2` and collapses cleanly. Commit
  `components/dashboard/active-funnel.tsx`.

- **Task 3 — Needs-decision queue cell.** Build `<NeedsDecisionCell />` over the already-fetched
  applicants list. Each row is a `.match > .card` with avatar + name + sub + Advance/Decline.
  Wire the two buttons to the **existing** `OverrideGate` / `DecideApplication` mutations and
  invalidate the same query keys as today. Empty state: "All caught up". Verify Advance
  removes the row + bumps the KPI strip. Commit `components/dashboard/needs-decision-cell.tsx`.

- **Task 4 — Recent jobs / Ranked today / Scheduling cells.** Three small cells, each is a
  `.match > .card` list reading from its already-existing source. Status pills via
  `jobStatus()` map to `.pill-good/.pill-warn/.pill`. Empty states are truthful ("No jobs
  yet", "No ranked candidates yet", "No upcoming sessions"). Commit
  `components/dashboard/{recent-jobs-cell,ranked-today-cell,scheduling-cell}.tsx`.

- **Task 5 — Team activity + Integrity headlines cells.** Two render-only cells over already-
  plumbed audit + analytics data. Team activity is a vertical list (mono timestamp + verb +
  actor + object); Integrity headlines is a 3-`.bar` mini chart. Truthful empties: "No team
  activity yet today", "No integrity events in the last 7 days". Commit
  `components/dashboard/{team-activity-cell,integrity-headlines-cell}.tsx`.

- **Task 6 — Page assembly + fidelity verify.**
  1. `apps/company/app/page.tsx` mounts `<RecruiterDashboard />` inside `<CompanyShell>`.
  2. `--filter @ip/company build` + `--filter @ip/company exec tsc --noEmit` are green.
  3. Boot the dev server, sign in as a recruiter, screenshot `/company` in both themes at
     1440×900 and 390×844. Side-by-side fidelity check against
     `D-aperture-pro-{light,dark}-full.jpeg` and the Task-0 HTML — iterate any divergence until
     1:1.
  4. Confirm a non-manager (e.g., `candidate`) is still redirected by `CompanyShell` —
     `useRequireRole(["recruiter","company_admin"])` behavior is unchanged.
  5. Confirm `/company/analytics` still consumes the same `Analytics.GetFunnelAnalytics` (no
     fork).

## States & a11y

- **States.** Each cell loads / errors / empties **independently** — the page never blocks on
  one query.
  - **Loading** — funnel + recent-jobs render `LoadingState`; KPI strip renders skeleton numbers
    (mock today resolves synchronously, so no flash in dev).
  - **Empty** — see truthful copy above; no fabricated rows.
  - **Error** — funnel + recent jobs render `ErrorState` + retry; KPI strip degrades to "—"
    placeholders with `aria-label="Data unavailable"`.
  - **Success** — every cell renders from real data; the needs-decision queue prunes itself
    after a successful Advance/Decline.
- **Responsive.** Sidebar collapses ≤1000px per the design language. KPI strip 4→2→1
  column. Bento 6→4→2 columns; the `.cell.anchor` stays `span 4` and the funnel rows wrap.
  Match-card rows wrap their `.pct` under the `.col` on narrow widths.
- **Dark + light.** All color via tokens; the `.cell.anchor`'s tinted background uses
  `color-mix(in oklch, var(--teal) 8%, var(--surface))` so it resolves cleanly in both
  themes and inherits per-user Appearance accent overrides.
- **A11y.** One `<h1>` per page (the greeting). `<main>` + `<section>` landmarks per region.
  `.stat` numbers are real text. `.pill`s carry text labels (not color-only). Match-card
  Advance/Decline are real `<button>`s with explicit `aria-label="Advance <candidate name>"`.
  Touch targets ≥44×44. Contrast ≥4.5:1 body (`--ink-2` on `--bg`). Focus rings: `:focus-visible`
  uses `--teal` 2px / 4px halo. Reduced-motion paused for any pulsing dots.

## Acceptance

- Looks 1:1 like the per-screen Task 0 HTML AND the relevant slices of
  [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html). Side-by-side
  screenshot proof committed under `docs/brand/redesign-v3/verify/dashboard-recruiter-{light,dark}.jpeg`.
- `--filter @ip/company build` is green; `tsc --noEmit` is green; no console errors / warnings.
- **Zero functional diff.** Same `Analytics.GetFunnelAnalytics`, same mock→real KPI seam, same
  `Job.ListJobs`, same `OverrideGate` / `DecideApplication` handlers, same invalidations. Pure
  helpers (`dashboard-kpis.ts`) and their tests are unchanged.
- Empty states are truthful — no fabricated applicants, no fake "company highlights".
- Per-user Appearance flows through: switching `accent=coral` recolors `--teal`, `.cell.anchor`,
  ring fills, bar fills without a code change.
- A non-manager loading `/company` is still redirected by `CompanyShell`'s
  `useRequireRole(["recruiter","company_admin"])`.
