# Aptura v3 (Midnight) — Per-Page Implementation Plans · Index

> **What this is.** The detailed expansion of the umbrella v3 plan's **Phase D** ("port each screen") into
> **one folder per page**, each holding a **frontend plan** + a **backend plan**. The redesign is
> **appearance-only (zero behavior change)**; the backend plan documents the contract the page consumes so
> implementation is self-contained.

## Folder structure (per page)

```
docs/superpowers/plans/v3-screens/
  _index.md                       ← this spine
  <page-slug>/
    frontend_<page-slug>.md       ← detailed FE implementation plan (new Midnight UI)
    backend_<page-slug>.md        ← functionalities, gRPC/RPCs, request/response structures, data required
```

34 page folders × 2 files = **68 plan files** + this index. When implementing a page, open its folder: build the
backend per `backend_<slug>.md`, build the frontend per `frontend_<slug>.md` (against a mock until the BE lands).

## Prerequisites (assumed by every page)

- **Single-app unification** — `../2026-06-20-aptura-single-app-unification.md` (one URL; company under `/company/*`).
- **Design system in `@ip/ui`** + per-user **Appearance** (theme `system|light|dark` default device, base, accent)
  — umbrella v3 plan `../2026-06-20-v3-redesign-and-appearance.md` Phases A–C.
- Visual source of truth: `../../brand/redesign-v2/*.html` mockups + `tokens.css` + `app.css`.
- **Execution gating:** screen work waits for the unification + the parallel session's `frontend/` edits to land.

## Shared `@ip/ui` component classes (from `redesign-v2/app.css`) — reference, don't redefine

Shell: `.app · .side · .side .brand · .navlabel · .navitem · .main · .topbar · .content · .page-head`
Buttons/inputs: `.btn · .btn-primary · .btn-ghost · .btn-sm · .input · .searchbox`
Containers: `.card · .card.tight · .card-head` · Data: `.kpis · .kpi · .k-label · .k-val · .k-delta(.up/.down)`
Pills/badges: `.pill(.pill-neutral/-accent/-good/-warn/-bad) · .badge` · Table: `.table-wrap · table.data · .tnum · .who(.nm/.sub)`
Viz: `.ring · .bar(> i)` · Controls: `.tabs · .toolbar · .chip-toggle` · `.avatar`
Tokens: `--bg/--surface/--surface-2/--ink/--ink-2/--ink-3/--line/--line-2/--accent/--accent-strong/--accent-soft/--accent-ink`,
`--font-display(Fraunces)/--font-sans(Geist)/--font-mono(Geist Mono)`, `--step-* --sp-* --r-* --z-* --dur-* --ease-*`.

## `frontend_<slug>.md` template (every FE plan follows this)

- **Header** — screen name + goal; **unified route(s) + role**; **mockup:** `redesign-v2/<file>.html` (or "build in
  Task 0"); **existing code** it reskins (real `page.tsx` + components, exact paths).
- **Layout & components** — which shell (`.app` sidebar+topbar / marketing / auth split-panel) and which `@ip/ui`
  classes/components map to each region; new vs reused components.
- **Data wiring** — the client/seam it calls (`useAuth().api.<svc>` or the typed mock client), TanStack query keys,
  and the `backend_<slug>.md` fields it consumes — **kept identical to today** (markup/classes only change).
- **Tasks (bite-sized, TDD where logic exists):**
  - **Task 0** (only if mockup ✗): build `docs/brand/redesign-v2/<slug>.html` against `tokens.css`+`app.css`,
    browser-verify on the :4173 preview, commit.
  - **Tasks 1..N:** wrap in the shell, swap ad-hoc Tailwind colors → token component classes to match the mockup,
    keep all handlers/queries identical; per-task build + browser-verify + explicit-path commit.
- **States & a11y** — loading/empty/error/success (named); responsive breakpoints; **dark + light** (reads
  `--accent`/base vars, no hardcoded color); focus rings, semantic HTML, contrast ≥4.5:1.
- **Acceptance** — matches the mockup; build/typecheck green; **zero functional diff**; mock→real path unchanged.

## `backend_<slug>.md` template (every BE plan follows this)

- **Header** — screen name; the FE consumer (`frontend_<slug>.md`); **Status:** `EXISTING — reuse v2` (or `NEW`),
  citing the source `../v2-screens/<doc>.md`; **real-vs-mock today** (e.g. SearchJobs/SavedJobs live; rest mock).
- **Functionalities** — bullet list of what the backend must provide for this page (verbs: list, get, create, …).
- **Service & RPCs** — the gRPC service + method signatures (`admin.<svc>.v1.<Service>` / ai-agents REST), one per
  function, with auth/scope (role, tenant) noted.
- **Request / Response structures** — the message/JSON shape for each RPC (field names + types, camelCase per
  protobuf-es on the FE side), including the **FE mock shape** the screen codes against before the RPC lands.
- **Data required** — collections/fields read or written (Mongo), derived/aggregated values, indexes if relevant.
- **Errors & edge cases** — status codes (NOT_FOUND/PERMISSION_DENIED/INVALID_ARGUMENT/UNAVAILABLE), empty states.
- **Cross-references** — the `../v2-screens/<doc>.md` contract this restates; any shared event/enum (e.g.
  `ApplicationState`, `aptitude.graded`).

## The 34 pages — folder slug · route · role · mockup (✓ exists / ✗ build) · BE source (`../v2-screens/…`)

| # | Folder slug | Unified route | Role | Mockup | Backend source |
|---|---|---|---|---|---|
| 1 | `landing` | `/` (signed-out) | public | ✓ `landing.html` | `landing.md` (+ live `discovery.searchJobs`) |
| 2 | `marketplace-search` | `/jobs` | public | ✓ `marketplace.html` | `marketplace-search.md` — **live** `/public/jobs` |
| 3 | `job-detail` | `/jobs/[id]` | public | ✗ | `job-detail.md` — `GetPublicJobDetail` |
| 4 | `company-profile` | `/companies/[id]` | public | ✗ | `company-profile.md` — `CompanyProfileService` |
| 5 | `login` | `/login` | auth | ✗ | `auth.md` — `Auth.login` |
| 6 | `register-candidate` | `/register` | auth | ✗ | `auth.md` — `registerCandidate` |
| 7 | `register-company` | `/company/register` | auth | ✗ | `auth.md` — `registerCompany` |
| 8 | `forgot-password` | `/forgot` | auth | ✗ | `auth.md` |
| 9 | `reset-password` | `/reset` | auth | ✗ | `auth.md` |
| 10 | `verify-email` | `/verify` | auth | ✗ | `auth.md` |
| 11 | `auth-callback` | `/auth/callback` | auth | ✗ | `auth.md` (SSO hash → JWT, spinner) |
| 12 | `candidate-dashboard` | `/` (signed-in) | candidate | ✓ `dashboard-candidate.html` | `candidate-dashboard.md` + `onboarding.md` |
| 13 | `candidate-profile` | `/profile` | candidate | ✗ | `candidate-profile.md` |
| 14 | `saved-jobs` | `/saved` | candidate | ✗ | `saved-jobs.md` — **live** `savedJobs.*` |
| 15 | `job-alerts` | `/alerts` | candidate | ✗ | `job-alerts.md` — `JobAlertsService` |
| 16 | `messaging-inbox` | `/messages` · `/company/messages` | both | ✗ | `messaging.md` — `MessagingService` |
| 17 | `message-thread` | `/messages/[applicationId]` | both | ✗ | `messaging.md` |
| 18 | `notifications` | `/notifications` · `/company/notifications` | both | ✗ | `notifications.md` — `NotificationService` |
| 19 | `scheduling` | `/schedule` | candidate | ✗ | `scheduling.md` — `SchedulingService` |
| 20 | `practice` | `/practice` | candidate | ✗ | `practice-feedback.md` — ai-agents practice REST |
| 21 | `practice-feedback` | `/feedback/[id]` | candidate | ✗ | `practice-feedback.md` |
| 22 | `coding-assessment` | `/aptitude/[applicationId]` | candidate | ✗ | `coding-assessment.md` — `Aptitude` + `run_code` |
| 23 | `proctored-interview` | `/interview/[applicationId]` | candidate | ✗ | `proctored-interview.md` — interview gRPC + auto-gate |
| 24 | `settings` | `/settings` · `/company/settings` | both | ✗ | `settings-security.md` **+ NEW** `PreferencesService` (Appearance) |
| 25 | `recruiter-dashboard` | `/company` | company | ✓ `dashboard-recruiter.html` | `recruiter-dashboard.md` |
| 26 | `jobs-list` | `/company/jobs` | company | ✗ | `post-a-job.md` — `Job` list |
| 27 | `post-a-job` | `/company/jobs/new` | company | ✗ | `post-a-job.md` — `Job`+`UpdateJob`+`gate_mode`, `jd.improveJd` |
| 28 | `job-pipeline` | `/company/jobs/[id]` | company | ✓ `applicants-pipeline.html` | `applicants-pipeline.md` |
| 29 | `applicant-report` | `/company/jobs/[id]/applicants/[appId]` | company | ✓ `candidate-report.html` | `candidate-report.md` — `Report.GetIntegrityTimeline` |
| 30 | `talent-sourcing` | `/company/talent` | company | ✗ | `talent-sourcing.md` — `SourcingService` |
| 31 | `company-branding` | `/company/branding` | company | ✗ | `company-branding.md` |
| 32 | `team-permissions` | `/company/team` | company | ✗ | `team-permissions.md` — `TeamService` |
| 33 | `analytics` | `/company/analytics` | company | ✗ | `recruiter-dashboard.md` — Analytics funnel KPIs |
| 34 | `rubrics` | `/company/rubrics` | company | ✗ | existing admin Aptitude/rubric service (no v2 doc) |

## Build order (waves)

marketing (1–4) → auth (5–11) → dashboards (12, 25) → marketplace cluster (3, 4, 14, 15) → interview/coding/report
(22, 23, 28, 29) → messaging/notifications (16, 17, 18) → settings + appearance (24) → company ops (26, 27, 30–34)
→ practice/scheduling (19, 20, 21). The 6 mockup-✓ folders skip Task 0.
