# Scheduling — FE plan (Midnight reskin)

> **Screen & goal.** The candidate interview-scheduling surface: pick a proposed time slot (timezone-aware, stored
> UTC), or view a booked/cancelled/completed interview. Goal: reskin into the Midnight `.app` shell — a **day-grouped
> slot picker**. **Appearance-only: zero behavior change** (poll, choose-CAS, cancel, ICS download all unchanged).
>
> **Unified route + role:** `/schedule` — **candidate** (`apps/candidate/app/schedule/page.tsx`). Per-application via
> `?application=<id>`. (The recruiter propose-times surface is the company applicant-detail Schedule tab — a separate
> screen, not reskinned here.)
>
> **Mockup:** ✗ — build `docs/brand/redesign-v2/scheduling.html` in **Task 0**.
> **Existing code it reskins** (markup/classes only):
> - `frontend/apps/candidate/app/schedule/page.tsx` (the status-branched pick/booked/cancelled/completed page).
> - `frontend/apps/candidate/lib/use-schedule.ts` (poll + choose/cancel mutations — **untouched**).
> - `frontend/apps/candidate/lib/scheduling.ts` (client + query keys + `formatLocal`/`viewerTimeZone` boundary — **untouched**).
>
> **Backend:** `backend_scheduling.md` (EXISTING — `SchedulingService`: propose/pick/confirm/cancel; UTC↔local).

---

## Layout & components

**Shell:** `.app` (sidebar + topbar), candidate shell. `.page-head` → `<h2>Interviews</h2>` + a `.sub` "Times shown
in {viewerTimeZone()}" caption (sets the local-zone expectation).

**Day-grouped slot picker (the new layout) — branch on `schedule.status`:**
- **`"proposed"`** → a `.card` listing the offered slots **grouped by local day** (group header = the day rendered via
  `formatLocal`; slots under it as radio chips). Each slot is a selectable chip (compose from `.chip-toggle` —
  `aria-pressed`/`aria-checked` selected state uses `--accent`/`--accent-soft`), labelled `formatLocal(slot.startAt)` +
  `· {durationMinutes} min`. The whole group sits in `role="status" aria-live="polite"` so a newly-polled proposal is
  announced. Below: `location`/`note` (`white-space: pre-wrap`) + a `.btn.btn-primary` "Confirm time" (disabled until
  picked / while `choosing`).
- **`"booked"`** → a confirmation `.card`: "Interview confirmed for {formatLocal(chosenStartAt)}", the `location`, a
  `.btn.btn-primary` "Add to calendar" (→ `getIcs` → client-side `.ics` download, unchanged), and a `.btn-ghost`
  "Cancel" inside a confirm dialog.
- **`"cancelled"`** → a warning callout (`.pill-warn`/an `Alert tone="warning"` reskinned to `--warn` tokens) +
  `cancelledBy`. **`"completed"`** → a neutral callout ("This interview has taken place").

**`@ip/ui` class map:** `.app/.content/.page-head` (shell), `.card` (slot list / booked / callouts),
`.chip-toggle` (the day-grouped slot chips), `.btn.btn-primary`/`.btn-ghost` (confirm / cancel / add-to-calendar),
`.pill-warn`/`.pill-neutral` (cancelled/completed callouts). New: the day-group header + slot-chip-group treatment
(compose from `.chip-toggle` + tokens — **no new `@ip/ui` primitive**).

## Data wiring (kept identical to today)

- **Seam:** `useSchedule(applicationId)` over `createSchedulingClient(useAuth().api)` — poll `getSchedule`
  (`refetchInterval: 15_000`, `refetchIntervalInBackground: false`); `choose`/`cancel` mutations — **all unchanged**.
- **TanStack query keys:** `["scheduling","schedule",applicationId]` + `["scheduling","candidate-interviews"]` —
  **unchanged**. The `ALREADY_EXISTS` lost-pick path still surfaces "That time was just taken — here are the current
  options" + refetch.
- **The UTC/local boundary invariant (load-bearing — DO NOT change):** every persisted instant is **UTC**; the
  viewer's zone is applied **only at render** via `@ip/shared/datetime.ts` `formatLocal` (slots, booked time, the
  "times shown in {viewerTimeZone()}" caption). The candidate path is **read-only on time** — it picks an offered
  UTC `start_at` and sends it back verbatim (no local→UTC conversion on this screen; that conversion lives on the
  recruiter propose form). The reskin touches **markup/classes only** — it must not introduce any tz math, must not
  reformat the wire value, and must keep `formatLocal`/`viewerTimeZone` as the single render-time boundary.
- **Fields consumed** (from `backend_scheduling.md` `ScheduleDTO`): `status`, `slots[].startAt`/`.durationMinutes`,
  `chosenStartAt`, `chosenDurationMinutes`, `location`, `note`, `cancelledBy`. `getIcs` → `{filename, content}` for
  the download.

## Tasks (bite-sized; presentation-only)

### Task 0 — build the mockup (mockup ✗)
- [ ] Build `docs/brand/redesign-v2/scheduling.html` against `tokens.css` + `app.css`: the `.app` shell, the
  `.page-head` + "Times shown in {zone}" caption, a `.card` of **day-grouped** `.chip-toggle` slots (2 days, one
  selected) + a "Confirm time" `.btn-primary`; plus a second state panel showing the **booked** confirmation card
  (add-to-calendar + cancel). Dark-first + light pass.
- [ ] Browser-verify on `:4173` (both themes); commit `docs/brand/redesign-v2/scheduling.html` only.

### Task 1 — reskin the `"proposed"` day-grouped picker
- [ ] In `apps/candidate/app/schedule/page.tsx`, wrap in the Midnight shell + caption; reskin the `RadioGroup` slot
  list → the day-grouped `.chip-toggle` chips (keep the `value`/`onValueChange` selection + `formatLocal` labels +
  `role="status"` announcer **identical**). Keep "Confirm time" → `choose(picked)` unchanged.
- [ ] Build + browser-verify (slots grouped by local day; selection + confirm flips to booked via the mock; no console
  errors); commit that file only.

### Task 2 — reskin the booked / cancelled / completed branches
- [ ] Reskin the `"booked"` confirmation card (`.btn-primary` add-to-calendar via `getIcs` download, `.btn-ghost`
  cancel-in-confirm-dialog) and the `cancelled`/`completed` callouts to `--warn`/`--neutral` tokens. Keep the
  download/cancel handlers **identical**.
- [ ] Build + browser-verify each branch; commit that file only.

## States & a11y

- **Loading** → `LoadingState`. **Empty** (no proposal, no booking) → "No interview scheduled" card. **Error** →
  inline error + retry. **Success** → the status-branched surface. **Lost pick** → friendly toast + refetch (today's
  behavior).
- **Responsive:** the day groups + slot chips stack on mobile; the booked card's buttons wrap.
- **Dark + light:** slot chips (`.chip-toggle` `--accent`/`--accent-soft`), callouts (`--warn`/`--neutral`), buttons —
  all token-driven; **no hardcoded color**.
- **A11y:** the slot picker is a labelled radio/chip group inside `role="status" aria-live="polite"` (a newly-polled
  proposal is announced); the "times shown in {zone}" caption sets expectations; the cancel confirm dialog gates the
  destructive action; decorative icons `aria-hidden`; focus rings via `:focus-visible`; contrast ≥4.5:1.

## Acceptance

Matches `scheduling.html`; build/typecheck green; **zero functional diff** (poll 15s, choose-CAS + `ALREADY_EXISTS`
friendly path, cancel, ICS download, query keys all unchanged); **UTC discipline preserved** — `formatLocal`/
`viewerTimeZone` remain the only render-time tz boundary, no tz math added, the wire still carries `...Z` ISO;
mock→real (`SchedulingService`) path unchanged.
