# Frontend — `jobs-list` (Midnight v3)

> **Screen:** Jobs list — the company's postings · **Goal:** reskin the existing `/company/jobs` list into the Midnight `.app` shell (sidebar + topbar, a `.table-wrap` data table of jobs with status `.pill`s + applicant counts) **with zero behavior change** — same `ListJobs` query, same status mapping, same Create-job link.
> **Unified route + role:** `/company/jobs` (signed-in **company/recruiter**; `.app` shell under `/company/*`).
> **Mockup:** ✗ — **Task 0 builds** [`redesign-v2/jobs-list.html`](../../../../brand/redesign-v2/jobs-list.html).
> **Existing code it reskins (exact paths):**
> - `frontend/apps/company/app/jobs/page.tsx` (`JobsPage` — `useAuthedQuery(["jobs"], listJobs)`, `STATUS_ICON`/`STATUS_HINT` maps, `jobStatus()` tones, Create-job `buttonVariants()` link, `AssistantChat`)
> - reuses `@ip/ui` `CompanyShell`, `PageHeader`, `Card`, `Badge`, `EmptyState`, `ErrorState`, `LoadingState`, `buttonVariants`, `jobStatus`
> - BE contract: [`backend_jobs-list.md`](./backend_jobs-list.md) (restates [`../../v2-screens/post-a-job.md`](../../v2-screens/post-a-job.md) — `Job` list).

## Layout & components (shell → mockup region map)

**Shell:** signed-in `.app` (`CompanyShell`) → `.side` (`Hiring`/`Workspace` navlabels, **Jobs & applicants** `.navitem[aria-current]`) + `.main` → `.topbar` (crumb `Northwind Inc. / Jobs` + `.searchbox` + `.avatar`) + `.content`.

| Region | `@ip/ui` class | Existing |
|---|---|---|
| Page head + **+ Post a job** | `.page-head` (`h2` + `.sub`) + `.btn.btn-primary` | `PageHeader` action → Link `/company/jobs/new` |
| Optional status filter chips (All/Open/Paused/Draft/Closed) | `.toolbar` + `.chip-toggle[aria-pressed]` | (render-only client filter over the same list; **no new query**) |
| Jobs table | `.table-wrap` + `table.data` (`thead th`, `tbody td`, hover) | the job rows |
| Job title cell + status hint | `.who`(`.nm`/`.sub`) — title + `STATUS_HINT` sub | `STATUS_HINT` map |
| Status cell | `.pill` via `jobStatus(status)` → `.pill-good`(published) / `.pill-warn`(paused) / `.pill-neutral`(draft/closed) | `jobStatus()` |
| Applicant count cell | `.tnum` numeric | applicant counts |
| Row action | `.btn-ghost.btn-sm` "View" → Link `/company/jobs/[id]` | row link |
| Empty / loading / error | `EmptyState` / `LoadingState` / `ErrorState` | existing branches |

**New vs reused:** no new logic. The status-filter chips (if added) are a pure client filter over the already-fetched `list` — render-only, no extra fetch. Everything else is markup/class swap.

## Data wiring (kept identical to today)
- **Seam:** `useAuth().api.jobs.listJobs({})` via `useAuthedQuery(token, { queryKey: ["jobs"], … })` — **unchanged**.
- Consumes `ListJobsResponse.jobs[]` = `{ jobId, title, status, ... }` + applicant counts — see [`backend_jobs-list.md`](./backend_jobs-list.md).
- `jobStatus(status)` (`@ip/ui`) → `{ label, tone }` drives the `.pill` class; `STATUS_HINT[status]` → the `.sub` line. Create-job link → `/company/jobs/new`. All identical; markup only changes.

## Tasks (bite-sized; reskin only)

### Task 0: Build the mockup (mockup ✗)
- [ ] Create `docs/brand/redesign-v2/jobs-list.html` against `tokens.css` + `app.css` (link both; `<html data-theme="dark">`). Reuse the **company sidebar** verbatim from `applicants-pipeline.html`/`dashboard-recruiter.html` (`Jobs & applicants` `aria-current`). Body = `.page-head` (`h2` "Jobs" + `.sub` + `.btn-primary` "+ Post a job"), a `.toolbar` of `.chip-toggle` status filters, and a `.table-wrap`/`table.data`: columns **Role · Status · Applicants · New · Posted · ·** with 5–6 sample rows mixing `published`/`paused`/`draft`/`closed` (status `.pill`s + `.tnum` counts + a `View` `.btn-ghost.btn-sm`). Screen-specific CSS in an inline `<style>` only (everything else from app.css).
- [ ] Browser-verify on the :4173 preview (desktop + ~375px). Commit `docs/brand/redesign-v2/jobs-list.html`.

### Task 1: Shell + page head
- [ ] Wrap `JobsPage` in `CompanyShell`; reskin `PageHeader` → `.page-head` (`h2` "Jobs" + `.sub` "Postings you've created for your company." + `.btn-primary` "+ Post a job" Link). Keep `AssistantChat` mount unchanged.
- [ ] Verify build; commit `app/jobs/page.tsx`.

### Task 2: Jobs table → `.table-wrap`
- [ ] Reskin the list to `.table-wrap` + `table.data`: `thead` (Role/Status/Applicants/New/Posted), `tbody` rows with `.who`(`.nm` title Link to `/company/jobs/[id]`, `.sub` = `STATUS_HINT[status]`), a status `.pill` via `jobStatus()`, `.tnum` applicant/new counts, posted date, and a trailing `View` `.btn-ghost.btn-sm`. Keep `LoadingState`/`EmptyState` ("No jobs yet — post a role to get started")/`ErrorState`+retry branches verbatim.
- [ ] Verify: rows render with correct status pills + counts; empty/loading/error all reachable. Commit `app/jobs/page.tsx`.

### Task 3 (optional): status filter chips (render-only)
- [ ] Add a `.toolbar` of `.chip-toggle[aria-pressed]` (All / Published / Paused / Draft / Closed) that filters the already-fetched `list` client-side (counts from `list`). **No new query.** Skip if it adds risk for Inc 0 — the table alone matches the spec.
- [ ] Verify + commit `app/jobs/page.tsx`.

## States & a11y
- **Loading:** `LoadingState` while `["jobs"]` fetches.
- **Empty:** `EmptyState` "No jobs yet" + CTA to `/company/jobs/new`.
- **Error:** `ErrorState` + retry on `listJobs` failure.
- **Success:** table of jobs with status pills + counts.
- **Responsive:** `table.data` scrolls/stacks under ~700px; chips wrap; readable at ~375px.
- **Dark + light:** tokens only (`.pill-*`, `--ink-*`, `--surface*`, `--line`) — no hardcoded color.
- **A11y:** semantic `<table>`; status pill carries text label (not color-only); title is a real link; `.chip-toggle` uses `aria-pressed`; focus rings via `:focus-visible`; contrast ≥4.5:1.

## Acceptance
- Matches `redesign-v2/jobs-list.html`; `npx pnpm@9.15.0 --filter @ip/company build` green; **zero functional diff** (same `ListJobs` query + key, same `jobStatus`/`STATUS_HINT` mapping, same Create-job + View links); no mock seam (list is live) so no mock→real change.
