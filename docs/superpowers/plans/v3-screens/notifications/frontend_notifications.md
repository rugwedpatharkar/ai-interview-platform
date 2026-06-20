# Notifications — FE plan (Midnight reskin)

> **Screen & goal.** The full notification feed: a list of kind-scoped rows with per-kind icons, read state, relative
> time, and per-row deep-links + mark-all-read. (The header **bell** dropdown shares the same row component.) Goal:
> reskin into the Midnight `.app` shell — **a feed list with kind icons + read state**. **Appearance-only: zero
> behavior change.**
>
> **Unified route(s) + role:**
> - `/notifications` — **candidate** (`apps/candidate/app/notifications/page.tsx`).
> - `/company/notifications` — **company** (`apps/company/app/notifications/page.tsx`), with the company kind-scoping
>   render-filter (`filterCompanyKinds` / `COMPANY_KINDS`). **One component serves both** — the feed list + the row
>   (`NotificationItem`) are shared; only the per-app connector (data/poll + `kind→icon` map + the company filter)
>   differs. The header bell (`NotificationBell`) is mounted in both shells.
>
> **Mockup:** ✗ — build `docs/brand/redesign-v2/notifications.html` in **Task 0**.
> **Existing code it reskins** (markup/classes only):
> - `frontend/apps/candidate/app/notifications/page.tsx` (the full feed page).
> - `frontend/apps/candidate/components/notification-item.tsx` (one feed row — the reskin target).
> - `frontend/apps/candidate/components/notification-bell.tsx` (header bell + dropdown).
> - `frontend/apps/candidate/app/notifications/notifications-client.ts` (client + `kind→icon` map + query keys — **untouched**).
> - company `filterCompanyKinds` in `apps/company/app/notifications/notifications-client.ts` (kind-scoping — **untouched**).
>
> **Backend:** `backend_notifications.md` (EXISTING — `NotificationService`: kind-scoped feed, mark-read, unread count).

---

## Layout & components

**Shell:** `.app` (sidebar + topbar). Both routes render in their app's shell; the bell lives in the `.topbar`
actions area.

**Feed list with kind icons + read state:**
- `.page-head` → `<h2>Notifications</h2>` + a `.btn-ghost` "Mark all read" (disabled at `unreadCount === 0`).
- The feed is a `.card` containing a divided list of **`NotificationItem` rows**. Each row:
  - **Kind icon** in a circular accent chip — `background: var(--accent-soft); color: var(--accent-ink)` (dark:
    softened via the token). The lucide icon is resolved by the app's `kind→icon` map (the lucide-in-app gotcha) and
    passed in as a prop (presentation-only row).
  - **Subject** (`.nm`/`--ink`) + **relative time** (`.sub`/`--ink-3`, right-aligned) on the top line; **body**
    (`.sub`, clamped two lines) below.
  - **Unread dot** — a `6–8px` `--accent` dot on unread rows; unread rows get a faint `--surface-2` wash. Read state
    derives from `readAt === null` (unchanged).
- The **bell dropdown** reuses the same `NotificationItem` row inside a panel (header + "Mark all read" + scroll
  region) — reskin its chrome to `.card`/`--surface`/`--line` tokens; the trigger badge becomes a `.pill-accent`/
  `.badge` micro-count ("9+" past 9).

**`@ip/ui` class map:** `.app/.content/.page-head` (shell), `.btn-ghost` (mark-all-read), `.card` (feed container +
dropdown panel), `.pill-accent`/`.badge` (bell count + per-kind tag), `.avatar`-style circular icon chip composed from
`--accent-soft`/`--accent-ink`. New: the kind-icon chip + unread-dot treatment (compose from tokens — **no new `@ip/ui`
primitive**).

## Data wiring (kept identical to today)

- **Client/seam:** `createNotificationsClient(useAuth().api)` (real gRPC) or `makeMockNotificationsClient()` behind
  `NEXT_PUBLIC_MOCK` — **unchanged**. Company connector additionally render-filters via `filterCompanyKinds`/
  `COMPANY_KINDS` and uses a company `kind→icon` map (omits `practice_complete`).
- **TanStack query keys:** `["notifications"]` (root), `["notifications","feed",unreadOnly]` (feed),
  `["notifications","unread"]` (badge poll, ~30s, `refetchIntervalInBackground: false`) — **unchanged**. Mark-read/
  mark-all-read mutations + `setQueryData(unread)` + `invalidateQueries(all)` reconciliation — **unchanged**.
- **Fields consumed** (from `backend_notifications.md` `Notification`): `id`, `kind`, `subject`, `body`, `link`,
  `createdAt`, `readAt`. **`unreadCount` is the server's fresh count** (the freshness contract). `link` is read
  **verbatim** (never built from `kind`).

## Tasks (bite-sized; presentation-only)

### Task 0 — build the mockup (mockup ✗)
- [ ] Build `docs/brand/redesign-v2/notifications.html` against `tokens.css` + `app.css`: the `.app` shell, the
  `.page-head` + "Mark all read", a `.card` feed of ~6 rows (mixed kinds, ~2 unread with the accent dot + wash, kind
  icon chips, relative time), and a header bell with a `.pill-accent` count + an open dropdown panel. Dark-first + light.
- [ ] Browser-verify on `:4173` (both themes); commit `docs/brand/redesign-v2/notifications.html` only.

### Task 1 — reskin `NotificationItem` (shared row)
- [ ] In `apps/candidate/components/notification-item.tsx`, swap ad-hoc Tailwind → the kind-icon chip
  (`--accent-soft`/`--accent-ink`), `.nm`/`.sub` text, relative-time, unread dot + wash treatment. Keep the
  `props in / callback out`, `formatRelative`, and `readAt === null` unread logic **identical**.
- [ ] Build + browser-verify; commit `apps/candidate/components/notification-item.tsx` only.

### Task 2 — reskin the feed page (candidate `/notifications`)
- [ ] Wrap `apps/candidate/app/notifications/page.tsx` in the Midnight shell; `.page-head` + `.btn-ghost`
  "Mark all read"; `.card` feed of reskinned rows. Keep the `useQuery` feed, `markRead`/`markAllRead` +
  invalidation, and verbatim `router.push(link)` **identical**.
- [ ] Build + browser-verify; commit that file only.

### Task 3 — reskin the header bell + dropdown
- [ ] In `apps/candidate/components/notification-bell.tsx`, reskin the trigger badge → `.pill-accent`/`.badge`
  count and the dropdown panel → `.card`/`--surface`/`--line`. Keep the badge poll, mark-all-read-on-open, and the
  shared `NotificationItem` rows **identical**.
- [ ] Build + browser-verify; commit that file only.

### Task 4 — company `/company/notifications` + bell (same components, kind-scoped)
- [ ] Apply the same reskin to the company feed page + bell, preserving `filterCompanyKinds`/`COMPANY_KINDS` and the
  company `kind→icon` map (omits `practice_complete`). One row component, one bell component; only the connector/filter
  differ.
- [ ] Build + browser-verify both apps; commit changed files only.

## States & a11y

- **Loading** → skeleton rows (3 in the dropdown). **Empty** → "You're all caught up" card. **Error** → inline error +
  retry. **Success** → the feed. The bell badge is hidden at 0, "9+" past 9.
- **Responsive:** feed is a single column; the bell dropdown is anchored, `max-height` scroll, near-full-width on
  mobile (today's behavior).
- **Dark + light:** icon chip (`--accent-soft`/`--accent-ink`), unread dot (`--accent`), badge — all token-driven;
  **no hardcoded color**.
- **A11y:** the bell trigger `aria-label` carries the count ("Notifications, N unread") with a visually-hidden
  `aria-live="polite" aria-atomic` announcer; each row is a `<button>` with `aria-label="{subject} — unread|read"`;
  "Mark all read" is a labelled button; Radix dropdown gives keyboard open/close + focus return; contrast ≥4.5:1.

## Acceptance

Matches `notifications.html`; both app builds/typechecks green; **zero functional diff** (same client, query keys,
~30s badge poll, fresh `unreadCount`, verbatim deep-links, mark-all-read-on-open, company kind-scoping); mock→real
(`NotificationService`) path unchanged.
