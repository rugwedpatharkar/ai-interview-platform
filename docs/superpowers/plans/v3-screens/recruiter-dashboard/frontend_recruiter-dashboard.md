# Frontend — `recruiter-dashboard` (Midnight v3)

> **Screen:** Recruiter dashboard — at-a-glance hiring · **Goal:** reskin the existing `/company` dashboard into the Midnight "Intelligence" shell (sidebar + topbar `.app`, KPI tiles, hiring-funnel meters, recent-jobs + needs-decision queue) **with zero behavior change** — same queries, same mock KPI seam, same handlers.
> **Unified route + role:** `/company` (signed-in **company/recruiter**; the `.app` shell under `/company/*`).
> **Mockup:** ✓ [`redesign-v2/dashboard-recruiter.html`](../../../../brand/redesign-v2/dashboard-recruiter.html) — **no Task 0**.
> **Existing code it reskins (exact paths):**
> - `frontend/apps/company/app/page.tsx` (server shell → `<RecruiterDashboard/>`)
> - `frontend/apps/company/app/dashboard.tsx` (`RecruiterDashboard`, `"use client"` body — KPI strip + funnel + recent jobs + `EmployerFirstRun`)
> - `frontend/apps/company/components/kpi-card.tsx` (`KpiCard` tile)
> - `frontend/apps/company/components/funnel-chart.tsx` (`FunnelChart`, shared with `/company/analytics`)
> - `frontend/apps/company/components/recent-jobs.tsx` (`RecentJobs` list)
> - `frontend/apps/company/app/dashboard-kpis.ts` (`makeMockKpis`/`formatPct`/`formatHours`/`kpiTone`) + `dashboard-types.ts`
> - BE contract: [`backend_recruiter-dashboard.md`](./backend_recruiter-dashboard.md) (restates [`../../v2-screens/recruiter-dashboard.md`](../../v2-screens/recruiter-dashboard.md)).

## Layout & components (shell → mockup region map)

**Shell:** the signed-in `.app` shell (`@ip/ui` `CompanyShell`) = `.app` grid (`248px 1fr`) → `.side` sidebar (`Hiring` / `Workspace` navlabels, `.navitem`s, `.foot` avatar) + `.main` → `.topbar` (crumb `Northwind Inc. / Dashboard` + `.searchbox` + Export `.btn-ghost.btn-sm` + `.avatar`) + `.content`.

| Mockup region | `@ip/ui` class / component | Existing component |
|---|---|---|
| Greeting + "100% answered" pill + **+ Post a job** | `.page-head` (`h2` Fraunces + `.sub`) · `.pill.pill-good` · `.btn.btn-primary` | `PageHeader` (title/description/action) |
| 4 KPI tiles (Open roles, Applicants this week, Interviews, Median response) | `.kpis` grid → `.kpi` (`.k-label` + `.k-val.tnum` + `.k-delta(.up/.down)`) | `KpiCard` → reskin to `.kpi` markup |
| Hiring funnel meters (Applied→Offer) | `.card` + `.card-head` (`h3` + `.badge` "Last 30 days") + `.funnel`/`.frow` (`.lbl`/`small`, `.bar.lg > i`, `.ct.tnum`) | `FunnelChart` (bar list → `.frow` meters) |
| Recent jobs list | `.card.tight` (`padding:0`) + `.jobrow` rows (`.t`/`.s`, `.nw` for "+N new", trailing `.pill`) | `RecentJobs` |
| **Needs your decision** queue | `.card.tight` + `.card-head` (`h3` + `.pill.pill-accent.tnum` count) + `.decrow` (`.who`/`.avatar`/`.nm`/`.sub` + `.acts` `.btn-sm`) | **(see Data wiring — derived from existing applicant data; advisory/no-ghosting surface)** |
| Two-column body | `.split` (`1fr 360px`, collapses `<1000px`) | grid in `dashboard.tsx` |

**New vs reused:** no new logic components. `KpiCard`/`FunnelChart`/`RecentJobs` keep their props + queries; only markup/classes change. The "Needs your decision" queue reuses the no-ghosting/advisory framing already present (see §Data wiring) — render-only.

## Data wiring (kept identical to today)

- **Seam:** `useAuth().api` (the generated `@ip/api-client`) via `useAuthedQuery(token, …)`.
- **Funnel:** `api.analytics.getFunnelAnalytics({})` — query key `["analytics","funnel"]` (shared/dedup'd with `/company/analytics`). Consumes `FunnelAnalytics.states[]` (`state`,`count`) + `total`/`conversionRate` — see [`backend_recruiter-dashboard.md`](./backend_recruiter-dashboard.md).
- **KPI strip:** `makeMockKpis()` → `NoGhostingKpisDTO` **today** (mock seam unchanged); after `Analytics.GetNoGhostingKpis` + `pnpm gen`, `api.analytics.getNoGhostingKpis({ windowDays: 30 })` (widen bigints `Number(...)`). Query key `["analytics","kpis",30]`.
- **Recent jobs:** `api.jobs.listJobs({})` → `.slice(0,5)` — query key `["jobs","recent"]`; rows `{ jobId, title, status }`.
- **Needs-decision queue:** derived render of applicants awaiting an outcome (the no-ghosting backlog) — **no new query**; Advance/Reject reuse the existing `Decision.OverrideGate` / `Decision.DecideApplication` handlers already wired in the pipeline. Kept identical — markup only.

## Tasks (bite-sized; reskin only — no logic change)

> Per-task: `npx pnpm@9.15.0 --filter @ip/company build` (+ `--filter @ip/ui typecheck` when touching `@ip/ui`) → browser-verify on the :4173 preview → explicit-path commit. **Mockup ✓ → skip Task 0.**

### Task 1: KPI tile → `.kpi`
- [ ] Reskin `KpiCard` (or its dashboard usage) to the mockup's `.kpi` markup: `.k-label` (icon + label), `.k-val.tnum` (value; unit in a muted `<span>` like `2.4d`), `.k-delta(.up)` (the delta line). Keep the `label`/`value`/`hint`/`tone`/`icon` props and the four call sites in `dashboard.tsx` **identical**.
- [ ] Verify: tiles match (Open roles `6 / +1 this week`, Applicants `42 / +18`, Interviews `54`, Median `2.4d / 100% answered`); `.kpis` grid is 4-up, 2-up `<1000px`. Commit `frontend/apps/company/components/kpi-card.tsx` + `app/dashboard.tsx`.

### Task 2: Hiring funnel → `.funnel` meters
- [ ] Reskin `FunnelChart` from the bar-`ul` to `.card` + `.card-head` (`h3` "Hiring funnel" + `.badge` "Last 30 days") + `.funnel` → `.frow` rows (`.lbl` + optional `small` sub e.g. "42% of applicants" / "advisory · you decide", `.bar.lg > i` width %, `.ct.tnum`). **Keep** the `sr-only` textual breakdown + `aria-hidden` on the visual meters (verbatim a11y). Same `{ data: FunnelAnalytics }` prop; `/company/analytics` still imports the same component (no divergence).
- [ ] Verify: rows render Applied→Offer with proportional bars + counts; `/company/analytics` funnel still identical. Commit `components/funnel-chart.tsx`.

### Task 3: Recent jobs → `.jobrow`
- [ ] Reskin `RecentJobs` to `.card.tight`(`padding:0`) + `.card-head` + `.jobrow` rows: `.t` title (Link to `/company/jobs/[id]`), `.s` sub (`<span class="tnum">N</span> applicants · <span class="nw tnum">+N new</span>`), trailing status `.pill` (`jobStatus(status)` → `.pill-good`/`.pill-warn`/`.pill-neutral`). Keep `["jobs","recent"]` query + `EmptyState` ("No jobs yet").
- [ ] Verify: 4-row list, hover bg, status pills correct; empty state on no jobs. Commit `components/recent-jobs.tsx`.

### Task 4: Needs-your-decision queue (render-only)
- [ ] Render the queue as `.card.tight` + `.card-head` (`h3` + `.pill.pill-accent.tnum` count) + `.decrow` rows: `.who` (`.avatar` initials + `.nm` + `.sub` "Score 91 · passed gate") + `.acts` (Advance `.btn-primary.btn-sm` / Reject `.btn-ghost.btn-sm`). Wire Advance/Reject to the **existing** decision handlers (no new RPC — see BE). Empty when none awaiting decision.
- [ ] Verify: queue lists awaiting-outcome applicants; Advance/Reject fire the same mutations as the pipeline. Commit `app/dashboard.tsx`.

### Task 5: Shell + page-head + two-column split
- [ ] Wrap the body in `CompanyShell` (`.app`+`.side`+`.topbar`); `PageHeader` → `.page-head` with the greeting `h2` + `.sub` + the "100% answered" `.pill.pill-good` + **+ Post a job** `.btn-primary` (Link `/company/jobs/new`). Arrange the two columns as `.split` (`1fr 360px`). Each region degrades independently (funnel `LoadingState`/`ErrorState`+retry; KPI tiles render immediately from mock/real).
- [ ] Verify build + preview at desktop and ~375px (KPIs stack, `.split` collapses); `/company` still auth+role gated by `CompanyShell` (no redirect). Screenshot. Commit `app/page.tsx` + `app/dashboard.tsx`.

## States & a11y
- **Loading:** funnel `LoadingState`; recent jobs skeleton/spinner — page never blocks on one query.
- **Empty:** recent jobs `EmptyState`; needs-decision queue hidden/"All caught up" when none.
- **Error:** funnel `ErrorState` + retry; KPI/recent failures degrade locally.
- **Success:** all four regions render from live funnel + listJobs + mock/real KPIs.
- **Responsive:** `.kpis` 4→2-up `<1000px`; `.split` `1fr 360px` → 1-col; readable at ~375px.
- **Dark + light:** tokens only (`--accent`, `--ink-*`, `--surface*`, `.pill-*`, `.k-delta.up/.down`) — no hardcoded color; `[data-theme]` + Appearance accent flow through.
- **A11y:** funnel keeps `sr-only` breakdown + `aria-hidden` meters; KPI tiles are text (label+value+hint); job rows + decision actions are real links/buttons; focus rings via `:focus-visible`; contrast ≥4.5:1.

## Acceptance
- Matches `redesign-v2/dashboard-recruiter.html`; `npx pnpm@9.15.0 --filter @ip/company build` + `--filter @ip/ui typecheck` green; **zero functional diff** (same queries, same mock-KPI seam, same Advance/Reject handlers, `/company` still gated, funnel still shared with `/company/analytics`); mock→real KPI path (`getNoGhostingKpis` after `pnpm gen`) unchanged.
