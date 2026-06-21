# Hiring analytics — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Rebuild the hiring-analytics surface at `/company/analytics` from scratch in the Aperture Pro
design language. The page is the manager's funnel + KPI workspace: a **funnel KPI strip** built
from `.stats-grid + .stat` cells across the top, a **conversion charts** row of `.cell` cards
underneath (funnel meter, response-time distribution, integrity volume), and a **time-range
filter** that scopes the windowed metrics (the funnel itself stays all-time; the no-ghosting KPIs
and integrity volume window with the range). The backend stays frozen — every existing
`AnalyticsService` RPC (`GetFunnelAnalytics`, `GetNoGhostingKpis`, and any integrity aggregate
already plumbed into the recruiter dashboard's Integrity Headlines cell) is reused verbatim, only
the UI is new. No chart library is introduced — bars stay CSS `.bar / .bar > i` meters from the
design language; numeric trends render as `.tnum` deltas, not as line/area charts.

## Route + role

`/company/analytics` (`apps/company/app/analytics/page.tsx`) · **company** — guarded by
`useRequireRole(["recruiter", "company_admin"])` (enforced inside `CompanyShell`; do not
re-implement). Non-managers are redirected by the shell before this page renders.

## Approved mockup (build to this exactly)

- **Live demo:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
  — the `.app` company shell, `.stats-grid + .stat` row, `.cell` bento, `.bars / .bar > .t > i`
  competency meters, `.pill-good / .pill-warn` status pills, mono `.tag` micro-labels.
- **Screenshots:** `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-{light,dark}-full.jpeg`.

There is no per-screen mockup yet — the design-language demo IS the reference. Task 0 below
captures the screen-specific composition (KPI strip + funnel card + supporting cells + range
filter) as a standalone HTML preview; the React build mirrors it 1:1.

## Existing code being REPLACED (not modified)

Delete-and-rebuild scope:

- `frontend/apps/company/app/analytics/page.tsx` — page body
- `frontend/apps/company/components/funnel-chart.tsx` — shared funnel component (rebuilt as a
  `.cell` with `.bars` rows; the recruiter dashboard's `<ActiveFunnel />` cell consumes the same
  new component, no fork)
- Any local rendering helpers under `apps/company/app/analytics/` that emit the v2/Midnight markup

What is **NOT** touched: the existing `dashboard-types.ts` (`NoGhostingKpisDTO` shape),
`apps/company/components/company-shell.tsx` (the `.app` shell + role gate),
`applicationStatus()` from `@ip/ui` (drives per-stage labels / tones), or any `*.proto` /
generated `@ip/api-client` types.

## Section spine — 6 regions, in order

Build each as its own component under `frontend/apps/company/components/analytics/`.

| # | Region | Component | Notes |
|---|---|---|---|
| 0 | App shell | `<CompanyShell>` (existing) | `.app` sidebar + topbar. Sidebar **Analytics** entry carries `aria-current="page"`. Topbar crumb = `<Company> / Analytics`. |
| 1 | Page head | `<AnalyticsHead />` | h1.display "Hiring analytics" + `.sub` ("Your funnel across every role, with the integrity signals that back each outcome."). Trailing **Time range** `<RangeFilter />` (chips: 7d / 30d / 90d). The chosen range scopes the windowed metrics; the funnel itself is all-time and labelled as such. |
| 2 | KPI strip | `<KpiStrip />` | `.stats-grid` (4 columns ≥1100px → 2 ≤760px) of `.stat` cells: **Total applications** (`Number(funnel.total)` · all-time · mono `.unit` "applicants") · **Conversion to hire** (`Math.round(funnel.conversionRate * 100) + "%"` · all-time) · **Outcome rate** (`Math.round(kpis.outcomeRate * 100) + "%"` · windowed) · **Median response** (`Math.round(kpis.medianResponseHours) + "h"` · windowed). Each `.stat` is Schibsted 700 display number + teal `.unit` + `.l` descriptive caption. |
| 3 | Funnel card | `<FunnelCard />` | One `.cell.anchor` (`span 8 ≥1100px`). `.tag` mono ("ALL TIME · YOUR APPLICATIONS"), h3 "Hiring funnel", then `.bars` rows — one `.bar` per `states[]` entry with: `.name` stage label + `.v` mono count + `.t > i` track fill (`width: count/max * 100%`, fill `--teal` via `applicationStatus(state).tone`). A trailing `.sub` line per row ("42% of applicants") shows the share of total. The card is the **same shared `<FunnelCard />` the recruiter dashboard's `<ActiveFunnel />` consumes** (one funnel source, no fork). |
| 4 | Response-time card | `<ResponseTimeCard />` | One `.cell` (`span 4 ≥1100px`). `.tag` mono ("WINDOWED · APPLY → FIRST ACTION"), h4 "Response time", then two compact stats: **Average** (`Math.round(kpis.avgResponseHours) + "h"`, `.tnum`) and **Median** (`Math.round(kpis.medianResponseHours) + "h"`, `.tnum`), with a single `.bar` track underneath showing the median against a target band ("Target: 24h" mono note on the right; the bar is full-width at 100% when median ≤ target, otherwise scaled). |
| 5 | Awaiting outcome card | `<AwaitingCard />` | One `.cell` (`span 6 ≥1100px`). `.tag` mono ("ANTI-GHOSTING BACKLOG"), h4 "Awaiting outcome", then a Schibsted 700 display number (`Number(kpis.openNoOutcome)`) + a `.sub` ("applicants waiting on a recruiter decision"). A trailing **Open the queue** `.btn.btn-primary.btn-sm` Links to `/company` (the dashboard's needs-decision cell). Empty (zero) shows the truthful "All caught up" state. |
| 6 | Integrity volume card | `<IntegrityVolumeCard />` | One `.cell` (`span 6 ≥1100px`). `.tag` mono ("PROCTORING · LAST <window>"), h4 "Integrity events", then 3 `.bar` rows: **Auto-ended (HIGH)** · **Fullscreen exits (MED)** · **Second-voice flags (MED)** with mono `.v` counts and a `.sub` note clarifying that auto-end is server-authoritative. Empty (no events) shows "No integrity events in the last <window>". |

Bento collapse rules (already in the design language): KPI strip 4 → 2 → 1; funnel + side cards
collapse from 8+4 to full-width stacks at the mid breakpoint; the awaiting + integrity cards
collapse from 6+6 to stacked full-width ≤760px. The funnel card stays the page's primary anchor.

## Layout & components — map to `@ip/ui` and tokens

Pull every primitive from `@ip/ui` per [`_design-language.md`](../_design-language.md).

| Region | Primitive (in `@ip/ui`) | Tokens |
|---|---|---|
| Shell | `CompanyShell` (existing) | already on the new tokens via the design-language Task 1 |
| Page head | `h1.display` + `.sub` + `<RangeFilter />` chip group | typography + chip tokens |
| Range filter | `.chip-toggle` (`role="group"` with `aria-pressed` per chip) | `--surface-2`, `--ink-2`; active chip uses `--teal-soft` + `--teal-ink` |
| KPI strip | `.stats-grid + .stat` | `--surface`, `--line`; `.stat .unit` teal mono; `.stat .l` `--ink-2` |
| Funnel card | `.cell.anchor` (teal-tinted gradient) | `--surface`, `--line`; rail `--surface-3`, fill `--teal` |
| `.bar` row | `.bars + .bar > .name + .v + .t > i` | rail `--surface-3`, fill `--teal`; `.name` `--ink`; `.v` mono `--ink-deep` |
| Side cards | `.cell` + `.cell.tight` | `--surface`, `--line` |
| Status pill | `.pill-good` / `.pill-warn` / `.pill` | semantic tokens — never `bg-emerald-*` raw |
| Mono micro-labels | `.tag` (Geist Mono, `--step--2`, `--ink-3`) | mono only — never decorative kickers |
| Display numbers | Schibsted 700 + teal `.unit` | `--font-display`; `.unit` color `--teal` |
| CTA chip | `.btn.btn-primary.btn-sm` | 32px height, 8px radius |

All new primitives live in `@ip/ui/src/app.css` (one shared file). No new tokens — everything
resolves through the resolved accent (`--teal`) and the resolved base palette. **No chart
library** — bars stay CSS `.bar / .bar > i`; numeric trends render as `.tnum` deltas, not as
line/area charts.

## Data wiring / seam

**Every existing query and handler is preserved verbatim. Nothing new.**

| Region | Hook | Query key | Source |
|---|---|---|---|
| Funnel | `useAuthedQuery(token, …, () => api.analytics.getFunnelAnalytics({}))` (widen `total` + `states[i].count` with `Number(...)`) | `["analytics","funnel"]` (dedup'd with the recruiter dashboard's `<ActiveFunnel />`) | `Analytics.GetFunnelAnalytics` (live today) |
| No-ghosting KPIs | `useAuthedQuery(token, …, () => kpiClient.getNoGhostingKpis({ windowDays }))` where `kpiClient = USE_MOCK_KPIS ? makeMockKpis() : realKpiClient(api)` (mock today; real after `pnpm gen`) → widen `openNoOutcome` + `totalApplicants` with `Number(...)` | `["analytics","kpis", windowDays]` | `Analytics.GetNoGhostingKpis` (mock today, real after `pnpm gen`) |
| Integrity volume | render-only over the same integrity aggregates the recruiter dashboard's Integrity Headlines cell already consumes; no new RPC on this page | `["analytics","integrity", windowDays]` (existing key) | `Analytics.*` aggregates (existing) |
| Range filter | local state `windowDays: 7 \| 30 \| 90` (default 30); chip selection updates the KPI + integrity query keys. The funnel is **all-time** and ignores the range. | n/a | derived |

**Range scoping invariant.** The funnel + the "Total applications" / "Conversion to hire" KPIs
are derived from `GetFunnelAnalytics` and are **all-time**. The "Outcome rate" / "Median response"
KPIs and the integrity-volume card are **windowed** via `windowDays`. The page must label the
windowed cards' `.tag` ("WINDOWED · LAST 30d") so recruiters never confuse the two scopes.

**Anti-fiction guard.** When the funnel returns `total = 0`, the funnel card renders the
truthful "No applications yet — your company has not received any applications. They'll show up
here as candidates apply." The KPI strip degrades to "—" placeholders with
`aria-label="No data yet"`. When `openNoOutcome = 0`, the awaiting-outcome card shows "All caught
up — no applicants awaiting a decision." When the integrity aggregates are all zero, the
integrity-volume card shows "No integrity events in the last <window>." **Never invent rows,
fake counts, or fabricated "company highlights."**

## Tasks (TDD-style, build → screenshot-verify → commit per task)

> **Task 0 — Build the per-screen mockup.** Create
> `docs/brand/redesign-v3/screens/analytics.html` linking `@ip/ui/src/{tokens.css,app.css}` and
> the SVG sprite. Embed the `.app` shell verbatim from the design language; build the page head +
> range filter + KPI strip + funnel card + 3 supporting cells with clearly-labelled "Sample"
> data. Verify in both themes at 1440×900 and 390×844 against
> `D-aperture-pro-{light,dark}-full.jpeg`. Commit the new HTML file only.

- **Task 1 — Shell + page head + range filter.** Mount the page under `CompanyShell`; render
  `<AnalyticsHead />` with the `<RangeFilter />` chip group (default 30d). The chip selection
  flows through to the KPI + integrity query keys via the page's `windowDays` state. Verify the
  chip group has correct `aria-pressed` semantics and respects keyboard nav. Commit
  `apps/company/app/analytics/page.tsx`,
  `apps/company/components/analytics/{analytics-head.tsx,range-filter.tsx}`.

- **Task 2 — KPI strip.** Build `<KpiStrip />` reading from `["analytics","funnel"]` +
  `["analytics","kpis", windowDays]`. Render 4 `.stat` cells (Total applications · Conversion ·
  Outcome rate · Median response) with display number + teal `.unit` + `.l` caption. Empty/error
  degrade to "—" placeholders with `aria-label="No data yet"`. Verify the strip collapses
  cleanly on mobile. Commit `apps/company/components/analytics/kpi-strip.tsx`.

- **Task 3 — Shared funnel card.** Build `<FunnelCard />` as a `.cell.anchor` reading from
  `["analytics","funnel"]`. Each `states[]` entry is a `.bar` row with `.name` (stage label via
  `applicationStatus(state)`), `.v` mono count, `.t > i` track fill (`width: count/max * 100%`).
  Preserve the existing `LoadingState` / truthful "No applications yet" empty / `ErrorState` +
  retry branches. The recruiter dashboard's `<ActiveFunnel />` consumes the **same** component —
  one funnel source, no fork. Verify the card collapses cleanly. Commit
  `apps/company/components/analytics/funnel-card.tsx`.

- **Task 4 — Response-time + Awaiting + Integrity cards.** Build `<ResponseTimeCard />`,
  `<AwaitingCard />`, and `<IntegrityVolumeCard />` per the spine table. Each card has its own
  loading / empty / error states (cards never block each other). Truthful empties: "No data yet"
  / "All caught up" / "No integrity events in the last <window>". Commit
  `apps/company/components/analytics/{response-time-card,awaiting-card,integrity-volume-card}.tsx`.

- **Task 5 — Page assembly + fidelity verify.**
  1. `apps/company/app/analytics/page.tsx` mounts `<Analytics />` inside `<CompanyShell>`.
  2. `--filter @ip/company build` + `--filter @ip/company exec tsc --noEmit` are green.
  3. Boot the dev server, sign in as a recruiter, screenshot `/company/analytics` in both themes
     at 1440×900 and 390×844 against the Task-0 HTML and the design-language reference. Iterate
     any divergence until 1:1. Commit verify shots under
     `docs/brand/redesign-v3/verify/analytics-{light,dark}.jpeg`.
  4. Confirm a non-manager is still redirected by `CompanyShell` — the role gate is unchanged.
  5. Confirm the `<FunnelCard />` is the same component the recruiter dashboard's
     `<ActiveFunnel />` consumes (one funnel source, no fork); confirm range chip changes
     re-fetch only the windowed cards (KPIs + integrity), not the funnel.

## States & a11y

- **States.** Each card loads / errors / empties **independently** — the page never blocks on
  one query.
  - **Loading** — KPI strip renders skeleton numbers (mock resolves synchronously, so no flash in
    dev); funnel renders skeleton bars; side cards render shimmer placeholders.
  - **Empty** — truthful copy per the anti-fiction guard above; no fabricated rows or counts.
  - **Error** — `ErrorState` + retry per card; KPI strip degrades to "—" with `aria-label="No
    data yet"`.
  - **Success** — every card renders from real data; range chip changes re-fetch only the
    windowed cards (KPIs + integrity), not the all-time funnel.
- **Responsive.** Sidebar collapses ≤1000px per the design language. KPI strip 4 → 2 → 1; funnel
  + response-time 8+4 → stacked at the mid breakpoint; awaiting + integrity 6+6 → stacked at the
  mid breakpoint → full-bleed ≤760px.
- **Dark + light.** All color via tokens; bar fills, `.stat .unit` color, chip highlights, and
  `.cell.anchor` tint resolve cleanly in both themes and inherit per-user Appearance accent
  overrides.
- **A11y.** One `<h1>` per page (the head). `<main>` + `<section>` landmarks per region. The
  range filter is a `role="group"` with `aria-label="Time range"` and `aria-pressed` per chip.
  `.stat` numbers are real text. `.pill`s carry text labels (not color-only). The funnel
  preserves the existing `sr-only` textual breakdown ("Applications by stage: applied 124, phone
  68, interview 41, offer 12, hired 6") with `aria-hidden` bars — the bars carry no chart-only
  meaning. Touch targets ≥44×44. Contrast ≥4.5:1 body (`--ink-2` on `--bg`). Focus rings:
  `:focus-visible` uses `--teal` 2px / 4px halo.

## Acceptance

- Looks 1:1 like the per-screen Task 0 HTML AND the relevant slices of
  [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html). Side-by-side
  screenshot proof committed under
  `docs/brand/redesign-v3/verify/analytics-{light,dark}.jpeg`.
- `--filter @ip/company build` is green; `tsc --noEmit` is green; no console errors / warnings.
- **Zero functional diff.** Same `Analytics.GetFunnelAnalytics` (live), same mock→real KPI seam
  (`makeMockKpis()` → `api.analytics.getNoGhostingKpis` after `pnpm gen`), same
  `["analytics","funnel"]` / `["analytics","kpis", windowDays]` query keys, same `Number(...)`
  widening, same `applicationStatus()` rendering. The `<FunnelCard />` is the **same** component
  the recruiter dashboard's `<ActiveFunnel />` consumes (one funnel source, no fork).
- No chart library is introduced — bars stay CSS `.bar / .bar > i`; numeric trends render as
  `.tnum` deltas.
- Empty states are truthful — no fabricated counts, no fake "company highlights".
- Per-user Appearance flows through: switching `accent=coral` recolors `--teal`, the
  `.cell.anchor` tint, bar fills, and chip highlights without a code change.
- A non-manager loading `/company/analytics` is still redirected by `CompanyShell`'s
  `useRequireRole(["recruiter","company_admin"])`.
