# Candidate dashboard — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Authenticated candidate "home" — the application tracker + recommendations surface a candidate lands on after sign-in. Rebuild the screen from scratch inside the **Aperture Pro** app shell (`.app` sidebar + topbar) so it looks 1:1 like the design-language demo for any informational/data surface: bento `.cell` cards, `.kpi` stats, `.ring` for match-percent, `.bar` for funnel-stage progress, `.match > .card` for ranked recommendation rows. **The data layer is FROZEN** — the 10-second conditional `["applications"]` poll, the `apply` form, the `withdrawApplication` confirm flow, and `recommendations.getCandidateRecommendations` all continue to operate byte-for-byte as they do today; only the UI is new.

## Route + role

`/` (signed-in branch of `apps/candidate/app/page.tsx`) · **candidate**. The signed-out branch is owned by [`../landing/frontend_landing.md`](../landing/frontend_landing.md). The role-routing logic (`useRequireAuth()` → candidate dashboard vs. recruiter dashboard vs. signed-out landing) is **untouched**.

## Approved mockup (build to this exactly)

- **Reference demo:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html) — embodies the full design system at one altitude. The dashboard uses the same tokens, type scale, primitives (`.cell`, `.kpi`/`.stats-grid`, `.ring`, `.bar`, `.match`, `.pill-*`, `.status`, `.btn-*`), motion vocabulary, and rhythm.
- **No per-screen mockup file yet.** Build directly against the design language doc and the demo's primitives. Task 0 produces a side-by-side fidelity screenshot.

## Existing code being REPLACED (not modified)

Assume these will be rewritten from scratch:

- `frontend/apps/candidate/app/page.tsx` — signed-in candidate branch (new shell + new layout).
- `frontend/apps/candidate/components/dashboard.tsx` — markup rebuilt; the data layer (queries, mutations, conditional poll, apply form, withdraw confirm dialog) is **lifted verbatim** into the new component file.
- `frontend/apps/candidate/components/application-card.tsx` — replaced by a new `.cell`-based row primitive (or in-cell list rows) consuming the same `Application` shape.
- `frontend/apps/candidate/components/recommended-roles.tsx` — replaced by a new `.match`-list inside an Aperture cell consuming the same `Match` shape.
- `frontend/apps/candidate/lib/funnel.ts` — `funnelStage` / `FUNNEL_STEPS` are pure mappings; **kept unchanged** and consumed by the new markup.

The candidate-shell sidebar + topbar components (new, shared) live in `@ip/ui` and are introduced by the landing rebuild's `Task 1` (design-system migration); this screen consumes them.

## Layout & components

**Shell:** `.app` sidebar + topbar (Aperture Pro app shell, candidate audience).

| Region | Markup / class | Notes |
|---|---|---|
| Sidebar | `.app > .side` | Brand mark (aperture symbol) at top; nav groups with `.navlabel` group headings ("For you" / "Prepare" / "Account") + `.navitem` rows (Dashboard `aria-current="page"`, Jobs, Saved, Alerts, Applications, Practice, Messages, Profile, Settings). Foot region holds the avatar + signed-in name in a `.who`-style row. Sidebar collapses to a drawer ≤ 760px (see States & a11y). |
| Topbar | `.topbar` | Left: `.crumb` "Home / Dashboard". Right: `.toolbar` containing the **audience indicator** (a `.pill` "Candidate"), a `.searchbox` (placeholder "Search jobs, companies…", submits → `/jobs?q=`), the notification bell (`NotificationBell` from `@ip/ui` — owned by [`../notifications/frontend_notifications.md`](../notifications/frontend_notifications.md)), and the avatar. |
| Page head | `.page-head` | `<h1 class="display">Welcome back, {firstName}</h1>` (Schibsted 700, `--step-3`) + `.sub` greeting line ("Here's where every active conversation stands."). Right side: `.status` pill ("Live · auto-refreshing every 10s" when the poll is active; coral dot when an interview is `interview_pending`) + a `.btn-primary` "Find roles →" → `/jobs`. |
| KPI strip | `.stats-grid` (4 columns) → `.stat` ×4 | Derived **client-side** from the existing `applications` array (no new fetch): *Active applications* (count of non-terminal states), *Interviews scheduled* (`interview_pending`), *Responses received* (`scored` + `shortlisted`), *Total submitted* (lifetime). Each `.stat` is `.n` (display number, Schibsted 700) + `.l` (label, ≤24ch). Uses `--teal` accent on a `.unit` suffix when relevant ("3 / 12" etc.). |
| Body — anchor | `.cell.anchor` (`grid-column: span 4; grid-row: span 2`) — **Applications tracker** | Header row: `<h3>Your applications</h3>` + a `.pill-teal` "Live" status (mirrors the conditional 10s poll state) + a `.tag` micro-label ("`APPLICATIONS · {n}`"). Body: a vertically stacked list of `.cell-row` items (one per `Application`) — each row shows `.role` + `.co` (or `Job {jobId}` when `jobTitle`/`companyName` is absent), the funnel position via a `.bar` (5px height, `width: i/FUNNEL_STEPS.length`, `--teal` fill) with the stage label in mono to the right (`.bar .v`), an `applicationStatus(state)` `.pill-*` (`.pill-teal` / `.pill-good` / `.pill-warn` / `.pill-danger` per state class), and a `.toolbar` of inline actions (`Take test` for `aptitude_pending`, `Start interview` for `interview_pending`, `Withdraw` (ghost) for non-terminal). Empty branch: a friendly `.cell-empty` block ("You haven't applied yet — browse roles to start") + the existing apply form inline (`<form>` with job-id input + consent toggle + `.btn-primary` "Submit application"). |
| Body — c1 | `.cell.c1` (`grid-column: span 2`) — **Up next** | Renders only when there is at least one `interview_pending` / `interview_in_progress` app. Shows the role + company, the join window (`.tnum` time), and a `.btn-primary` "Join interview →" → `/interview/{applicationId}`. A `.badge` ("Proctored · camera + mic required") makes the strict-proctored invariant visible. |
| Body — c2 | `.cell.c2` (`grid-column: span 2; grid-row: span 2`) — **Recommended for you** | `<h3>Recommended roles</h3>` + `.match` container of `.match > .card` rows. Each row: a circular `.av` initial chip (company initial), `.col > b` (role title) + `.col > span` (company · location), and a `.ring` (`--pct: score`) showing the match percentage. Reasons appear below the row in a `.cell-visual` mono mini-list (`.k` = reason kind, `.v` = reason value). Click navigates to `/jobs/{jobId}`. Empty branch: "We'll line these up once you've applied." |
| Body — c3 | `.cell.c3` (`grid-column: span 3`) — **Practice CTA** | One-paragraph copy ("Warm up before a live interview. Same proctoring stack, no record kept.") + `.btn-coral` "Start a practice run" → `/practice`. The coral accent is the "candidate" semantic. |
| Body — c4 | `.cell.c4` (`grid-column: span 3`) — **Recent activity / signals** | Compact 3-row stack: latest funnel transition, latest message (deep-link to `/messages/{applicationId}`), latest report-ready event (deep-link to `/reports/{applicationId}`). Each row uses a small lucide icon chip + `.nm` + `.sub` (relative time). Derived from the already-fetched applications (no new fetch); empty branch: "Nothing new today — we'll let you know." |

> **Primitives reference (do NOT redefine):** `.app · .side · .navlabel · .navitem · .topbar · .crumb · .toolbar · .searchbox · .pill · .pill-{teal,good,warn,danger,coral} · .status · .stats-grid · .stat · .cell · .cell.anchor · .cell.{c1,c2,c3,c4} · .bar · .bars · .ring · .match · .badge · .btn · .btn-{primary,ghost,coral,sm} · .tnum` — all defined in `@ip/ui/src/app.css` per the [design language](../_design-language.md). Tokens via `@ip/ui/src/tokens.css`.

**New presentational pieces to build:** `.cell-row` (in-cell list row with bar + pill + actions) and `.cell-empty` (cell-internal empty state) — both compose from existing primitives (`--surface-2`, `--line`, `--ink-2`, `.bar`, `.pill`, `.btn`) and live in `app.css` next to the existing primitives.

## Data wiring / seam (FROZEN — preserve every existing seam)

- **Client/seam:** `useAuth().api.applications.*` and `useAuth().api.recommendations.*` over the existing protobuf-es gRPC-web client. **Unchanged.** Do not introduce new clients or new query files.
- **Query keys (unchanged):**
  - `["applications"]` — `applications.listMyApplications({})`, with the existing **conditional `refetchInterval` 10s poll** gated on `applications.some(a => !TERMINAL_STATES.has(a.state))`. The poll idles automatically once every application is terminal. **Do not touch the query config.**
  - `["recommendations"]` — `recommendations.getCandidateRecommendations({})`.
- **Mutations (unchanged):**
  - `applications.apply({ jobId, consent })` — the existing apply form invalidates `["applications"]` + `["recommendations"]`.
  - `applications.withdrawApplication({ applicationId })` — gated by the existing `ConfirmDialog`; same invalidations.
- **Fields consumed** (per [`backend_candidate-dashboard.md`](./backend_candidate-dashboard.md)):
  - `Application`: `applicationId`, `jobId`, `state` (funnel vocabulary), optional `jobTitle` / `companyName` (render-if-present → falls back to `Job {jobId}`).
  - `Match`: `jobId`, `score` (0–100 → `--pct` for `.ring`), `reasons: string[]` (→ `.cell-visual` mono rows).
- **Client-derived (no new RPC):** the 4 KPI counts, the "up next" pick (first `interview_pending` / `interview_in_progress`), the funnel-step index (`funnelStage(state)`), and the recent-activity rows are all pure functions of the already-fetched `applications` array. The "Find roles" CTA and recommendation row clicks navigate via `router.push("/jobs")` / `router.push("/jobs/{jobId}")` — no fetch.

## Tasks

> **Task 0 — Fidelity baseline.** Confirm the design-language doc and the live demo are loaded in the launch-preview panel. Take a reference screenshot of the Aperture Pro demo at 1440×900 (light + dark) into `docs/brand/redesign-v3/verify/dashboard-{light,dark}-reference.jpeg`. The dashboard build will be screenshot-diffed against the design-language primitives in Task 5.

- **Task 1 — Candidate app shell scaffolding.** In `frontend/apps/candidate/app/page.tsx`, render `<CandidateShell />` (from `@ip/ui`, introduced by the landing/design-system task) for the authed branch, with the sidebar nav slot populated for the candidate audience (Dashboard, Jobs, Saved, Alerts, Applications, Practice, Messages, Profile, Settings) and `aria-current="page"` on Dashboard. The topbar mounts the `.crumb`, audience pill, searchbox, `NotificationBell`, and avatar. The signed-out branch continues to render `<Landing />`. Verify the shell renders empty content (no regression on the existing dashboard render). Commit `apps/candidate/app/page.tsx` only.
- **Task 2 — `<Dashboard />` rebuild — header + KPI strip.** Lift the existing data layer (queries, mutations, poll, apply form, confirm dialog) into the new `apps/candidate/components/dashboard.tsx` verbatim; rebuild the markup from scratch using `.page-head` + the `.stats-grid`/`.stat` strip. The KPI tiles are derived **client-side** from the existing `applications` array. Verify: the strip resolves identical numbers to what the old debug bar showed; the greeting reads the resolved candidate name; the `.status` pill correctly reflects "Live" vs idle. Commit `apps/candidate/components/dashboard.tsx`.
- **Task 3 — Applications anchor cell + tracker rows.** Build the `.cell.anchor` containing the application list; rewrite the row markup as `.cell-row` (avatar/initial + role/co + `.bar` funnel + `.pill-*` state + action `.toolbar`). Wire the stage-specific actions (`Take test`, `Start interview`, `Withdraw`) to the existing handlers; keep the `ConfirmDialog` for withdraw. Preserve loading (skeleton rows inside the cell), empty (apply form inline), and error (in-cell `ErrorState` + retry) branches. Verify the 10s poll continues to fire while any application is non-terminal (network tab) and idles when all terminal. Commit `apps/candidate/components/dashboard.tsx` + the new in-cell row primitives in `@ip/ui/src/app.css`.
- **Task 4 — Up next / Recommended / Practice / Activity cells.** Build the `.cell.c1` (up next) — render only when an interview-stage application exists, and the `.cell.c2` (recommended) using the `.match > .card` primitive with a `.ring` per row. Build the `.cell.c3` (practice CTA) and `.cell.c4` (recent activity) as derived presentational cells. Verify recommendation rows navigate to `/jobs/{jobId}` and the practice CTA navigates to `/practice`. Commit the dashboard component + any new shared primitives.
- **Task 5 — Full assembly + fidelity verify.**
  1. `--filter @ip/candidate build` is green; `--filter @ip/candidate exec tsc --noEmit` is green.
  2. Run the dev server, sign in as a candidate seeded with mixed-stage applications.
  3. Screenshot at 1440×900 in both themes; visually diff against the Aperture Pro demo's `.cell`/`.stats-grid`/`.match`/`.ring` primitives; iterate until the dashboard reads as "the same product" as the landing.
  4. Confirm: the 10s poll fires for non-terminal apps and idles otherwise; the apply form submission invalidates both query keys; the withdraw confirm dialog still gates the destructive mutation; recommendation rows deep-link correctly.
  5. Save final screenshots to `docs/brand/redesign-v3/verify/dashboard-{light,dark}.jpeg`.

## States & a11y

- **States (all preserved):**
  - **Loading** — `LoadingState` inside the anchor cell; KPI strip shows `.skeleton-stat` placeholders.
  - **Empty (no applications)** — anchor cell shows a friendly `.cell-empty` block + the inline apply form; the up-next / recent-activity cells render their own empty copy ("Nothing scheduled" / "Nothing new today"); recommendations render their existing empty branch.
  - **Error** — anchor cell shows the existing `ErrorState` + retry; KPI strip falls back to dashes; other cells render empty copy.
  - **Success** — full bento layout. The live 10s poll fires only while any application is non-terminal (per the existing gate); the `.status` pill reflects "Live" while the poll is active and "Idle" otherwise (no extra fetch — the gate is the same boolean).
  - **Apply busy** — apply button shows the existing `inFlight` latch; form is disabled until the mutation settles.
  - **Withdraw confirm** — existing `ConfirmDialog` (keyboard accessible, focus-trapped); the action only fires after explicit confirm.
- **Responsive:**
  - ≥ 1100px — full sidebar + topbar; bento layout: anchor cell spans 4 cols, c1/c2 (right) spans 2 cols each, c3/c4 (bottom) spans 3 cols each.
  - 760–1099px — sidebar narrows; bento collapses to 4-column grid (anchor full width, c1/c2 side-by-side, c3/c4 side-by-side).
  - ≤ 760px — sidebar collapses to a drawer behind a hamburger button in the topbar (`<details>`-style, focus-trapped when open); bento stacks to a single column; KPI strip becomes 2×2 per the design language (`stats-grid` mobile rule).
- **Dark + light:** all colors via tokens; the `.ring` fill is `--teal` (resolves to the per-user accent); the `.bar` fill is `--teal`; `.pill-*` use the semantic token swatches.
- **Reduced motion:** `prefers-reduced-motion: reduce` disables the `.status.live .dot` pulse and any `.rise` reveal — content remains visible.
- **A11y:**
  - One `<h1>` per page (the greeting); the anchor cell uses `<h3>` and labelled regions (`aria-labelledby`).
  - `aria-current="page"` on the active sidebar nav.
  - Each `.cell-row` is an `<article>` with `aria-label="{role} at {company} — {state label}"`.
  - The `.bar` carries `role="progressbar"` with `aria-valuemin/max/now` + a text label.
  - The `.ring` carries `aria-label="Match {pct} percent"`.
  - All status pills carry text labels (not color-only).
  - The audience pill in the topbar is labelled "Audience: Candidate".
  - Focus rings via tokens (`--teal` 2px outline + 4px halo); touch targets ≥ 44×44; body contrast ≥ 4.5:1.

## Acceptance

- The dashboard reads as the same product as the Aperture Pro landing — same tokens, same type scale, same primitives (`.cell` / `.stats-grid` / `.bar` / `.ring` / `.match` / `.pill-*` / `.status`). Side-by-side screenshot proof committed at `docs/brand/redesign-v3/verify/dashboard-{light,dark}.jpeg`.
- `--filter @ip/candidate build` is green; `tsc --noEmit` is green; no console errors / warnings on the rendered page; reduced-motion is honored.
- **Zero functional diff vs. today:** same `applications.listMyApplications` / `apply` / `withdrawApplication` and `recommendations.getCandidateRecommendations`; same `["applications"]` / `["recommendations"]` query keys; same `TERMINAL_STATES`-gated 10s `refetchInterval`; same `funnelStage` mapping; same apply/withdraw flows.
- The `.status` pill ("Live" vs "Idle") reflects the existing poll-gate boolean — no new state machinery introduced.
- Strict-proctored invariants are visible in the up-next cell ("camera + mic required" badge); no UI control introduced that would violate them.
- Pre-launch posture is preserved: no fabricated company names in empty states (use "Sample employer" or generic "Job {jobId}" fallback when contract fields are absent); no fake metrics in the KPI strip (all numbers are real derivations of the candidate's own data).
