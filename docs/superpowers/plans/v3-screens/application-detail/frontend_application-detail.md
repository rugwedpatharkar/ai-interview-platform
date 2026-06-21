# Application detail — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Per-application detail surface for a candidate — the "what's happening with this application"
view that the dashboard tracker row deep-links into. Renders the application's status, full
funnel timeline (applied → aptitude → interview → scored → outcome), scheduled events, and the
messages thread for that application, all inside the **Aperture Pro** `.app` candidate shell with
a two-column body at lg+ (left: vertical timeline; right: sidebar of messages + events). Outcome
detail (verdict, score, competency summary) lives on
[`../application-outcome/frontend_application-outcome.md`](../application-outcome/frontend_application-outcome.md)
— this screen links there once the application reaches a scored state. The data layer is
**FROZEN** — the dashboard's existing `applications.listMyApplications` query and the messaging
seam are the only RPCs consumed; no new backend.

## Route + role

`/applications/[id]` · **candidate** (`useRequireAuth` + `useRequireRole(["candidate"])`).
`[id]` is `applicationId`. Caller must own the application; the server enforces this on
`listMyApplications` (the FE filters the returned array by `applicationId`).

## Approved mockup (build to this exactly)

- **Design language (canonical):** [`../_design-language.md`](../_design-language.md) — see the
  `.app` candidate shell, `.cell`, `.cell.anchor`, `.bar`, `.pill-*`, `.status`, the timeline
  vocabulary (uses the integrity-timeline `.itl-events > .event` row shape as the **structural**
  analog — see "Layout & components" for the per-event card markup), and the messaging row
  primitive.
- **Reference demo:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
  — pull tokens, type scale, button treatment.
- **Sibling reference (shell + tracker row vocabulary):**
  [`../candidate-dashboard/frontend_candidate-dashboard.md`](../candidate-dashboard/frontend_candidate-dashboard.md)
  — the dashboard's `.cell-row` per-application primitive and the `funnelStage(state)` mapping
  carry over.
- **Sibling reference (messages):** [`../message-thread/frontend_message-thread.md`](../message-thread/frontend_message-thread.md)
  — the messaging seam is reused as a **preview** here; the full thread page is owned by that
  sibling.

No per-screen mockup file yet. Build to the design language + the two siblings; verify
side-by-side with the dashboard at task end so the surfaces feel like the same product.

## Existing code being REPLACED (not modified)

**This is a NEW screen — there is no existing code per screen.** Today, dashboard tracker rows
do not deep-link to a per-application detail page; the dashboard's inline row is the only
surface a candidate sees per application. This plan introduces the detail page.

Files that will be **created** by this plan (no replacements):

- `frontend/apps/candidate/app/applications/[id]/page.tsx` — new route file; mounts
  `<ApplicationDetail />`.
- `frontend/apps/candidate/components/application-detail.tsx` — new detail component.
- `frontend/apps/candidate/components/application-timeline.tsx` — vertical-timeline primitive
  scoped to the funnel transitions; pure presentational, derives from the existing `Application`
  shape (no new RPC).

Files **adjusted** elsewhere (small wire-up only — listed for completeness; not a UI rebuild):

- `frontend/apps/candidate/components/dashboard.tsx` — the existing `.cell-row` per-application
  primitive gets a row-level `<Link href="/applications/{applicationId}">` wrapper so the row
  navigates to the detail page on click. The row's inline action buttons (`Take test`,
  `Start interview`, `Withdraw`) remain wired to their existing handlers; the link wraps the
  row body only.

**Anti-fiction note on the timeline derivation.** Today, the `Application` shape (per
[`backend_application-detail.md`](./backend_application-detail.md)) exposes the **current**
`state` and (optional) a small history blob. The FE derives the timeline rows from `Application[]`
+ the messages thread (whose timestamps stamp the "scheduled / sent at" event rows) — **no new
RPC** is needed today. If a future product iteration wants a richer per-application audit, the
optional `Application.history?: ApplicationEvent[]` field documented in the backend contract is
the natural place to land it; the FE is built to render-if-present and to derive cleanly when
absent.

## Layout & components

**Shell:** `.app` sidebar + topbar (candidate audience), identical to the dashboard. Sidebar
shows `Applications` as `aria-current="page"`.

| Region | Markup / class | Notes |
|---|---|---|
| Sidebar | `.app > .side` | Same nav as the dashboard. `Applications` is the active item. |
| Topbar | `.topbar` | Left: `.crumb` "Home / Applications / `Job {jobId}`" (the second-to-last segment is a `<Link href="/applications">`; the last is the active title — `jobTitle` if present, else `Job {jobId}`). Right: `.toolbar` with audience pill, notification bell, avatar. |
| Page head | `.page-head` | `<h1 class="display">{jobTitle ?? "Job {jobId}"}</h1>` (Schibsted 700, `--step-3`) + `.sub` "{companyName ?? "Employer"} · Applied {relativeTime(appliedAt)}". Right side: a `<StatusPill state={state} />` (the same `.pill-*` mapping the dashboard uses — `.pill-teal` / `.pill-good` / `.pill-warn` / `.pill-danger`) + a `.btn.btn-ghost` "Back to applications" → `/applications` (or `/` if the candidate has no applications list page yet — same target as the dashboard sidebar). |
| Status strip | `.stats-grid` (3 columns at ≥ 1100 px, 1 column at ≤ 760 px) → `.stat` ×3 | Derived **client-side** from the existing `Application`: *Stage* (`funnelStage(state)` index + label), *Days since applied*, *Next step* (the human label for the next funnel step — e.g., "Aptitude test", "Interview", "Decision"). Each `.stat` is `.n` (display number / pill, Schibsted 700) + `.l` (label). |
| Body — anchor (left at ≥ 1100 px) | `.cell.anchor` (`grid-column: span 4; grid-row: span 2`) — **Timeline** | `<h3>Application timeline</h3>` + a vertical timeline (`.app-timeline > .timeline-row`). Each row: a leading `.timeline-dot` (12 px circle on `--surface-3`; filled `--teal` for completed steps, ringed for the active step, hollow for upcoming), a leading vertical `.timeline-rail` (1 px line, `--line` token), a body block with the step title (`--step-1`, Schibsted 600), a one-line subtitle (`--ink-2`, `--step-0`), and a mono timestamp (`Geist Mono`, `--step--2`) to the right of the title. Steps rendered: `Applied · Aptitude test · Interview scheduled · Interview captured · Scored · Outcome`. The **active** row also renders a small `.toolbar` of inline actions matching the stage (`Take test`, `Start interview`, `View report`) — same handlers as the dashboard row. |
| Body — c1 (right top at ≥ 1100 px) | `.cell.c1` (`grid-column: span 2`) — **Messages preview** | `<h3>Messages</h3>` + the latest 3 message rows (avatar initial + sender name + first 80 chars of body + relative time). A footer link `<Link href="/messages/{applicationId}">View full thread →</Link>` deep-links to the full messaging page. Empty branch: "No messages yet — your recruiter will reach out when something changes." |
| Body — c2 (right bottom at ≥ 1100 px) | `.cell.c2` (`grid-column: span 2`) — **Scheduled events** | `<h3>What's scheduled</h3>` + a list of `<EventRow>` (icon chip + event title + `tnum` time + `.pill-teal` "Confirmed" / `.pill-warn` "Pending"). Examples: "Aptitude test (1 hr window)", "Live proctored interview". Empty branch: "Nothing scheduled — we'll let you know when there is." |
| Body — c3 (full row, bottom) | `.cell.c3` (`grid-column: span 6` at ≥ 1100 px) — **Tabs** | Three `.tab` buttons: **Messages** (active by default — embeds an `<iframe>`-less inlined preview of the message thread for this application, same as c1 but full-bleed and scrollable), **Events** (full table of every scheduled / past event for this application), **Report** (visible only when `state` ∈ `{scored, shortlisted, hired, rejected}` — renders a link `<Link href="/applications/{applicationId}/outcome">Open outcome →</Link>` + a `.cell-empty` ("Report ready — open the outcome page for full detail.")). The tabs are real `<button role="tab">` elements; the body is `<div role="tabpanel">`. |

> **Primitives reference (do NOT redefine):** `.app · .side · .topbar · .crumb · .toolbar · .pill · .pill-{teal,good,warn,danger,coral} · .status · .stats-grid · .stat · .cell · .cell.anchor · .cell.{c1,c2,c3} · .bar · .badge · .btn · .btn-{primary,ghost,coral,sm} · .tnum` — all defined in `@ip/ui/src/app.css` per the [design language](../_design-language.md). Tokens via `@ip/ui/src/tokens.css`.

**New presentational pieces to build:** `.app-timeline` + `.timeline-row` (vertical timeline; composes `--surface-2`, `--line`, `--teal`); `.tab` + `[role="tab"]` styling (matches the audience-switch button shape); `<EventRow>` (icon chip + title + time + pill).

## Data wiring / seam (FROZEN — preserve every existing seam)

- **Client/seam:** `useAuth().api.applications.*` and `useAuth().api.messaging.*` over the
  existing protobuf-es gRPC-web client. **Unchanged.** No new clients, no new query files.
- **Query keys (unchanged):**
  - `["applications"]` — `applications.listMyApplications({})` (same key the dashboard uses,
    same conditional 10s `refetchInterval` gated on `!TERMINAL_STATES`-membership). The detail
    page **filters** the returned array client-side by `applicationId` from the route param —
    no separate per-app fetch.
  - `["messages","thread", applicationId]` — `messaging.listMessages({applicationId, limit: 50})`
    (same key the message-thread page uses). The preview cell renders the latest 3 from this
    result; the tabs panel renders the full set.
- **Mutations:** none on this page. The action buttons (`Take test`, `Start interview`,
  `Withdraw`) navigate to existing routes (`/aptitude/{applicationId}`,
  `/interview/{applicationId}/lobby`, dashboard confirm flow) — the detail page does not own
  withdraw; that stays on the dashboard. (Adding withdraw here would duplicate the existing
  confirm dialog; keep the detail page read-mostly.)
- **Fields consumed** (per [`backend_application-detail.md`](./backend_application-detail.md)):
  - `Application`: `applicationId`, `jobId`, `state`, optional `jobTitle` / `companyName`,
    optional `appliedAt` (ISO), optional `history?: ApplicationEvent[]` (render-if-present —
    when absent, the timeline derives row timestamps from the messages thread + the current
    `state`).
  - `Message`: `messageId`, `applicationId`, `senderName`, `senderRole`, `body`, `sentAt`.
- **Client-derived (no new RPC):** the timeline rows are computed from `state` (which sets the
  active step) + `history` (when present, fills in completed-step timestamps) + the messages
  thread (whose earliest message at each stage stamps the "Recruiter sent…" subtitle). The
  scheduled-events list is empty by default and pulls from `history` events tagged
  `interview_scheduled` / `aptitude_scheduled` when present.

## Tasks (build → screenshot-verify → commit per task)

> **Task 0 — Design language is the mockup.** No per-screen HTML mockup. Build to the design
> language + the candidate-dashboard sibling; verify side-by-side that the detail page reads as
> the same product as the dashboard.

- **Task 1 — Route + shell scaffolding + status strip.** Create
  `apps/candidate/app/applications/[id]/page.tsx` and `apps/candidate/components/application-detail.tsx`.
  Render the `.app` candidate shell, the `.crumb`, the `.page-head` with `<h1>`, the
  `<StatusPill>`, and the 3-stat `.stats-grid`. Filter `useQuery(["applications"])` for the
  current `applicationId`; render a 404-ish `.cell` ("This application isn't in your tracker.")
  when the filter returns nothing. Verify the page renders for a valid `applicationId` and the
  404 cell renders for an unknown one. Commit explicit paths.

- **Task 2 — `<ApplicationTimeline />` primitive.** Build the vertical timeline component in
  `apps/candidate/components/application-timeline.tsx` + the `.app-timeline` CSS in
  `frontend/packages/ui/src/app.css`. Derive the 6 step rows from `state` (active step) +
  `history` (timestamps when present). Render the inline action `.toolbar` on the active row
  (`Take test` / `Start interview` / `View report` per stage). Verify each `state` value
  renders the timeline with the correct active row and the correct action button. Commit.

- **Task 3 — Messages preview + Events cells.** Build the `.cell.c1` (Messages preview — top 3
  from `useQuery(["messages","thread", applicationId])`) and `.cell.c2` (Scheduled events —
  filtered from `history` when present, empty branch when absent). Verify the "View full
  thread" link routes to `/messages/{applicationId}` and the events cell renders an empty
  state when no scheduled events exist. Commit.

- **Task 4 — Tabs cell + outcome deep-link.** Build the `.cell.c3` tabs (Messages · Events ·
  Report). The Messages tab embeds an inlined full-thread reader (same `useQuery` as c1, full
  list); the Events tab renders a full table of events (with the mobile card-stack conversion
  at ≤ 760 px per the design language responsive rules); the Report tab is visible only when
  `state` ∈ `{scored, shortlisted, hired, rejected}` and renders the
  `<Link href="/applications/{applicationId}/outcome">Open outcome →</Link>`. Verify tab
  switching is keyboard-accessible (arrow keys move focus across `role="tab"` per ARIA
  authoring practices); verify the Report tab is hidden in earlier states. Commit.

- **Task 5 — Full assembly + fidelity verify + Responsive verification.**
  1. `--filter @ip/candidate build` is green; `--filter @ip/candidate exec tsc --noEmit` is green.
  2. Run the dev server, sign in as a candidate, click into an application from the dashboard
     row; verify the detail page renders the correct status, timeline, messages preview, and
     events.
  3. Verify the dashboard row click navigates to the detail page (the row wrapper from the
     dashboard adjustment) — and that the inline action buttons on the row are still clickable
     without triggering the row navigation (`event.stopPropagation`).
  4. Side-by-side fidelity check vs. the candidate dashboard (same shell, same tokens, same
     button treatment). Save proofs at
     `docs/brand/redesign-v3/verify/application-detail-{light,dark}.jpeg`.
  5. **Responsive verification** — execute the 8-step list from
     [`../_design-language.md`](../_design-language.md) §"Mandatory verification":
     1. **Screenshot at all 7 reference sizes:** 375 × 667 · 430 × 932 · 768 × 1024 portrait ·
        820 × 1180 portrait · 1024 × 1366 portrait · 1366 × 1024 landscape · 1440 × 900 ·
        1920 × 1080.
     2. **No horizontal scroll** at any width ≥ 320 px (test with
        `document.documentElement.scrollWidth`).
     3. **Every interactive element ≥ 44 × 44 px** when measured at the smallest breakpoint.
     4. **Keyboard does not cover form inputs** on iOS Safari (manual test or
        `visualViewport.height` check) — no forms on this page, but the message-thread inlined
        composer (when added in the tabs view) honors the same rule.
     5. **Orientation change** (portrait ↔ landscape) on iPad sizes — layout adapts gracefully,
        no clipped content; the master-detail (timeline + sidebar) stacks correctly on
        narrower tablets.
     6. **`prefers-reduced-motion`** — every animation no-ops (test by enabling reduce-motion
        in DevTools).
     7. **Cross-browser:** iOS Safari, Chrome Android, Samsung Internet, desktop Safari /
        Chrome / Firefox / Edge — at minimum Safari + Chrome on every OS.
     8. **Save side-by-side proof** to
        `docs/brand/redesign-v3/verify/application-detail-{mobile,tablet,desktop}.jpeg`.

## States & a11y

- **States.**
  - **Loading** — `LoadingState` inside the anchor cell; the status strip shows
    `.skeleton-stat`s; sidebar cells render skeletons.
  - **Not found / not owned** — the filter against `useQuery(["applications"])` returns
    nothing → render a single centered `.cell` ("This application isn't in your tracker." +
    a `.btn.btn-ghost` "Back to applications").
  - **Empty messages** — c1 + tabs Messages render an empty branch ("No messages yet…").
  - **Empty events** — c2 + tabs Events render an empty branch ("Nothing scheduled…").
  - **Error** — anchor cell shows the existing `ErrorState` + retry; sidebar cells render
    "Couldn't load right now."
  - **Success** — full two-column layout. The dashboard's 10s poll keeps the page in sync
    (state changes here update the timeline's active row without a separate fetch).
- **Responsive.**
  - ≥ 1100 px — full sidebar + topbar; bento layout: timeline anchor spans 4 cols, c1/c2 on
    the right stacked spanning 2 cols, c3 tabs spans the full row at the bottom.
  - 760–1099 px — bento collapses to single column: timeline first, then c1, c2, c3 stacked;
    the timeline rail stays sticky on the left edge of the cell.
  - ≤ 760 px — sidebar collapses to a drawer (same as the dashboard); page goes single
    column; the tabs row converts the Events tab's table into the **card-stack** pattern
    (each row → self-contained card with label : value pairs) per the design language
    responsive table rule.
  - ≤ 540 px — KPI strip becomes 1 column; status pill wraps under the title; "Back to
    applications" CTA becomes full-width sticky to `safe-area-inset-bottom`.
- **Dark + light:** all colors via tokens; timeline dots use `--teal` (resolves to the per-user
  accent); pills use the semantic token swatches.
- **Reduced motion:** `prefers-reduced-motion: reduce` disables the timeline dot pulse on the
  active row and any `.rise` reveal — content remains visible.
- **A11y.**
  - One `<h1>` per page (the job title); each cell uses `<h3>` and labelled regions
    (`aria-labelledby`).
  - `aria-current="page"` on the active sidebar nav (`Applications`).
  - The vertical timeline is an `<ol>` of `<li>` rows; the active row carries
    `aria-current="step"` and a screen-reader-only "Current step:" prefix.
  - The status pill carries a text label (not color-only).
  - The tabs row implements the ARIA authoring practices tabs pattern: `role="tablist"` on
    the container, `role="tab"` on each button with `aria-selected` and `aria-controls`,
    `role="tabpanel"` on each panel with `aria-labelledby`; arrow keys move focus across
    tabs; the active tab is reachable by Tab from before/after the list.
  - Each `<EventRow>` has `aria-label="{eventTitle} — {time} — {status}"`.
  - Focus rings via tokens (`--teal` 2px outline + 4px halo); touch targets ≥ 44 × 44; body
    contrast ≥ 4.5:1.

## Acceptance

- The detail page reads as the same product as the candidate dashboard — same tokens, same
  type scale, same shell, same button treatment. Side-by-side proof committed at
  `docs/brand/redesign-v3/verify/application-detail-{light,dark}.jpeg` and the responsive
  trio at `…-{mobile,tablet,desktop}.jpeg`.
- `--filter @ip/candidate build` is green; `tsc --noEmit` is green; no console errors /
  warnings; reduced-motion is honored.
- **Zero functional diff vs. today** beyond adding the new route: the existing
  `applications.listMyApplications` query (with its 10s conditional poll) is reused with the
  same key + same poll gate; the existing messaging seam is reused with its existing key.
- The dashboard row navigation lands on the detail page; the row's inline action buttons
  remain clickable without firing the navigation; the "View report" action on the timeline
  active row (visible only when `state` ∈ scored/shortlisted) deep-links to
  `/applications/{applicationId}/outcome`.
- Strict-proctored interview surface is **not** referenced from this screen beyond the
  "Start interview" timeline action — which routes to `/interview/{applicationId}/lobby`
  (the lobby owns the strict-proctored invariants block).
- Pre-launch anti-fiction posture preserved: empty / fallback states use truthful copy
  ("Job {jobId}" when title is absent, "Employer" when company is absent); no fabricated
  company names or fake outcomes appear on this surface.
