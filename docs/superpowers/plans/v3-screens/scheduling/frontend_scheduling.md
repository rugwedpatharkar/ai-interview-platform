# Scheduling — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

The candidate interview-scheduling surface for a single application: pick a proposed time slot
(timezone-aware, stored UTC; rendered in the viewer's zone), or view a booked / cancelled /
completed interview. Replace the existing status-branched page with an Aperture Pro layout —
a **calendar-style slot grid + side detail panel** inside the `.app` shell — that mirrors the
demo's bento + cell rhythm. The data seam (`useSchedule(applicationId)`), the 15s `getSchedule`
poll, the `choose`-CAS friendly `ALREADY_EXISTS` path, the cancel handler, the ICS client-side
download, and both query keys all stay byte-for-byte identical. The UTC↔local boundary
invariant (`formatLocal` / `viewerTimeZone` from `@ip/shared/datetime.ts` is the **only**
render-time tz boundary) is load-bearing — the rebuild must not introduce any tz math. Strict
proctored-interview invariants apply downstream (camera + mic, fullscreen-locked) — see
[proctored-interview](../proctored-interview/frontend_proctored-interview.md); this screen is
the schedule step that precedes them.

## Route + role

`/schedule` — **candidate** (`apps/candidate/app/schedule/page.tsx`). Per-application via
`?application=<id>`. The recruiter propose-times surface lives on the company applicant-detail
Schedule tab (a separate screen, owned by a separate plan — not rebuilt here).

## Approved mockup (build to this exactly)

- **Design language reference:** [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
  No per-screen mockup file yet; the calendar grid + detail panel is composed from `.cell`,
  `.cell.anchor`, `.surface-2`, `--teal-soft`, `--teal-strong`, `--good`, `--warn`, the `.btn`
  primitives, and the mono `Geist Mono` type stack — all present in the demo.

A side-by-side fidelity check against the design language is part of acceptance — see
"Acceptance" below.

## Existing code being REPLACED (not modified)

Delete-and-rebuild scope (UI replaced; data seam preserved verbatim):

- `frontend/apps/candidate/app/schedule/page.tsx` — the status-branched
  proposed/booked/cancelled/completed page. UI replaced.

**Untouched (data seam — preserved verbatim):**

- `frontend/apps/candidate/lib/use-schedule.ts` — `useSchedule(applicationId)` exporting the
  15s `getSchedule` poll (`refetchInterval: 15_000`, `refetchIntervalInBackground: false`), the
  `choose` mutation (with the `ALREADY_EXISTS` friendly re-fetch path), and the `cancel`
  mutation. **Unchanged.**
- `frontend/apps/candidate/lib/scheduling.ts` — `createSchedulingClient(useAuth().api)` /
  `makeMockSchedulingClient()` real-vs-mock seam, query-key helpers, and the `formatLocal` /
  `viewerTimeZone` re-export from `@ip/shared/datetime.ts`. **Unchanged.**
- Query keys `["scheduling","schedule", applicationId]` (poll target) +
  `["scheduling","candidate-interviews"]` (list for the dashboard). **Unchanged.**

## Layout & components — map to `@ip/ui` and tokens

The scheduling page uses the `.app` sidebar+topbar shell. The content area is a two-column
layout: a **slot grid** (left, fills available width) and a **detail panel** (right, fixed
320–380px) holding location/note + the primary action. On mobile, the detail panel stacks
**below** the grid. The whole surface branches on `schedule.status`.

| Region | Component (new) | Primitives / tokens |
|---|---|---|
| App shell | reuse `<AppShell side="candidate" />` | `.app`, `.side`, `.topbar`, `.content` |
| Page head | `<ScheduleHead />` | `h2` Schibsted Grotesk `--step-3` "Interviews" + lead "Times shown in {viewerTimeZone()}" rendered with `<em>` for the zone label (per token rule, `<em>` is semantic emphasis, NOT italic) |
| Two-column frame | `<ScheduleFrame />` | CSS Grid `grid-template-columns: 1fr minmax(320px, 380px); gap: 1.4rem;`; stacks to single column at `≤960px` |
| Status pill | `<StatusPill status={status} />` | `.pill`/`.pill-teal`/`.pill-good`/`.pill-warn`; "Choose a time" / "Confirmed" / "Cancelled" / "Completed" |
| **Proposed:** day grid | `<SlotGrid />` | outer `.cell`; inner CSS Grid: one column per local day (auto-fit, minmax 200px), header row uses mono `Geist Mono` `--step--1` `--ink-3` with the local-day label from `formatLocal(slot.startAt, "EEE d MMM")` |
| **Proposed:** slot cell | `<SlotCell />` | inside each day column, `<button role="radio">` chips stacked vertically; rest state `--surface-2` + `--ink`; hover `--line-2` border; selected `--teal-soft` background + `--teal-strong` ink + `--teal` 1px border; mono `formatLocal(slot.startAt, "HH:mm")` + small `· {durationMinutes} min` sub-label |
| **Proposed:** detail | `<ProposalDetail />` | side `.cell` with `location` + `note` (`white-space: pre-wrap`) + `.btn.btn-primary` "Confirm time" (disabled until selected / while `isChoosing`) + ghost "Decline all" link to messaging (re-uses existing href) |
| **Booked:** anchor card | `<BookedCard />` | `.cell.anchor` (teal-tinted) with the confirmed time (`formatLocal(chosenStartAt)`), duration, `location`, and a mono UTC pinpoint line (`"UTC " + chosenStartAt`) for clarity |
| **Booked:** detail | `<BookedActions />` | side `.cell`: `.btn.btn-primary` "Add to calendar" (→ `getIcs` → client-side `.ics` download, unchanged) + `.btn-ghost` "Cancel" gated by a confirm dialog |
| **Cancelled** | `<CancelledCallout />` | full-width `.cell` with `.pill-warn` status + `cancelledBy` ("Cancelled by you" / "Cancelled by the company") + a `.btn-ghost` "Back to dashboard" link |
| **Completed** | `<CompletedCallout />` | full-width `.cell` with `.pill-good` status + "This interview has taken place. Your report will arrive shortly." |
| **Empty** | `<NoScheduleCard />` | `.cell` with aperture mark + "No interview scheduled" + "You'll see proposed times here when the company shares them." |

**Slot-cell anatomy** (a single time button):

1. Top: mono `--step-0` time in `Geist Mono` (e.g. `14:30`).
2. Sub: mono `--step--2` `--ink-3` duration (`· 45 min`).
3. Trailing dot: small `.dot` chip tinted `--good` when the slot is currently selected.

**Anti-slop bans (apply explicitly here):**

- No left-border side-stripe on slot cells or callouts. Selected state is a full-border +
  tinted background, NOT a 4px left bar.
- No glass blur on the grid. Flat `.cell` tokens.
- No "01 / 02 / 03" numeric markers on days; days are not a sequence.
- No fake company name in the location string (`location` is server-supplied — if absent,
  render "—" not a fake placeholder).
- No claimed "calendar sync" / "Google / Outlook integration". The Add-to-calendar button does
  a client-side `.ics` download (truthful framing).

## Data wiring / seam (preserved verbatim)

- **Seam:** `useSchedule(applicationId)` over `createSchedulingClient(useAuth().api)`.
  **Unchanged.** Provides:
  - `schedule: ScheduleDTO | undefined` — the polled snapshot.
  - `isLoading`, `isError`, `error`.
  - `choose(startAt: string)` — calls `ChooseSlot`; on `ALREADY_EXISTS` the toast says "That time
    was just taken — here are the current options" and refetches. **Unchanged.**
  - `isChoosing`.
  - `cancel()` — calls `Cancel`; double-cancel is idempotent. **Unchanged.**
- **Receive poll:** `refetchInterval: 15_000`, `refetchIntervalInBackground: false`. **Unchanged.**
- **Query keys:** `["scheduling","schedule", applicationId]` (poll target) +
  `["scheduling","candidate-interviews"]` (dashboard list invalidation on a successful choose /
  cancel). **Unchanged.**
- **Fields consumed** (from `backend_scheduling.md` `ScheduleDTO`): `status`,
  `slots[].startAt` / `slots[].durationMinutes`, `chosenStartAt`, `chosenDurationMinutes`,
  `location`, `note`, `cancelledBy`. ICS download via `getIcs` → `{filename, content}`.
- **UTC↔local boundary (load-bearing — DO NOT change):** every persisted instant is **UTC**;
  the viewer's zone is applied **only at render** via `@ip/shared/datetime.ts` `formatLocal`
  for slot labels, day-column headers, the booked confirmation time, and the
  "Times shown in {viewerTimeZone()}" caption. The candidate path is **read-only on time** — it
  picks an offered UTC `start_at` and sends it back verbatim. **No local→UTC conversion on this
  screen.** The rebuild must not introduce any tz math, must not reformat the wire value, and
  must keep `formatLocal` / `viewerTimeZone` as the single render-time boundary.
- **Day-grouping rule.** Compute `localDay = formatLocal(slot.startAt, "yyyy-MM-dd")` to key
  slots into day columns; iterate slots once, push into `Map<string, ProposedSlot[]>`. The
  server returns slots in proposal order — preserve that order within each day; do not
  re-sort across days (keep insertion order so the polled re-fetch is stable).
- **Lost-pick path.** When `ChooseSlot` returns `ALREADY_EXISTS`, surface a non-blocking
  toast and refetch. The new UI must preserve this — never a hard error.
- **Mock parity test (must keep green):** the `pnpm test` contract check around
  `SchedulingService.{getSchedule,chooseSlot,cancel,getIcs}` continues to pass; new UI must
  not introduce field reads beyond the documented `ScheduleDTO`.

## Tasks (build → screenshot-verify → commit per task)

> **Task 0 — Mockup is the design language.** No per-screen mockup file. Reference is the
> design language doc + the demo at
> [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html). Do not
> modify the demo.

- **Task 1 — Slot grid + slot cell primitives into `@ip/ui` (if missing).** Add `.slot-grid`,
  `.slot-day`, `.slot-cell`, `.slot-cell[aria-checked="true"]`, and `.day-header` rules to
  `@ip/ui/src/app.css`, composed from existing tokens (`--surface`, `--surface-2`,
  `--teal-soft`, `--teal-strong`, `--teal`, `--line`, `--line-2`, `--r-lg`, `--ease-out`,
  `--dur-fast`). Day headers use mono `Geist Mono` `--step--1` `--ink-3`. Confirm-time button
  is the existing `.btn.btn-primary`. Verify `--filter @ip/ui build` is green. Commit
  `frontend/packages/ui/src/app.css`.
- **Task 2 — `<SlotGrid />` + `<SlotCell />` + `<ProposalDetail />`.** Build the proposed-state
  components. Wire the chip group as `role="radiogroup" aria-label="Available interview times"`
  with each chip `role="radio" aria-checked={isSelected}`. Wire `formatLocal` labels. Confirm
  button calls `choose(picked)` from the hook. Verify slots group by local day, the selected
  treatment applies, the Confirm button enables only when selected, and the announcer
  (`role="status" aria-live="polite"`) surfaces "5 times available across 2 days" on first
  render and "Selected 14:30 on Thursday 24 Jun" on selection. Commit the new components.
- **Task 3 — `<BookedCard />` + `<BookedActions />` + `<CancelledCallout />` +
  `<CompletedCallout />` + `<NoScheduleCard />`.** Build the remaining branch components. The
  Add-to-calendar button must continue to call `getIcs` and trigger the client-side `.ics`
  download (existing handler kept). The Cancel button opens a confirm dialog (token-driven,
  reuses the shared confirm primitive). Screenshot each branch in both themes. Commit the new
  components.
- **Task 4 — Page rebuild + status branch.** Rewrite `apps/candidate/app/schedule/page.tsx`
  against the new components inside the candidate `.app` shell. Branch on `schedule.status`
  (`proposed` / `booked` / `cancelled` / `completed`) and the empty case (no proposal, no
  booking). Wire the unchanged `useSchedule(applicationId)` hook. Verify the 15s poll continues
  to refresh state; verify the `ALREADY_EXISTS` toast still fires on a lost pick; verify the
  ICS download still produces a `VEVENT` file. Commit `apps/candidate/app/schedule/page.tsx`.
- **Task 5 — Full screen assembly + verify.**
  1. `--filter @ip/candidate build` is green; `tsc --noEmit` is green.
  2. Run the dev server. Walk each status branch (use the mock seed to set up each):
     `proposed` (with 5 slots across 2 days), `booked`, `cancelled` (each role), `completed`,
     `empty`. Screenshot each branch in both themes at 1440×900 and 390×844.
  3. **Side-by-side fidelity check** against the design language tokens — verify day-column
     mono headers, slot-cell corner radius, selected tint, anchor-cell tint on the booked
     state, status pill colors, Add-to-calendar button.
  4. Trigger the lost-pick race manually (or via the mock) and verify the toast + refetch
     update the grid without a hard error.
  5. Confirm the ICS download fires and the file's `DTSTART` matches `chosenStartAt` in UTC.
  6. Confirm `NEXT_PUBLIC_MOCK=1` renders the mock seed; flipping to real is the existing
     1-line client swap.
  7. **UTC discipline grep:** `grep -nE "new Date\(.*(getTimezoneOffset|setHours)" apps/candidate/app/schedule/`
     returns nothing in the new code — no tz math, only `formatLocal` + `viewerTimeZone`.

## States & a11y

- **Loading** → skeleton day columns (2 columns × 3 chip placeholders) inside the `.cell`;
  side detail panel shows a skeleton lead + button.
- **Empty** → `<NoScheduleCard />` with the aperture mark + "No interview scheduled".
- **Error** → inline `--danger`-tinted `.cell` with `.btn-ghost` "Retry" that triggers
  `queryClient.refetchQueries({ queryKey: ["scheduling","schedule", applicationId] })`.
- **Proposed success** → grid + detail panel; status pill "Choose a time" tinted `--teal-soft`.
- **Choosing** — Confirm button disabled with `aria-busy="true"`; selected chip stays in
  selected state.
- **Lost-pick race** → non-blocking toast (`--warn`) "That time was just taken — here are the
  current options" + refetch repopulates the grid. The previously selected chip clears.
- **Booked success** → anchor card + detail actions; status pill "Confirmed" tinted `--good`.
- **Cancelled** → full-width callout; status pill "Cancelled" tinted `--warn`; `cancelledBy`
  attributed.
- **Completed** → full-width callout; status pill "Completed" tinted `--good`.
- **Cancel-confirm dialog** → token-driven; "Cancel interview?" + body explaining the recruiter
  is notified + a `.btn.btn-danger` "Cancel interview" + `.btn-ghost` "Keep". Idempotent
  double-cancel is a no-op silent success.
- **Reduced motion.** Day-column entrance reveals no-op under `prefers-reduced-motion: reduce`.
- **Responsive.** Two-column ≥961px (grid + detail panel side-by-side); single-column ≤960px
  (detail stacks below; sticky Confirm button at the bottom of the viewport when the grid is
  scrolled).
- **Dark + light.** All colors via tokens. Selected chip uses `--teal-soft` + `--teal-strong`
  ink in both themes; anchor card uses the demo's `linear-gradient(135deg,
  color-mix(in oklch, var(--teal) 8%, var(--surface)), var(--surface))`. No hard-coded hex.
- **A11y.** Slot picker is `role="radiogroup" aria-label="Available interview times"` with
  each chip `role="radio" aria-checked={selected}` (keyboard: arrow keys move selection within
  the group; Space confirms). The `<ScheduleHead />` lead caption sets timezone expectation
  textually ("Times shown in {viewerTimeZone()}"). The cancel confirm dialog has
  `aria-modal="true"` with focus trap and Esc-to-dismiss. Decorative SVG icons `aria-hidden`.
  Touch targets ≥44×44 (slot cells are 56px tall). `:focus-visible` rings use `--teal` 2px
  outline / 4px halo. Contrast ≥4.5:1.

## Acceptance

- The grid + detail panel surface matches the Aperture Pro design language tokens, type scale,
  motion vocabulary, and accent treatment 1:1. Side-by-side screenshot proof committed under
  `docs/brand/redesign-v3/verify/scheduling-{light,dark}-{proposed,booked,cancelled,completed,empty}.jpeg`.
- `--filter @ip/candidate build` is green; `tsc --noEmit` is green; no console errors /
  warnings; reduced-motion is honored.
- **Zero functional diff** vs the old scheduling page: same `useSchedule` hook, same 15s poll
  with `refetchIntervalInBackground: false`, same `ChooseSlot` CAS, same `ALREADY_EXISTS`
  friendly path + refetch, same `Cancel` idempotent double-cancel, same `GetIcs` client-side
  download, same query keys, same dashboard `["scheduling","candidate-interviews"]`
  invalidation on a successful choose / cancel.
- **UTC discipline preserved (load-bearing):** the new page introduces no tz math;
  `formatLocal` / `viewerTimeZone` remain the only render-time tz boundary; the wire still
  carries `...Z` ISO; the ICS file's `DTSTART` is the verbatim `chosenStartAt` UTC.
- Pre-launch posture is enforced: no fake company names in `location`, no claimed
  "Google Calendar / Outlook integration" (the Add-to-calendar button is truthfully an `.ics`
  download). Sample data uses generic names.
- Mock→real path (`NEXT_PUBLIC_MOCK=1` → `SchedulingService`) is unchanged — only the existing
  1-line client constructor swap.
