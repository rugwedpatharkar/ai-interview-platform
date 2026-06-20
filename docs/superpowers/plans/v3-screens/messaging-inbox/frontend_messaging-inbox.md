# Messaging inbox — FE plan (Midnight reskin)

> **Screen & goal.** The conversation list — one row per application thread — with unread badges and a
> preview of the latest snippet. Goal: reskin today's inbox into the Midnight `.app` shell with a
> **conversation-list rail + preview** layout. **Appearance-only: zero behavior change.**
>
> **Unified route(s) + role:**
> - `/messages` — **candidate** (`apps/candidate/app/messages/page.tsx`).
> - `/company/messages` — **company** (recruiter inbox; today the recruiter reaches threads from the applicant
>   detail Messages tab via `apps/company/components/message-thread-view.tsx`). **One component serves both** —
>   the inbox `MessagesInbox` is role-aware via a `side: "candidate" | "recruiter"` prop; the route wrappers differ
>   only in shell + nav placement.
>
> **Mockup:** ✗ — build `docs/brand/redesign-v2/messaging-inbox.html` in **Task 0**.
> **Existing code it reskins** (markup/classes only):
> - `frontend/apps/candidate/app/messages/page.tsx` (inbox list page).
> - `frontend/apps/candidate/lib/use-thread-messages.ts` (poll/optimistic/mark-read data seam — **untouched**).
> - `frontend/apps/candidate/app/messages/messages-client.ts` (client + query keys — **untouched**).
> - `frontend/apps/company/components/message-thread-view.tsx` (company-side thread surface referenced by the inbox).
>
> **Backend:** `backend_messaging-inbox.md` (EXISTING — `MessagingService.ListThreads`).

---

## Layout & components

**Shell:** `.app` (sidebar + topbar). Candidate route renders inside the candidate shell; company route inside the
company shell under `/company/*`. The inbox content sits in `.content`.

**Conversation-list rail + preview (the new layout):**
- `.page-head` → `<h2>Messages</h2>` + `.sub` ("Conversations about your applications" / "Candidate conversations").
- Two-column grid inside `.content`: a **conversation-list rail** (left, ~360px) + a **preview pane** (right, fills).
  On `≤1000px` the preview collapses (rail full-width; tapping a row routes to `message-thread`).
- **Rail rows** — reskin each thread row as a selectable list item: `.card.tight` styled row (or a custom
  `.thread-row`) with `.who` (avatar + `.nm` job title + `.sub` company name), a one-line `.sub` snippet
  (`last_snippet`), a right-aligned timestamp, and an unread count as `.pill.pill-accent` (or the `.badge`) when
  `unread > 0`. The currently-open thread row carries `aria-current="true"` and the active treatment
  (`inset 3px 0 0 var(--accent)` like `.navitem[aria-current]`).
- **Preview pane** — when a row is selected, embed the `message-thread` view (the existing `MessageThreadView`,
  reskinned in `message-thread/frontend_message-thread.md`). Empty selection → an empty-state card
  ("Select a conversation").

**`@ip/ui` class map:** `.app/.side/.main/.topbar/.content/.page-head` (shell), `.card`/`.card.tight` (rail rows),
`.who/.nm/.sub` (row identity), `.pill.pill-accent`/`.badge` (unread), `.avatar` (party), `.searchbox` (optional
filter), `.btn-ghost` (back on mobile). New: a `.thread-row` selectable-row treatment (compose from `.card.tight` +
the `aria-current` active rule) and the rail/preview grid. **No new `@ip/ui` primitive** — compose from existing
classes/tokens.

## Data wiring (kept identical to today)

- **Client/seam:** `createMessagesClient(useAuth().api)` (real gRPC) or `makeMockMessagesClient(...)` behind
  `NEXT_PUBLIC_MOCK` — **unchanged**. Company route uses the company app's thin-duplicate client (`side="recruiter"`).
- **TanStack query key:** `["messages","threads"]` (`listQueryKey()`), `refetchInterval: 30_000`,
  `refetchIntervalInBackground: false` — **cadence unchanged**.
- **Fields consumed** (from `backend_messaging-inbox.md` `ThreadDTO`): `applicationId`, `jobTitle`, `companyName`,
  `lastMessageAt`, `lastSnippet`, `unread`. Server sorts desc by `lastMessageAt` — **do not re-sort**. The total-unread
  nav badge still derives from `reduce((s,t)=>s+t.unread,0)`.

## Tasks (bite-sized; presentation-only — no logic, no TDD step beyond build/verify)

### Task 0 — build the mockup (mockup ✗)
- [ ] Build `docs/brand/redesign-v2/messaging-inbox.html` against `tokens.css` + `app.css`: the `.app` shell, the
  `.page-head`, the rail (5–6 `.thread-row` items with `.who`/`.sub`/unread `.pill-accent`, one `aria-current`) +
  the preview pane (a few chat bubbles + composer, matching `message-thread`'s surface). Dark-first; include a light
  pass.
- [ ] Browser-verify on the `:4173` preview (both themes); commit
  `docs/brand/redesign-v2/messaging-inbox.html` only.

### Task 1 — candidate `/messages` into the `.app` shell + rail
- [ ] Wrap `apps/candidate/app/messages/page.tsx` in the Midnight shell; `.page-head` title/sub.
- [ ] Swap the ad-hoc Tailwind list rows → the `.thread-row` rail treatment; map identity → `.who/.nm/.sub`,
  unread → `.pill-accent`. Keep the `Link href={/messages/${t.applicationId}}` + the 30s `useQuery` **identical**.
- [ ] Build + browser-verify (rows render, unread pill shows, no console errors); commit
  `apps/candidate/app/messages/page.tsx` only.

### Task 2 — preview pane + responsive collapse
- [ ] Add the right-hand preview pane (embed the reskinned `MessageThreadView`); selection drives `aria-current` on
  the rail row. On `≤1000px` hide the preview and keep row → route navigation (today's behavior) intact.
- [ ] Build + browser-verify (desktop two-pane; mobile single-pane routing); commit changed files only.

### Task 3 — company `/company/messages` (same component, recruiter side)
- [ ] Render the same `MessagesInbox` with `side="recruiter"` inside the company shell at `/company/messages`
  (attribution copy: "Candidate conversations"). Reuse the company thin-duplicate client; **hook/query untouched**.
- [ ] Build + browser-verify both apps; commit changed files only.

## States & a11y

- **Loading** → skeleton rail rows. **Empty** → "No messages" card ("When a recruiter messages you… it'll show
  up here" / company equivalent). **Error** → inline error + retry. **Success** → the rail + preview.
- **Responsive:** two-pane ≥1001px; single-pane (rail → route) ≤1000px (matches the `.app` sidebar collapse).
- **Dark + light:** all color via `--accent`/`--surface`/`--ink*` tokens; **no hardcoded color**. The unread pill,
  active row, and bubbles read theme vars only.
- **A11y:** the rail is a `<nav>`/list of links; the open row carries `aria-current="true"`; unread count is in the
  row's accessible name ("Senior Frontend Engineer, 2 unread"); focus rings via `:focus-visible`; contrast ≥4.5:1.

## Acceptance

Matches `messaging-inbox.html`; build/typecheck green for both apps; **zero functional diff** (same client, query
key, 30s cadence, server sort, unread reduction); the mock→real path (`NEXT_PUBLIC_MOCK` → `MessagingService`) is
unchanged.
