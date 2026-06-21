# Job alerts — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

A signed-in candidate's saved-search "job alerts" surface — create / list / delete with confirm — rebuilt as an Aperture Pro layout inside the `.app` shell: a `.cell.anchor` create form anchoring a stack of in-cell alert rows. **The data layer is FROZEN** — the `["job-alerts"]` query, the create / delete mutations (with `toast` + invalidation), and the pure `summarizeAlert` helper continue exactly as today; only the UI is new. **The FE never triggers a run**; the scheduled sweep is a separate BE pillar task.

## Route + role

`/alerts` · **candidate**. Rendered inside the new candidate `.app` shell (sidebar `Alerts` `aria-current="page"`).

## Approved mockup (build to this exactly)

- **Reference demo:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html) — the design system at landing altitude. This screen uses the same `.cell` / `.cell.anchor` / `.input` / `.pill-*` / `.badge` / `.btn-*` primitives, with `.toolbar` and `.searchbox` for the create form row.
- **No per-screen mockup file.** Build directly against the design language doc; Task 0 captures a fidelity reference screenshot.

## Existing code being REPLACED (not modified)

Assume these will be rewritten from scratch:

- `frontend/apps/candidate/app/alerts/page.tsx` — markup rebuilt; the `["job-alerts"]` query, `create` / `remove` mutations, `toast` + invalidation, and `EmptyState` / `ErrorState` branches are **lifted verbatim** into the new file.
- `frontend/apps/candidate/components/alert-form.tsx` — replaced by an Aperture Pro `.cell.anchor` form (keyword `.input`, remote / frequency `<select>` styled like `.input`, `.btn-primary` "Create alert"). The controlled state and the `CreateAlertInput` it reports up are **unchanged**.
- `frontend/apps/candidate/components/alert-row.tsx` — replaced by an in-cell row primitive consuming `summarizeAlert(alert)` text + frequency `.badge` + last-run `.sub` + a confirm-gated `.btn-ghost.btn-sm` "Delete".
- `frontend/apps/candidate/lib/job-alerts-client.ts` — the `JobAlertsClient` seam, the live `makeApiJobAlertsClient(api)` swap path, and the pure `summarizeAlert` helper are **unchanged**.

## Layout & components

**Shell:** `.app` sidebar + topbar (candidate audience, `Alerts` active).

| Region | Markup / class | Notes |
|---|---|---|
| Sidebar | `.app > .side` | Candidate nav; `Alerts` `aria-current="page"`. |
| Topbar | `.topbar` | `.crumb` "Home / Alerts". `.toolbar` with audience pill, searchbox (not used on this screen), `NotificationBell`, avatar. |
| Page head | `.page-head` | `<h1 class="display">Job alerts</h1>` + `.sub` ("Save a search and we'll notify you when a new role matches."). Right side: a `.pill-teal` count chip ("`{n}` active") and a `.badge` link "Manage notifications" → `/notifications` (deep-link to where the sweep delivers). |
| Create form | `.cell.anchor` (`grid-column: span 4`) — **Create a new alert** | Header: `<h3>Create a new alert</h3>` + `.sub` ("We'll run it on your behalf — daily or weekly."). Body: a row of `.input`s (`keyword`, `location` text), `.input`-styled `<select>`s for `remoteMode` (`any` / `remote` / `hybrid` / `onsite`) + `employmentType` + `experienceLevel` + `frequency` (`daily` / `weekly`), and a skills chip-input (`.badge`-style chips with an inline `.input` + Add). Footer toolbar: `.btn-primary` "Create alert" (disabled until a keyword OR at least one filter is set) + a `.btn-ghost` "Reset". Field rhythm follows the landing's `.searchbox`-adjacent toolbar pattern. |
| Alerts list | Stack of in-cell rows inside a `.cell` container — **Your alerts** | `<h3>Your alerts</h3>` + `.sub` count. Each row: `summarizeAlert(alert)` text as the row title (e.g., "*Senior backend · Remote · Berlin · TypeScript, Go*"), a `.badge` frequency pill ("Daily" / "Weekly"), a `.sub` last-run line ("Last sent {relative}" or "Never run yet" when `lastRunAt === null`), and a `.btn-ghost.btn-sm` "Delete" on the right (confirm-gated). |
| Empty | `.cell.anchor` framed empty state | Headline ("No alerts yet"), supporting copy ("Create your first saved search above — daily or weekly digests, sent only when there's something new."). |

> **Primitives reference (do NOT redefine):** `.app · .side · .topbar · .crumb · .toolbar · .searchbox · .page-head · .cell · .cell.anchor · .input · .badge · .pill · .pill-{teal,good,warn} · .btn · .btn-{primary,ghost,sm}` — defined in `@ip/ui/src/app.css`. Tokens via `@ip/ui/src/tokens.css`.

**New presentational pieces to build:** the chip-input (badge chips + inline add `.input`) — shared with the candidate-profile skills cell; lives in `@ip/ui`.

## Data wiring / seam (FROZEN — preserve every existing seam)

- **Client/seam:** `jobAlertsClient` (the `JobAlertsClient` seam) calls `list()` / `create(input)` / `remove(alertId)`. Today it's bound to `makeMockJobAlertsClient()`; the one-line swap to `makeApiJobAlertsClient(api)` (over `api.jobAlerts.*`) lands once `pnpm gen` exposes the client. **Unchanged** — the rebuild must not touch the client wiring or the swap path.
- **Query keys (unchanged):**
  - `["job-alerts"]` — full alert list. Create + delete invalidate it; both `toast` on success / error.
- **Mutations (unchanged):**
  - `create(input)` — invalidates `["job-alerts"]`; `toast` "Alert created".
  - `remove(alertId)` — gated by the existing `ConfirmDialog`; invalidates `["job-alerts"]`; `toast` "Alert removed".
- **Fields consumed** (per [`backend_job-alerts.md`](./backend_job-alerts.md)): `JobAlertDTO` = `alertId`, `keyword`, `filters` (`location` / `remoteMode` / `employmentType` / `experienceLevel` / `skills[]`), `frequency` (`daily` / `weekly`), `createdAt`, `lastRunAt` (`null` → "Never run yet"). The pure `summarizeAlert(alert)` helper renders the human-readable summary string (unchanged).
- **The FE never triggers a run.** No "Run now" button. The scheduled sweep is a separate BE task that writes `lastRunAt` and emits notifications.

## Tasks

> **Task 0 — Fidelity baseline.** Confirm the Aperture Pro demo loads; capture reference shots at 1440×900 (light + dark) into `docs/brand/redesign-v3/verify/job-alerts-{light,dark}-reference.jpeg`. The build is screenshot-diffed against the design-language primitives in Task 4.

- **Task 1 — `/alerts` mounted in the candidate shell + page head.** Wrap the page in `<CandidateShell />` (from `@ip/ui`, introduced by the landing task) with `Alerts` `aria-current`. Topbar `.crumb` "Home / Alerts". Build the `.page-head` with the count chip and "Manage notifications" link. Verify the existing `["job-alerts"]` query mounts unchanged. Commit `apps/candidate/app/alerts/page.tsx`.
- **Task 2 — Create-form anchor cell.** Build the `.cell.anchor` create form using `.input`s, `<select>`s, and the new chip-input for the skills filter. Wire the **existing** controlled state + `CreateAlertInput` shape + `create.mutate` handler verbatim. Verify: the form validates (Create disabled until at least a keyword or one filter); submission `toast`s "Alert created" and the list invalidates; Reset clears local state without firing the mutation. Commit `apps/candidate/components/alert-form.tsx`.
- **Task 3 — Alert-row list + confirm-gated delete.** Build the in-cell alert-row primitive (`summarizeAlert(alert)` + frequency `.badge` + `lastRunAt` `.sub` + Delete). The Delete button opens the **existing** `ConfirmDialog`; on confirm, `remove.mutate(alertId)` fires and the row disappears on next invalidation. Verify: "Never run yet" renders when `lastRunAt === null`; deleting the last alert flips to the empty branch. Commit `apps/candidate/components/alert-row.tsx`.
- **Task 4 — Empty / loading / error + full assembly + fidelity verify.** Build the `.cell.anchor` empty state, the loading skeleton (3 placeholder in-cell rows), and the error branch.
  1. `--filter @ip/candidate build` is green; `--filter @ip/{ui,shared,api-client} typecheck` is green.
  2. Run the dev server, sign in as a candidate seeded with at least one alert.
  3. Screenshot at 1440×900 in both themes; visually diff against the Aperture Pro design-language primitives; iterate until the screen reads as the same product as the landing.
  4. Confirm: seeded alert renders with summary + last-run; submitting the create form prepends a new row + `toast`; Delete opens confirm and removes the row; empty state appears once all gone; nav highlights `Alerts`.
  5. Save final screenshots to `docs/brand/redesign-v3/verify/job-alerts-{light,dark}.jpeg`.

## States & a11y

- **States (all preserved):**
  - **Loading** — skeleton stack of 3 placeholder in-cell rows.
  - **Empty** — `.cell.anchor` ("No alerts yet" + supporting copy).
  - **Error** — `.cell.anchor` with the error message + a `.btn-ghost` "Retry" that calls `query.refetch()`.
  - **Success** — create form + alert-row list. Create / delete are mutations with `toast` feedback + `["job-alerts"]` invalidation; delete is **confirm-gated**.
  - **`lastRunAt === null`** → "Never run yet" (the sweep writes it; the FE never runs alerts).
- **Responsive:**
  - ≥ 1100px — full sidebar + topbar; create form is a wide multi-input row; alert rows span the content area.
  - 760–1099px — sidebar narrows; create form wraps to a 2-column grid; alert rows stay full width.
  - ≤ 760px — sidebar collapses to a drawer; create form stacks; alert-row footer (`lastRunAt` + Delete) stacks.
- **Dark + light:** all colors via tokens; frequency `.badge` uses `--ink-2` on `--surface-2`.
- **Reduced motion:** loading skeleton uses a token-driven static shimmer (no animation) under `prefers-reduced-motion: reduce`.
- **A11y:**
  - One `<h1>` (the greeting); create-form cell + list cell use `<h3>` + `aria-labelledby`.
  - The create form is a `<form>` with labelled fields; the `<select>`s are labelled (visible labels, not placeholder-only).
  - Each Delete button has `aria-label="Delete alert: {summary}"`; the confirm dialog is keyboard-accessible (focus-trapped, ESC closes).
  - The page-head count chip is `aria-live="polite"`.
  - Focus rings via tokens (`--teal` 2px outline + 4px halo); touch targets ≥ 44×44; body contrast ≥ 4.5:1.

## Acceptance

- The alerts screen reads as the same product as the Aperture Pro landing — same tokens, type scale, primitives (`.cell` / `.cell.anchor` / `.input` / `.badge` / `.pill-*` / `.btn-*`). Side-by-side screenshot proof committed at `docs/brand/redesign-v3/verify/job-alerts-{light,dark}.jpeg`.
- `--filter @ip/candidate build` is green; `tsc --noEmit` is green; no console errors / warnings; reduced-motion is honored.
- **Zero functional diff vs. today:** same `JobAlertsService` `create` / `list` / `delete` round-trips; same `["job-alerts"]` query key; same `toast` + invalidation; same confirm-gated delete; same pure `summarizeAlert` helper.
- **The FE never triggers a run** — there is no "Run now" affordance, and the row simply renders `lastRunAt` as written by the sweep.
- Mock → real swap path (`makeApiJobAlertsClient`) is unchanged; the components are seam-agnostic.
- Pre-launch posture is preserved: example copy uses generic phrasing ("Senior backend · Remote · Berlin") with no fabricated employer names.
