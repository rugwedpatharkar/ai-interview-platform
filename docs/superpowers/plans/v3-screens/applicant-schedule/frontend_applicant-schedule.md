# Applicant schedule (recruiter side) — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Build the **recruiter-side scheduling surface** for a single applicant on a single job at
`/company/jobs/[id]/applicants/[appId]/schedule`. Today the applicant-detail page
(`/company/jobs/[id]/applicants/[appId]`) carries three tabs (Report / Schedule / Messages); the
Schedule tab is the inline scheduling primitive. This dedicated route gives the recruiter a
**full-page, focused** scheduling experience for one applicant — useful when proposing slots
across multiple time-zones, when a recruiter coordinates externally and wants a deep-link, or
when the inline tab feels cramped.

The page is a **two-column layout** inside the `.app` company shell:

- **Left = candidate context card** — avatar, name, role, current application status pill,
  integrity summary chips (overall integrity score + flag count + auto-ended marker if
  applicable). Read-only.
- **Right = scheduling UI** — propose 1–3 slots, send to candidate, view status (proposed /
  booked / cancelled / completed), reschedule, cancel. Uses the **same** `SchedulingService`
  primitives the candidate `/schedule` screen uses (mirrored from the candidate side).

The scheduling primitives — calendar-grid slot picker, slot tokens, time-zone-aware labels —
are the **recruiter counterparts** of the patterns the candidate scheduling plan uses.
Backend is **frozen** — every RPC is the same `admin.scheduling.v1.SchedulingService` the
candidate consumes, just with the recruiter-side methods (`ProposeSlots`, `Reschedule`,
`Cancel`, `GetSchedule`).

## Route + role

`/company/jobs/[id]/applicants/[appId]/schedule`
(`apps/company/app/jobs/[id]/applicants/[appId]/schedule/page.tsx`) · **company** — guarded by
`useRequireRole(["recruiter", "company_admin"])` (enforced inside `CompanyShell`). Non-managers
are redirected by the shell before this page renders. Server-side scoping is enforced too —
`GetSchedule` returns `NOT_FOUND` / `PERMISSION_DENIED` on a cross-tenant `appId`.

This route is the **deep-link** counterpart to the inline Schedule tab on the applicant-detail
page. The inline tab and this dedicated route render the **same** `<RecruiterScheduler />`
primitive — only the chrome differs. A "View as full page" `.btn.btn-ghost.btn-sm` Link in the
inline tab routes here; a "Back to applicant" `.btn.btn-ghost.btn-sm` Link here routes back to
`/company/jobs/[id]/applicants/[appId]`.

## Approved mockup (build to this exactly)

- **Live demo:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
  — `.cell` (anchor + supporting), `.match > .card` rows for the candidate context, `.pill-good
  / .pill-warn / .pill-danger` for status, mono Geist Mono `.tnum` for time labels, `.input` +
  `.btn` for slot inputs, `.cell.anchor` for the active proposal state.
- **Sibling reference:** the candidate scheduling plan
  ([`../scheduling/frontend_scheduling.md`](../scheduling/frontend_scheduling.md)) — the
  calendar-grid + slot tokens are the recruiter mirror; same `formatLocal` / `viewerTimeZone`
  rules.
- **Sibling reference:** the applicant-report plan
  ([`../applicant-report/frontend_applicant-report.md`](../applicant-report/frontend_applicant-report.md))
  — the candidate context card on the left is the same `<VerdictHeader />` shape applied with
  a "Schedule mode" treatment (no decision controls).
- **Screenshots:** `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-{light,dark}-full.jpeg`.

No per-screen mockup yet — Task 0 builds it.

## Existing code being REPLACED (not modified)

**NEW screen — no existing code is being replaced.** The route does not exist today; today
scheduling lives only as the inline Schedule tab on `/company/jobs/[id]/applicants/[appId]`
(see the applicant-report plan's Task 7).

What is **NOT** touched: `CompanyShell` (existing `.app` shell + role gate),
`apps/company/app/jobs/[id]/applicants/[appId]/page.tsx` (the inline tab host — survives;
this dedicated route is additive), `frontend/packages/shared/src/scheduling.ts` (the typed
`ScheduleDTO` + `BookingStatus` + `ProposedSlot` + the `formatLocal` / `viewerTimeZone`
re-export — **shared with the candidate side**, unchanged), or any `*.proto` / generated
client. **The inline Schedule tab and this dedicated route render the same
`<RecruiterScheduler />` primitive** — that primitive lives in
`apps/company/components/applicant/schedule/` and is built once. The applicant-report plan's
Task 7 documents the inline tab build; this plan documents the deep-link page that hosts the
same primitive.

## Section spine — 5 regions, in order

Build each as its own component under `frontend/apps/company/components/applicant/schedule/`.

| # | Region | Component | Notes |
|---|---|---|---|
| 0 | App shell | `<CompanyShell>` (existing) | `.app` sidebar + topbar. **Jobs & applicants** `aria-current`. Topbar crumb = `<Company> / Jobs / <Title> / <Candidate> / Schedule`. |
| 1 | Back row | `<BackRow />` | `.btn.btn-ghost.btn-sm` "← Back to <Candidate>" linking `/company/jobs/[id]/applicants/[appId]` (preserves the report tab focus). |
| 2 | Two-column frame | `<ScheduleFrame />` | CSS Grid `grid-template-columns: minmax(280px, 360px) 1fr; gap: 1.4rem;`; **stacks to single column at `≤960px`** (context card moves above the scheduler on mobile). |
| 3 | **Left** — Candidate context card | `<CandidateContextCard />` | `.cell` with: candidate avatar (initials over `--coral`→`--teal` gradient), Schibsted h3 candidate name, `.sub` role title (from `Job.GetJob.title`), `.pill` current application status (`.pill-good` "Shortlisted" / `.pill-warn` "Interview pending" / etc. — `applicationStatus()` mapping from the applicant-report plan), then a 3-row `.bars` mini-summary: **Integrity score** (`.bar` width = `integrityScore`%), **Flags** (mono count from the integrity timeline), **Recommendation** (`.pill-good` Advance / `.pill-warn` Hold / `.pill-danger` Reject from the report's `recommendation`). A `.btn.btn-ghost.btn-sm` "Open report" Link → `/company/jobs/[id]/applicants/[appId]` at the bottom. **Read-only — no actions, no decisions on this surface.** |
| 4 | **Right** — Recruiter scheduler | `<RecruiterScheduler />` | The full scheduling UI. Branches on `schedule.status` (`proposed` / `booked` / `cancelled` / `completed` / `empty`). See per-state composition below. |

### Per-state composition (right column)

The `<RecruiterScheduler />` carries one of five states based on `useSchedule(appId)`. The
shape mirrors the candidate scheduling page from the candidate-side perspective.

- **Empty (no proposal yet)** — `<NoProposalCard />`
  - h4 "Propose interview times"
  - `.sub` "Pick 1–3 slots that work for you and your team. The candidate confirms one."
  - Primary `.btn.btn-primary` **+ Propose slots** opens the `<ProposeSlotsForm />` inline (no
    modal — the form replaces the empty card in-place).

- **Propose form** — `<ProposeSlotsForm />` (inline, after clicking + Propose slots)
  - Heading "Propose times for <Candidate>".
  - Slot row list (1..3 rows). Each row:
    - `.input[type=datetime-local]` Start (`formatLocal` for display; sent as UTC ISO — the
      adapter `toServerIso` does the local→UTC conversion via `Date.parse` on the
      `datetime-local` value's serialisation).
    - `.input.tnum` Duration (mono select: 15 / 30 / 45 / 60 / 90 / 120 minutes; default 45).
    - `.btn.btn-ghost.btn-sm` **Remove** (disabled when only 1 row).
  - `.btn.btn-ghost` **+ Add another slot** (disabled at 3 rows).
  - Below: `.textarea.input` **Location / meeting link** (optional; sent as `location`).
  - Below: `.textarea.input` **Note to candidate** (optional; sent as `note`).
  - Footer: `.btn.btn-ghost` **Cancel** (returns to `<NoProposalCard />`) +
    `.btn.btn-primary` **Send to candidate** (calls `ProposeSlots({ applicationId, slots[],
    location, note })`; on success, the page re-fetches and renders the `<ProposedState />`).

- **Proposed (slots sent, candidate has not chosen)** — `<ProposedState />`
  - `.cell.anchor` (teal-tinted) banner: "Waiting on <Candidate> to choose a time."
  - Slot list (`.match > .card` rows): each row shows the mono local time
    (`formatLocal(startAt, "EEE d MMM · HH:mm")`) + mono duration (`· {durationMinutes} min`)
    + the `.tag` mono "UTC <ISO>" for clarity.
  - `.sub` location + note (when present), pre-wrap.
  - Actions: `.btn.btn-ghost` **Reschedule** (opens `<ProposeSlotsForm />` pre-filled with the
    current slots — calls `Reschedule({ applicationId, slots[], location?, note? })`) +
    `.btn.btn-ghost` **Cancel** (opens `ConfirmDialog`, fires `Cancel({ applicationId })`).

- **Booked (candidate has chosen a slot)** — `<BookedState />`
  - `.cell.anchor` (teal-tinted): "Interview confirmed." + `.pill-good` "Booked".
  - Confirmed time: `formatLocal(chosenStartAt, "EEEE d MMMM · HH:mm")` + mono duration + the
    mono "UTC <ISO>" pinpoint.
  - Location + note (when present), pre-wrap.
  - Actions: `.btn.btn-ghost` **Reschedule** (warns the candidate via confirm dialog; calls
    `Reschedule({ applicationId, slots[], ... })` — the server invalidates the booking, status
    flips to `proposed`) + `.btn.btn-ghost` **Cancel** (opens `ConfirmDialog`, fires `Cancel`).
  - No "Add to calendar" on the recruiter side — that's the candidate's affordance (the
    candidate calls `getIcs`).

- **Cancelled** — `<CancelledState />`
  - Full-width `.cell` with `.pill-warn` "Cancelled".
  - `cancelledBy` line ("Cancelled by you" when `cancelledBy === "recruiter"`; "Cancelled by the
    candidate" when `cancelledBy === "candidate"`).
  - `.btn.btn-primary` **Propose new times** → opens `<ProposeSlotsForm />` (calls
    `ProposeSlots` to start a fresh proposal — the existing proposal stays in history).

- **Completed** — `<CompletedState />`
  - Full-width `.cell` with `.pill-good` "Completed".
  - "Interview completed at <stamp>. Open the report when ready." with a `.btn.btn-ghost`
    "Open report" Link → `/company/jobs/[id]/applicants/[appId]`.

## Layout & components — map to `@ip/ui` and tokens

Pull every primitive from `@ip/ui` per [`_design-language.md`](../_design-language.md).

| Region | Primitive | Tokens |
|---|---|---|
| Shell | `CompanyShell` (existing) | already on the new tokens via the design-language Task 1 |
| Back row | `.btn.btn-ghost.btn-sm` with `arrow` icon | button tokens |
| Two-column frame | CSS Grid; `≥961px` two-col, `≤960px` stacks | layout tokens |
| Candidate context `.cell` | `.cell` (22px radius) + `.match > .card` head + `.bars` mini-summary | `--surface`, `--line` |
| Status pill | `.pill-good` / `.pill-warn` / `.pill-danger` | semantic tokens only |
| Integrity bar | `.bar > .t > i` (5px tall) | `--teal` fill, `--surface-3` track |
| Scheduler frame | `.cell` (containing the per-state body) | `--surface`, `--line` |
| Anchor banner (proposed / booked) | `.cell.anchor` (gradient teal-soft) | `--teal-soft`, `--surface` |
| Slot rows | `.match > .card` (no avatar) | as design language |
| Slot inputs | `.input[type=datetime-local]` + `.input.tnum` duration select | `--surface-2`, `--ink-deep`, `--teal-glow` focus |
| Time labels | mono Geist Mono `.tnum` | `--ink`, `--ink-3` for the UTC pinpoint |
| Buttons | `.btn.btn-primary` (Send / Propose new times) + `.btn.btn-ghost` (Cancel / Reschedule / Remove) | button tokens |
| Confirm dialog | `ConfirmDialog` from `@ip/ui` | dialog tokens |

All primitives live in `@ip/ui/src/app.css`. **Anti-slop ban** — no side-stripe borders on
slot rows, no glassmorphism on the scheduler frame, no "01 / 02 / 03" numeric markers on slot
rows (slots are not a sequence), no fake calendar-sync claim ("Add to Google Calendar" /
"Sync to Outlook" is forbidden — `getIcs` is a `.ics` download on the candidate side; the
recruiter side has no calendar export).

## Data wiring / seam

**Reuses the same `useSchedule(applicationId)` seam as the candidate side** — the FE uses one
shared hook in `frontend/packages/shared/src/scheduling.ts` (the candidate plan documents the
candidate-side methods; this plan documents the recruiter-side methods on the **same**
`SchedulingService`). No new client, no new query key.

| Action | Hook | Query key | Source |
|---|---|---|---|
| Seed (poll target) | `useAuthedQuery(token, ["scheduling","schedule", appId], () => api.scheduling.getSchedule({ applicationId: appId }), { refetchInterval: 15_000, refetchIntervalInBackground: false })` (same shape the candidate uses) | `["scheduling","schedule", appId]` | `SchedulingService.GetSchedule` |
| Propose | `useMutation((p) => api.scheduling.proposeSlots({ applicationId: appId, slots: p.slots, location: p.location, note: p.note }))` → on success: invalidate `["scheduling","schedule", appId]` + invalidate the recruiter's `["scheduling","recruiter-pipeline"]` list (if present on the dashboard's Scheduling preview cell) | — | `SchedulingService.ProposeSlots` |
| Reschedule | `useMutation((p) => api.scheduling.reschedule({ applicationId: appId, slots: p.slots, location?, note? }))` → on success: invalidate same keys + toast `.success("Rescheduled")` | — | `SchedulingService.Reschedule` |
| Cancel | `useMutation(() => api.scheduling.cancel({ applicationId: appId }))` → on success: invalidate same keys + toast `.success("Cancelled")` (idempotent — double-cancel is silent success) | — | `SchedulingService.Cancel` |
| Candidate context — application status | derived from the existing `["applicants", jobId]` query (no new fetch — the inline applicant tab and the dashboard already populate this) | `["applicants", jobId]` | `Application.ListApplicants` |
| Candidate context — integrity summary | `useAuthedQuery(token, ["integrity", appId], () => getIntegrityTimeline({ applicationId: appId }))` (same mockable client the applicant-report uses; non-blocking — the scheduler renders even when this fails) | `["integrity", appId]` | `Report.GetIntegrityTimeline` |
| Candidate context — recommendation | `useAuthedQuery(token, ["report", appId], () => api.reports.getReport({ applicationId: appId }))` (same key + poll predicate the report plan uses — but non-blocking; if the report isn't ready, the recommendation row hides cleanly) | `["report", appId]` | `Report.GetReport` |
| Job context — role title | `useAuthedQuery(token, ["job", jobId], () => api.jobs.getJob({ jobId }))` (existing cache shared with the pipeline + edit views) | `["job", jobId]` | `Job.GetJob` |

**UTC↔local boundary (load-bearing — DO NOT change).** Every persisted instant is **UTC**; the
viewer's zone is applied **only at render** via `@ip/shared/datetime.ts` `formatLocal` for slot
labels, time inputs, and confirmation displays. The recruiter is the only side that does a
**local → UTC** conversion (on submitting the `ProposeSlots` / `Reschedule` form): the
`datetime-local` input gives a local-time string; the adapter `toServerIso(localStr,
durationMinutes)` parses it as the viewer's local time and serialises as `...Z` UTC ISO. This
is the one tz-math point on the recruiter side — implement it in
`frontend/packages/shared/src/scheduling.ts` (same module that hosts `formatLocal`), with unit
tests covering DST transitions in the recruiter's local zone.

**Anti-fiction guard.**

- Sample / placeholder slots never appear; the form starts empty (1 blank slot row to fill in).
- The candidate context card never invents a recommendation or an integrity score — if the
  report is `NOT_FOUND` (still generating), the recommendation row hides cleanly and the
  integrity row shows "—" with `aria-label="Data unavailable"`. **Never** fabricate a "Highly
  recommended" pill when there is no report.
- The "Add to calendar" affordance is **not** offered on the recruiter side — that's the
  candidate's `getIcs` flow. No claimed "Google Calendar / Outlook integration".
- Slot proposals do not auto-pick "smart times" or "AI-suggested availabilities" — the
  recruiter types every slot. (A future enhancement could surface availability suggestions,
  but it is out of scope today.)

## Tasks (TDD-style, build → screenshot-verify → commit per task)

> **Task 0 — Build the per-screen mockup.** Create
> `docs/brand/redesign-v3/screens/applicant-schedule.html` linking
> `@ip/ui/src/{tokens.css,app.css}` and the SVG sprite. Embed the `.app` shell verbatim from
> the design language; build the back row + two-column body. Left = candidate context card
> with sample data (avatar "C", "Candidate A", "Sr. Product Designer", `.pill-good`
> "Shortlisted", integrity 86, flags 2, recommendation "Advance"). Right = the proposed state
> with 3 sample slot rows showing mono local time + UTC pinpoint + .sub location ("Google
> Meet link will be sent before the call"). Sample data clearly labelled "Sample". Verify in
> both themes at 1440×900 and 390×844 against
> `D-aperture-pro-{light,dark}-full.jpeg`. Commit the new HTML file only.

- **Task 1 — Route + shell + back row + two-column frame.** Mount `ApplicantSchedulePage`
  under `CompanyShell` at
  `apps/company/app/jobs/[id]/applicants/[appId]/schedule/page.tsx`. Read `jobId` and `appId`
  from `useParams()`. Render `<BackRow />` and the two-column `<ScheduleFrame />`. Handle
  `NOT_FOUND` (cross-tenant `appId`) → render the calm "Application unavailable" `.cell` +
  Link to `/company/jobs/[id]`. Commit
  `apps/company/app/jobs/[id]/applicants/[appId]/schedule/page.tsx`,
  `apps/company/components/applicant/schedule/{back-row,schedule-frame}.tsx`.

- **Task 2 — Candidate context card.** Build `<CandidateContextCard />` reading from the
  three shared queries (`["job", jobId]`, `["applicants", jobId]`, `["integrity", appId]`,
  `["report", appId]`). Render avatar + name + role + status pill + 3-row `.bars` mini-
  summary + "Open report" Link. **Read-only.** Handle each query's loading / empty / error
  states independently — the card never blocks the scheduler. Commit
  `apps/company/components/applicant/schedule/candidate-context-card.tsx`.

- **Task 3 — `useSchedule` hook (recruiter side methods).** Extend the existing
  `frontend/packages/shared/src/scheduling.ts` to add recruiter-side methods if not already
  exposed (`proposeSlots`, `reschedule`) on the same `SchedulingClient` interface. Add the
  `toServerIso(localStr, durationMinutes)` adapter with unit tests covering: a non-DST date,
  a DST-spring-forward date, a DST-fall-back date. Confirm `formatLocal` + `viewerTimeZone`
  remain the only render-time tz boundary. **The candidate scheduling page is untouched** —
  the hook is shared, and the FE methods candidates don't call (proposeSlots / reschedule)
  simply aren't invoked on their pages. Commit
  `frontend/packages/shared/src/scheduling.ts` (additive only).

- **Task 4 — `<ProposeSlotsForm />`.** Build the inline propose-slots form (heading + 1..3
  slot rows + location + note + Send/Cancel). Slot row = `.input[type=datetime-local]` +
  `.input.tnum` duration select + Remove. **+ Add another slot** disabled at 3 rows; Remove
  disabled when only 1 row. On submit, call `proposeSlots({ applicationId, slots[], location,
  note })` via `toServerIso` per slot; on success, invalidate the schedule query + toast.
  Server-side `INVALID_ARGUMENT` (slot in the past, slot duration ≤ 0, > 3 slots) surfaces
  inline. Commit
  `apps/company/components/applicant/schedule/propose-slots-form.tsx`.

- **Task 5 — Proposed / Booked / Cancelled / Completed / Empty states.** Build
  `<NoProposalCard />`, `<ProposedState />`, `<BookedState />`, `<CancelledState />`,
  `<CompletedState />`. Wire the **Reschedule** action on Proposed and Booked: opens the
  `<ProposeSlotsForm />` pre-filled with the current slots, calls `reschedule` instead of
  `proposeSlots` (the server invalidates any existing booking). Wire the **Cancel** action on
  Proposed and Booked: opens a `ConfirmDialog` ("Cancel this interview? The candidate will be
  notified."), fires `cancel`, idempotent double-cancel is silent success. Wire the **Propose
  new times** action on Cancelled: starts a fresh proposal. Commit
  `apps/company/components/applicant/schedule/{no-proposal-card,proposed-state,booked-state,cancelled-state,completed-state}.tsx`.

- **Task 6 — Page assembly + fidelity verify.**
  1. `--filter @ip/company build` + `--filter @ip/company exec tsc --noEmit` green.
  2. Boot dev with `NEXT_PUBLIC_MOCK=1` (so the mock SchedulingService seed is in place).
     Navigate to `/company/jobs/[id]/applicants/[appId]/schedule` for a sample applicant.
     Screenshot in both themes at 1440×900 and 390×844 against the Task-0 HTML.
  3. Walk every state branch (empty → propose → proposed → cancelled → propose new → booked →
     reschedule → cancelled → completed via the mock's status flips).
  4. Confirm the 15s `GetSchedule` poll continues to refresh state in the background.
  5. Confirm the local→UTC adapter round-trips correctly across DST (manual: set system zone
     to America/New_York in March; verify a 2024-03-10 02:30 EST input does not silently
     advance the day).
  6. Confirm `useRequireRole` redirects a non-manager.
  7. Confirm a cross-tenant `appId` → calm "Application unavailable" `.cell`.
  8. Confirm the inline Schedule tab on `/company/jobs/[id]/applicants/[appId]` (the
     applicant-report plan's Task 7) renders the **same** `<RecruiterScheduler />` primitive
     — no fork.

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
     `docs/brand/redesign-v3/verify/applicant-schedule-{mobile,tablet,desktop}.jpeg`.

## States & a11y

- **States.**
  - **Loading** — context card + scheduler both render skeletons; the context card's `.bars`
    rows are 3 skeleton lines; the scheduler shows a single skeleton `.cell`.
  - **Not-found / cross-tenant** — calm "Application unavailable" `.cell` (no scary red) +
    Link to `/company/jobs/[id]`.
  - **Context-card sub-states** — each query (`["applicants", jobId]`, `["integrity", appId]`,
    `["report", appId]`) loads / errors / empties **independently**; never blocks the
    scheduler.
  - **Scheduler — empty** → `<NoProposalCard />` with **+ Propose slots** CTA.
  - **Scheduler — propose form** → `<ProposeSlotsForm />` inline; **Send to candidate**
    disabled until ≥1 valid slot.
  - **Scheduler — propose pending** → Send button spinner + disabled; `useRef` double-submit
    latch.
  - **Scheduler — propose error** → inline `.pill-danger` row at the top of the form;
    `INVALID_ARGUMENT` for "slot in the past" / "duration out of range" surfaces inline
    against the offending row.
  - **Scheduler — proposed** → `<ProposedState />` with Reschedule + Cancel.
  - **Scheduler — booked** → `<BookedState />` with Reschedule + Cancel.
  - **Scheduler — reschedule pending** → opens `<ProposeSlotsForm />` pre-filled; on submit
    fires `Reschedule`; the server invalidates the booking, status flips to `proposed`; the
    candidate is notified (`interview_rescheduled`).
  - **Scheduler — cancel confirm** → `ConfirmDialog` ("Cancel this interview? The candidate
    will be notified."); on confirm fires `Cancel`; idempotent.
  - **Scheduler — cancelled** → `<CancelledState />` with **Propose new times**.
  - **Scheduler — completed** → `<CompletedState />` with Open report Link.
- **Responsive.** Sidebar collapses ≤1000px per the design language. Two-column frame
  collapses to single-column ≤960px (context card moves above the scheduler). The propose-
  slots form's row layout (datetime-local + duration + Remove) goes from horizontal to
  vertical (label-above-input) stacking ≤540px with sticky footer CTAs. The Booked state's
  confirmed-time block keeps the mono UTC pinpoint visible at all widths (no truncation).
- **Dark + light.** All color via tokens; the `.cell.anchor` Proposed/Booked banner uses
  `color-mix(in oklch, var(--teal) 8%, var(--surface))` so it resolves cleanly in both themes
  and inherits per-user Appearance accent overrides. Cancelled `.pill-warn` and Completed
  `.pill-good` resolve to semantic tones.
- **A11y.** One `<h1>` per page (the candidate name in the context card head). `<main>` +
  `<section>` per region. The propose-slots form is a real `<form>` with labelled inputs;
  each datetime-local has an associated `<label>` ("Slot start time, row 1"). The Send /
  Cancel buttons are real `<button>`s; Send is `type="submit"`. The slot row group is
  `<fieldset>` + `<legend class="sr-only">`. The Reschedule and Cancel actions on Proposed /
  Booked are real `<button>`s with descriptive `aria-label`s ("Reschedule interview with
  <Candidate>"). The Confirm dialogs are `role="dialog"` + `aria-modal="true"` + focus trap +
  ESC-to-close. Touch targets ≥44×44 (datetime-local can be small on mobile; wrap with a
  padded `<label>` to ensure the tap target meets size). Contrast ≥4.5:1. Focus rings via
  `:focus-visible` — `--teal` 2px / 4px halo. Reduced-motion: no entrance animations on the
  scheduler body swap.

## Acceptance

- Looks 1:1 like the per-screen Task 0 HTML AND the relevant slices of
  [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html). Side-by-side
  screenshot proof committed under
  `docs/brand/redesign-v3/verify/applicant-schedule-{light,dark}.jpeg`.
- `--filter @ip/company build` is green; `tsc --noEmit` is green; no console errors /
  warnings.
- **Zero new backend surface.** Same `SchedulingService.{GetSchedule, ProposeSlots,
  Reschedule, Cancel}`. The candidate-side `ChooseSlot` and `GetIcs` are not called from this
  page (they belong on the candidate `/schedule` route). The DTOs (`ScheduleDTO`,
  `BookingStatus`, `ProposedSlot`) are byte-for-byte unchanged.
- The `<RecruiterScheduler />` primitive is **shared** with the inline Schedule tab on
  `/company/jobs/[id]/applicants/[appId]` (the applicant-report plan's Task 7) — no fork.
  The deep-link route gives the full-page chrome; the inline tab gives the embedded view.
- **UTC discipline preserved.** The new `toServerIso` adapter is the single local → UTC point
  on the recruiter side; `formatLocal` + `viewerTimeZone` remain the only render-time
  boundary; the wire still carries `...Z` ISO; the candidate side never sees a non-UTC value.
- Pre-launch posture is enforced: no fake "AI-suggested availability", no claimed "Google
  Calendar / Outlook" integration, no fake candidate context (recommendation hides cleanly
  when the report isn't ready).
- A non-manager loading this route is still redirected by `CompanyShell`'s
  `useRequireRole(["recruiter","company_admin"])`.
- A cross-tenant `appId` returns `NOT_FOUND` server-side; the FE renders the calm "Application
  unavailable" `.cell` and never leaks another tenant's data.
