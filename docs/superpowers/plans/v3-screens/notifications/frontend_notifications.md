# Notifications — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

The full notification feed — a stack of kind-scoped rows with per-kind icons, read state, relative time, per-row deep-links, and mark-all-read — rebuilt inside the `.app` shell as an Aperture Pro `.cell.anchor` feed with kind-icon chips and an unread-dot treatment. The header **bell** dropdown reuses the same row component in a `.cell`-styled panel. **One row component serves both candidate and company audiences**; only the per-app connector (data / poll + `kind → icon` map + the company render-filter) differs. **The data layer is FROZEN** — same `NotificationService` round-trips, same query keys, same ~30s badge poll, same mark-all-read flows; only the UI is new.

## Route + role

- `/notifications` — **candidate** (`apps/candidate/app/notifications/page.tsx`).
- `/company/notifications` — **company** (`apps/company/app/notifications/page.tsx`), with the company kind-scoping render-filter (`filterCompanyKinds` / `COMPANY_KINDS`).
- The header **bell** (`NotificationBell`) is mounted in both shells' topbars.

Both routes render inside the new audience-appropriate `.app` shell (candidate sidebar / company sidebar; `Notifications` `aria-current="page"` in each).

## Approved mockup (build to this exactly)

- **Reference demo:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html) — the design system at landing altitude. The feed uses the same `.cell` / `.cell.anchor` / `.pill-*` / `.badge` / `.btn-*` primitives; the kind-icon chip is composed from `--teal-soft` / `--teal-ink` (lucide icons from the existing sprite); the unread dot is a `--teal` dot atop a `--surface-2` row wash.
- **No per-screen mockup file.** Build directly against the design language doc; Task 0 captures a fidelity reference screenshot.

## Existing code being REPLACED (not modified)

Assume these will be rewritten from scratch:

- `frontend/apps/candidate/app/notifications/page.tsx` — markup rebuilt; the `useQuery` feed, `markRead` / `markAllRead` mutations + invalidation, and the verbatim `router.push(link)` are **lifted verbatim** into the new file.
- `frontend/apps/company/app/notifications/page.tsx` — same rebuild applied with the company kind-scoping filter (`filterCompanyKinds` / `COMPANY_KINDS`).
- `frontend/apps/candidate/components/notification-item.tsx` — replaced by a new shared `NotificationItem` (lives in `@ip/ui` so both apps consume one source) composed from the kind-icon chip + `.nm` / `.sub` text + relative time + unread dot + wash. **The `props in / callback out` contract and the `readAt === null` unread logic are kept identical.**
- `frontend/apps/candidate/components/notification-bell.tsx` — replaced by a new bell trigger (badge count rendered as `.pill-teal` / `.badge` micro-count, "9+" past 9) + a `.cell`-styled dropdown panel. The shared `NotificationItem` rows render inside the panel.
- `frontend/apps/candidate/app/notifications/notifications-client.ts` — the client factory + `kind → icon` map + query keys are **unchanged**. The company connector's `filterCompanyKinds` / `COMPANY_KINDS` + company `kind → icon` map (omits `practice_complete`) are **unchanged**.

## Layout & components

**Shell:** `.app` sidebar + topbar in each audience's app (candidate shell on `/notifications`, company shell on `/company/notifications`). The bell lives in the `.topbar` actions area in both.

| Region | Markup / class | Notes |
|---|---|---|
| Sidebar | `.app > .side` | Audience-appropriate nav; `Notifications` `aria-current="page"`. |
| Topbar | `.topbar` | `.crumb` "Home / Notifications". `.toolbar` with audience pill, searchbox (client-side filter — not a fetch), `NotificationBell`, avatar. |
| Page head | `.page-head` | `<h1 class="display">Notifications</h1>` + `.sub` ("`{unreadCount}` unread / `{total}` total"). Right side: a `.toolbar` with a filter `.pill` toggle (`All` / `Unread`) bound to the `unread_only` query param, and a `.btn-ghost` "Mark all read" (disabled when `unreadCount === 0`). |
| Feed | `.cell.anchor` (`grid-column: span 4`) containing a divided list of `NotificationItem` rows. | Each row: a **kind-icon chip** (40×40 circular, `background: var(--teal-soft); color: var(--teal-ink)`; lucide icon resolved by the app's `kind → icon` map and passed in as a prop — keeps the lucide-in-app gotcha intact), the **subject** (`.nm` / `--ink`) + **relative time** (`.sub` / `--ink-3`, right-aligned) on the top line, the **body** (`.sub`, clamped 2 lines) below, and a small **kind tag** (`.badge` mono micro-label, e.g., "INTERVIEW", "MESSAGE", "REPORT") in the row footer. Unread rows: a 7px `--teal` **dot** anchored at the top-left of the row + a faint `--surface-2` wash across the row. Read state derives from `readAt === null` (unchanged). Whole row is a `<button>` that fires `markRead(id)` (optimistic via `setQueryData(unread)`) then `router.push(link)` verbatim. |
| Empty | `.cell.anchor` framed empty state | Headline ("You're all caught up"), supporting copy ("Nothing new since you last checked.") |
| Bell trigger | `<button>` in `.topbar` | Lucide bell icon; the count badge is `.pill-teal` (or `.badge`) micro-count — "9+" past 9; `aria-label="Notifications, N unread"`. |
| Bell dropdown | `.cell` panel anchored to the bell | Header row: `<h3>Notifications</h3>` + `.btn-ghost.btn-sm` "Mark all read"; scroll region (`max-height: 60vh`) with up to 10 most-recent `NotificationItem` rows; footer row: `.btn-ghost.btn-sm` "See all" → `/notifications` (or `/company/notifications`). |

> **Primitives reference (do NOT redefine):** `.app · .side · .topbar · .crumb · .toolbar · .page-head · .cell · .cell.anchor · .pill · .pill-{teal,good,warn,danger,coral} · .badge · .btn · .btn-{primary,ghost,sm}` — defined in `@ip/ui/src/app.css`. Tokens via `@ip/ui/src/tokens.css`.

**New presentational pieces to build:** the kind-icon chip (composed from `--teal-soft` / `--teal-ink` + a lucide icon prop) and the unread-dot + row-wash treatment — both live in `@ip/ui` next to the new shared `NotificationItem`. No new `@ip/ui` primitive needed beyond the row component itself.

## Data wiring / seam (FROZEN — preserve every existing seam)

- **Client/seam:**
  - Candidate: `createNotificationsClient(useAuth().api)` (real gRPC) or `makeMockNotificationsClient()` behind `NEXT_PUBLIC_MOCK` — **unchanged**.
  - Company: same factory, plus render-filters via `filterCompanyKinds` / `COMPANY_KINDS`, with a company `kind → icon` map (omits `practice_complete`) — **unchanged**.
- **Query keys (unchanged):**
  - `["notifications"]` — root key for invalidation.
  - `["notifications","feed", unreadOnly]` — feed query (`ListNotifications({ page, page_size, unread_only })`); `unreadOnly` is the filter pill state.
  - `["notifications","unread"]` — badge poll, ~30s, `refetchIntervalInBackground: false` (pauses on a hidden tab).
- **Mutations (unchanged):**
  - `markRead(id)` — calls `NotificationService.MarkRead`; on success `setQueryData(["notifications","unread"], r.unreadCount)` and `invalidateQueries(["notifications"])`.
  - `markAllRead()` — calls `NotificationService.MarkAllRead`; on success `setQueryData(["notifications","unread"], 0)` and `invalidateQueries(["notifications"])`.
  - Bell mark-all-read-on-open is preserved exactly as today.
- **Fields consumed** (per [`backend_notifications.md`](./backend_notifications.md)) from `Notification`: `id`, `kind`, `subject`, `body`, `link`, `createdAt`, `readAt`. **`unreadCount` is the server's fresh count** (the freshness contract — never a cached counter). `link` is read **verbatim** (never built from `kind`).
- **Client-derived (no new RPC):** the relative-time string is computed by the existing `formatRelative` helper; the kind-tag micro-label is mapped from `kind` via the existing per-app `kind → icon` map (extended with a `kind → label` companion in the same file).

## Tasks

> **Task 0 — Fidelity baseline.** Confirm the Aperture Pro demo loads; capture reference shots at 1440×900 (light + dark) into `docs/brand/redesign-v3/verify/notifications-{light,dark}-reference.jpeg`. Both audiences are screenshot-diffed against the design-language primitives in Task 4 (candidate) and Task 5 (company).

- **Task 1 — Shared `NotificationItem` in `@ip/ui`.** Build the new row component: kind-icon chip (`--teal-soft` background + `--teal-ink` icon, lucide icon passed in as a prop — the lucide-in-app gotcha is preserved by keeping the icon prop in the consumer), `.nm` / `.sub` text, right-aligned relative time, kind-tag `.badge`, unread dot + `--surface-2` row wash. Keep the `props in / callback out` contract and the `readAt === null` unread logic identical to today. Verify a hard-coded story renders identically in both themes. Commit `packages/ui/src/notification-item.tsx` + `packages/ui/src/app.css`.
- **Task 2 — Candidate `/notifications` page.** Wrap `apps/candidate/app/notifications/page.tsx` in `<CandidateShell />` with `Notifications` `aria-current`. Topbar `.crumb` "Home / Notifications". Build the `.page-head` (filter pill + Mark all read). Build the `.cell.anchor` feed using the shared `NotificationItem` rows; rows fire `markRead(id)` then `router.push(link)` verbatim. Keep the `useQuery` feed, `markRead` / `markAllRead` mutations + invalidation, and verbatim `router.push(link)` identical. Verify: clicking an unread row marks it read (optimistic via `setQueryData(unread)`) then navigates; the filter pill toggles between `All` and `Unread`; Mark all read flips every row + zeros the badge. Commit that file.
- **Task 3 — Header bell + dropdown (shared component in `@ip/ui`).** Build the new bell trigger (count badge → `.pill-teal` / `.badge` micro-count; "9+" past 9; `aria-label="Notifications, N unread"`) and the `.cell` dropdown panel (header + Mark all read + scroll region with up to 10 shared `NotificationItem` rows + "See all" footer link). Keep the ~30s badge poll, the mark-all-read-on-open behavior, and the shared row rendering identical to today. Verify: badge hidden at 0; "9+" past 9; opening the dropdown calls `markAllRead`; clicking a row marks-read then navigates. Commit `packages/ui/src/notification-bell.tsx`.
- **Task 4 — Candidate fidelity verify.** Build + screenshot at 1440×900 in both themes; visually diff against the Aperture Pro design-language primitives; iterate. Confirm: feed renders; unread dot + wash on unread rows; relative time aligns right; Mark all read disabled at `unreadCount === 0`; the bell badge is in sync with the feed (both keys invalidate). Save final screenshots to `docs/brand/redesign-v3/verify/notifications-candidate-{light,dark}.jpeg`.
- **Task 5 — Company `/company/notifications` page + bell.** Apply the same rebuild to the company feed page + bell, preserving `filterCompanyKinds` / `COMPANY_KINDS` and the company `kind → icon` map (omits `practice_complete`). One row component, one bell component; only the connector / filter differs. Verify the kind-scoping render-filter still omits candidate-only kinds. Save final screenshots to `docs/brand/redesign-v3/verify/notifications-company-{light,dark}.jpeg`.

## States & a11y

- **States (all preserved):**
  - **Loading** — skeleton rows (3 in the dropdown; 6 on the page) inside `.cell.anchor`.
  - **Empty** — `.cell.anchor` "You're all caught up" + supporting copy.
  - **Error** — `.cell.anchor` with the error message + a `.btn-ghost` "Retry" that calls `query.refetch()`.
  - **Success** — feed renders; unread rows carry the dot + wash; the bell badge mirrors the server's `unreadCount`.
- **Responsive:**
  - ≥ 1100px — full sidebar + topbar; feed is single column at a comfortable line length; bell dropdown anchored to the bell.
  - 760–1099px — sidebar narrows; feed stays single column; dropdown anchors as before.
  - ≤ 760px — sidebar collapses to a drawer; feed rows compact (kind-icon chip + subject + relative time on one line, body clamped); bell dropdown becomes near-full-width with a `max-height` scroll (today's behavior).
- **Dark + light:** icon chip (`--teal-soft` / `--teal-ink`), unread dot (`--teal`), row wash (`--surface-2`), badge — all token-driven; no hardcoded color.
- **Reduced motion:** loading skeleton uses a token-driven static shimmer (no animation) under `prefers-reduced-motion: reduce`; the bell badge does not pulse.
- **A11y:**
  - One `<h1>` per page (the greeting).
  - The bell trigger `aria-label` carries the count ("Notifications, N unread") with a visually-hidden `aria-live="polite" aria-atomic` announcer for badge changes.
  - Each row is a `<button>` with `aria-label="{subject} — unread|read"`; the kind-icon chip is `aria-hidden` (the subject text is the readable label).
  - "Mark all read" is a labelled `<button>`; disabled state is communicated via `aria-disabled` (not visually only).
  - The Radix dropdown gives keyboard open / close + focus return; ESC closes; `Enter` on a row marks-read + navigates.
  - Focus rings via tokens (`--teal` 2px outline + 4px halo); touch targets ≥ 44×44; body contrast ≥ 4.5:1.

## Acceptance

- Both `/notifications` and `/company/notifications` read as the same product as the Aperture Pro landing — same tokens, type scale, primitives (`.cell.anchor` / `.pill-teal` / `.badge` / `.btn-*`). Side-by-side screenshot proof committed at `docs/brand/redesign-v3/verify/notifications-{candidate,company}-{light,dark}.jpeg`.
- Both app builds (`@ip/candidate`, `@ip/company`) + typecheck are green; no console errors / warnings; reduced-motion is honored.
- **Zero functional diff vs. today:** same `NotificationService` client; same `["notifications"]` / `["notifications","feed", unreadOnly]` / `["notifications","unread"]` query keys; same ~30s badge poll with `refetchIntervalInBackground: false`; fresh server `unreadCount` reflected on the badge; verbatim `router.push(link)` deep-links; mark-all-read-on-open in the bell; company kind-scoping (`filterCompanyKinds` / `COMPANY_KINDS`) preserved.
- The lucide-in-app gotcha is preserved: the icon prop is supplied by the per-app `kind → icon` map and rendered inside the shared `NotificationItem` (the icon library is not bundled into `@ip/ui`).
- Mock → real swap path (`NEXT_PUBLIC_MOCK`) is unchanged.
- Pre-launch posture is preserved: no fabricated notification content in empty / loading copy; sample / story rows in dev use generic phrasing.
