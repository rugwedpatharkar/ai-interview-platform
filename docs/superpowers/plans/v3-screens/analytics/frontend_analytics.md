# Frontend — `analytics` (Midnight v3)

> **Screen:** Hiring analytics · **Goal:** reskin the existing analytics page to the **Midnight Intelligence** `.app` company shell — **KPI cards** (total applications, conversion-to-hire) over the hiring funnel rendered as **`.bar` meters** (no chart lib) — **reusing the existing `GetFunnelAnalytics` query verbatim** (presentational only, zero behavior change).
> **Unified route + role:** `/company/analytics` · company (`company_admin`/`recruiter`, manager-scoped). Mounted under the `.app` shell at `/company/*`.
> **Mockup:** ✗ → **build in Task 0** as `docs/brand/redesign-v2/analytics.html` (a `.kpis` strip of KPI cards + a funnel card of stacked `.bar > i` meters, one per `ApplicationState`, with counts).
> **Existing code it reskins:**
> - `frontend/apps/company/app/analytics/page.tsx` (the page: `useAuthedQuery(["analytics","funnel"])` → `FunnelView` summary cards + `FunnelChart`; empty-state when `total === 0`)
> - `frontend/apps/company/components/funnel-chart.tsx` (the per-stage bar list — `sr-only` text alternative + `aria-hidden` bar `ul`, one bar per `ApplicationState`)
> - `frontend/apps/company/components/company-shell.tsx` (the `.app` shell + `Analytics` nav entry — reskinned to Midnight)

## Layout & components
- **Shell:** the `.app` **sidebar + topbar** shell (`CompanyShell`). `Analytics` is the active `.navitem`. `.page-head` carries "Analytics" + sub "Your hiring funnel across all jobs."
- **KPI strip:** the two summary cards from today's `FunnelView` (Total applications = `Number(data.total)`; Conversion to hire = `Math.round(data.conversionRate * 100)%`) reskinned as `.kpis` → `.kpi` tiles (`.k-label`/`.k-val`, `--font-display` numerals). **Same values, same source** — no new metric.
- **Funnel card:** a `.card` rendering `FunnelChart` — one row per `data.states[]` entry: a stage label `.pill` + a `.bar` track with a `.bar > i` fill (`width: count/max * 100%`, `--accent`) + a right-aligned `.tnum` count. **No chart library** — pure CSS meters, exactly as today (the current bars are already `div`-based; this swaps Tailwind classes → `.bar`/`.bar > i` tokens).
- **New vs reused:** **no new components** — `CompanyShell`, `FunnelChart`, `Card*`, `EmptyState`, `ErrorState`, `LoadingState`, `PageHeader`, `applicationStatus` all reused; only token classes/markup change. (The summary cards become `.kpi` tiles — a class swap, not a new component.)

## Data wiring (kept identical to today)
- **Client/seam:** `useAuth().api.analytics.getFunnelAnalytics({})` — **already generated and live** (no mock seam for the funnel). `applicationStatus(state)` from `@ip/ui` for per-stage labels/tones.
- **TanStack query key:** `["analytics","funnel"]` (shared with the recruiter dashboard — same key, dedup'd).
- **Consumes** (`backend_analytics.md`): `FunnelAnalytics` — `total` (bigint, `Number(...)`), `conversionRate` (0..1), `states[]` (`{ state, count }`). **No field added or removed.** (The dashboard's `GetNoGhostingKpis` strip is **not** on this page — this page is funnel-only, as today.)

## Tasks (bite-sized; presentational only)
- [ ] **Task 0 — build the mockup.** Create `docs/brand/redesign-v2/analytics.html` against `tokens.css` + `app.css`: the `.app` shell with `Analytics` active, a `.page-head`, a `.kpis` strip (Total applications + Conversion to hire `.kpi` tiles), and a funnel `.card` of stacked `.bar` meters (one per stage: `.pill` label + `.bar > i` fill + `.tnum` count). Browser-verify on the `:4173` preview (dark **and** light). Commit `docs/brand/redesign-v2/analytics.html`.
- [ ] **Task 1 — wrap in the shell + reskin the KPI strip.** In `analytics/page.tsx`, keep `CompanyShell`/`PageHeader`/the `useAuthedQuery(["analytics","funnel"])` + the `total === 0` `EmptyState` branch **verbatim**; swap the two summary `Card`s → `.kpis`/`.kpi` tiles to match the mockup. **Do not touch** the query, the `Number(data.total)`/`conversionRate` math, or the empty/loading/error branches. Build + browser-verify `/company/analytics`; commit explicit path.
- [ ] **Task 2 — reskin `FunnelChart` to `.bar` meters.** Swap the per-stage row classes for `.pill` label + `.bar` track + `.bar > i` fill + `.tnum` count to match the mockup. Keep the `sr-only` textual breakdown, the `aria-hidden` `ul`, the `max`/`count` math, and `applicationStatus(s.state)` **verbatim**. Build + browser-verify the bars render proportionally; commit.

> **Restyle discipline:** the diff per file is markup/classes only. If a task touches the query, the `Number(...)` widening, the empty-state threshold, or the funnel math — **stop**, it's out of scope. No chart library is introduced — bars stay CSS `.bar`/`.bar > i`.

## States & a11y
- **States (preserved, named):** **loading** (`LoadingState` while `["analytics","funnel"]` resolves); **error** (`ErrorState` + retry); **empty** (`EmptyState` "No applications yet" when `Number(data.total) === 0`); **populated** (KPI tiles + funnel bars).
- **Responsive:** the `.kpis` strip is `md:grid-cols-2` (stacks at ~375px); the funnel bars are full-width rows; the bar label column is fixed-width and the track flexes.
- **Dark + light:** all tokens (`.bar`/`.bar > i` read `--surface-2`/`--accent`; `.kpi` reads `--surface`/`--ink`) — auto-themes.
- **A11y:** the funnel keeps its `sr-only` textual breakdown ("Applications by stage: …") + `aria-hidden` bars (lifted verbatim) — the bars carry no chart-only meaning; KPI tiles are plain label+value text; focus ring `--accent-strong`; contrast ≥4.5:1.

## Acceptance
- Matches `analytics.html`; build/typecheck green; **zero functional diff** (the same `GetFunnelAnalytics` query, the same total/conversion math, the same empty/loading/error branches); the funnel uses CSS `.bar` meters (no chart lib); the `FunnelChart` stays the **same shared component** also used by the recruiter dashboard.
