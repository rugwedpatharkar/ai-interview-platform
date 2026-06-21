# Messaging inbox — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

A dual-audience conversation list — one row per application thread — for both candidates and
companies. Replace the existing inbox tree with an Aperture Pro **conversation rail + active
thread preview** surface that lives inside the `.app` shell. Unread state, last snippet, and
last-message timestamp are first-class; the 30s thread-list poll, the total-unread nav badge
math, the `["messages","threads"]` query key, and the navigation contract (`/messages/[id]`) all
stay byte-for-byte identical. Pre-launch posture throughout — sample threads are labelled
"Sample candidate" / "Candidate A", no fake company names, no claimed integrations.

## Route + role

- `/messages` — **candidate** (`apps/candidate/app/messages/page.tsx`).
- `/company/messages` — **company / recruiter** (renders inside the company `.app` shell).
- **One component serves both audiences.** `MessagesInbox` is role-aware via a `side:
  "candidate" | "recruiter"` prop; the route wrappers only differ in which shell wraps them and
  in the attribution copy ("Conversations about your applications" vs "Candidate conversations").
  The data hook and query key are identical across both.

## Approved mockup (build to this exactly)

- **Design language reference:** [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
  No per-screen mockup file yet; build the screen against the design language tokens, type scale,
  components, and motion vocabulary directly. The two-pane chrome (rail + active panel) is
  composed from `.cell`, `.surface-2`, `.pill-teal`/`.pill-coral`, `.avatar`, `.badge`, and the
  `.app` shell — all present in the demo.

A side-by-side fidelity check against the design language is part of acceptance — see
"Acceptance" below.

## Existing code being REPLACED (not modified)

Delete-and-rebuild scope (assume these UI files will be re-written from scratch by the new plan;
the data seam is **preserved verbatim**):

- `frontend/apps/candidate/app/messages/page.tsx` — candidate inbox route wrapper. UI replaced.
- `frontend/apps/company/app/messages/page.tsx` (and/or the embedded recruiter inbox surface
  inside the applicant-detail page) — company inbox route wrapper. UI replaced.

**Untouched (data seam — preserved verbatim):**

- `frontend/apps/candidate/app/messages/messages-client.ts` — `createMessagesClient` /
  `makeMockMessagesClient` real-vs-mock seam, `listQueryKey()`, the camelCase `ThreadDTO`
  contract from `backend_messaging-inbox.md`.
- The company app's thin-duplicate messages client (mirrors the candidate seam for
  `side="recruiter"`).
- The 30s `useQuery({ queryKey: ["messages","threads"], refetchInterval: 30_000,
  refetchIntervalInBackground: false })` cadence and the total-unread reduction
  (`threads.reduce((s, t) => s + t.unread, 0)`) the nav badge depends on.

## Layout & components — map to `@ip/ui` and tokens

The inbox uses the `.app` sidebar+topbar shell (same as every authenticated v3 screen). The
content area is a two-pane layout: the **conversation rail** on the left and the **active-thread
preview** on the right, collapsing to a single pane (rail only) on mobile. Pull all primitives
from `@ip/ui` per [`_design-language.md`](../_design-language.md). New surface-only treatments
that this screen owns live under `apps/<candidate|company>/components/messaging/`.

| Region | Component (new) | Primitives / tokens |
|---|---|---|
| App shell | reuse `<AppShell side={side} />` | `.app`, `.side`, `.topbar`, `.content` |
| Page head | `<InboxHead />` | `h2` Schibsted Grotesk `--step-3`, lead in `--ink-2`, audience-specific subtitle |
| Two-pane frame | `<InboxFrame />` | CSS Grid `grid-template-columns: minmax(320px, 380px) 1fr; gap: 1.25rem;`; collapses to single column at `≤1000px` |
| Conversation rail | `<ThreadRail />` | `<nav role="navigation" aria-label="Conversations">`; container is `.cell` (22px radius, 1px border); inner list is `role="list"` |
| Rail row | `<ThreadRow />` | composed of `.avatar` + `.who` (Schibsted `--step-0` job title + Hanken `--step--1` company) + 1-line snippet (`--ink-2`) + mono timestamp (`--step--2`, `Geist Mono`) + unread `.badge` / `.pill-teal` |
| Active row treatment | `[aria-current="true"]` | background `--teal-soft`, leading 3px `--teal` rail accent (full border, NOT a side-stripe) |
| Filter row (optional) | `<InboxFilter />` | search input + `.pill` audience pill ("Unread" toggle) |
| Active panel | `<ActivePanel />` | wraps the per-screen `<MessageThreadView />` (see [message-thread](../message-thread/frontend_message-thread.md)) inside a `.cell`; consumes the same hooks and tokens |
| Empty selection | `<NoThreadSelected />` | `.cell` with aperture-mark icon (`<symbol id="mark">`) + "Select a conversation" |
| Empty inbox | `<EmptyInbox />` | `.cell` anchor variant with `--teal-soft` tint, copy "When a recruiter messages you, it shows up here" / "Candidate conversations land here" |

**Row anatomy** — one row, top to bottom:

1. Top line: `.avatar` (24×24, party initials) + `.who .nm` (job title, weight 600) + right-aligned
   mono timestamp.
2. Subline: `.who .sub` (company name) in `--ink-3`.
3. Snippet: one-line truncated `lastSnippet` in `--ink-2`, `text-overflow: ellipsis`.
4. Trailing: when `unread > 0`, a `.badge` showing the count, tinted `--teal-soft` with
   `--teal-strong` ink. Touch target ≥ 44px.

**Anti-slop bans (apply explicitly here):**

- No left-border side-stripe accent on rail rows. Active state is a full-border + tinted
  background, NOT a 4px left bar.
- No glass blur on the rail. It's a flat `.cell`.
- No "01 / 02" numeric markers on threads; conversations are not a sequence.
- No fake company names. Sample data uses "Sample candidate" / "Candidate A" + generic role
  titles ("Sample role").

## Data wiring / seam (preserved verbatim)

- **Client/seam:** `createMessagesClient(useAuth().api)` (real gRPC-web) or
  `makeMockMessagesClient(...)` behind `NEXT_PUBLIC_MOCK=1`. **Unchanged.** The new UI consumes
  the same client, same shape, same camelCase normalization.
- **Query key:** `["messages","threads"]` (`listQueryKey()`), `refetchInterval: 30_000`,
  `refetchIntervalInBackground: false`. **Unchanged.**
- **Fields consumed** (from `backend_messaging-inbox.md` `ThreadDTO`): `applicationId`,
  `jobTitle`, `companyName`, `lastMessageAt`, `lastSnippet`, `unread`. Server returns threads
  **desc-sorted by `lastMessageAt`** — the rail renders that order verbatim, never re-sorts.
- **Total-unread nav badge** continues to derive from
  `threads.reduce((s, t) => s + t.unread, 0)` and feeds the sidebar Messages count. The new
  shell consumes the same selector.
- **Selection state** is local UI state only: `useState<string | null>(applicationId)`. Routing
  is unchanged — clicking a rail row pushes `/messages/[applicationId]` on candidate and
  `/company/messages/[applicationId]` on company, and the active panel reads the route param to
  decide which thread to embed.
- **Mock parity test (must keep green):** the `pnpm test` mock-vs-real contract check around
  `MessagingService.listThreads` continues to pass; new UI must not introduce field reads beyond
  the documented `ThreadDTO`.

## Tasks (build → screenshot-verify → commit per task)

> **Task 0 — Mockup is the design language.** No per-screen mockup file. Reference is the
> design language doc + the demo at
> [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html). Do not
> modify the demo.

- **Task 1 — Inbox primitives into `@ip/ui` (if missing).** Confirm `.thread-rail`,
  `.thread-row`, `.thread-row[aria-current="true"]` rules exist in `@ip/ui/src/app.css`. If not,
  add them composed from existing tokens (`--surface`, `--surface-2`, `--teal-soft`,
  `--teal-strong`, `--line`, `--r-lg`). The rail itself is a `.cell` variant — no new primitive.
  Verify the unified app still boots and `--filter @ip/ui build` is green. Commit
  `frontend/packages/ui/src/app.css`.
- **Task 2 — `<ThreadRow />` + `<ThreadRail />`.** Build the rail container, list semantics
  (`<nav role="navigation" aria-label="Conversations">` → `<ul role="list">`), and one row
  component. Wire the unread `.badge`, the mono timestamp, and the `[aria-current="true"]`
  active treatment. Verify visually against the design language (avatar size, type scale, row
  height ≥56px for touch). Commit the new components.
- **Task 3 — Candidate `/messages` page.** Build `apps/candidate/app/messages/page.tsx` against
  the new components inside the candidate `.app` shell. Wire the existing `useQuery` with
  `listQueryKey()` and 30s refetch — DO NOT change keys or cadence. Wire `Link
  href="/messages/{applicationId}"` per row and `selectedId` from the route param. Screenshot
  the rail in both themes; verify the unread badge math still feeds the sidebar. Commit
  `apps/candidate/app/messages/page.tsx`.
- **Task 4 — Active-panel embedding + responsive collapse.** On `≥1001px`, render
  `<ActivePanel applicationId={selectedId} />` to the right of the rail (it consumes the
  reskinned `<MessageThreadView />` from [message-thread](../message-thread/frontend_message-thread.md)).
  On `≤1000px`, hide the right pane and let row clicks navigate to the thread route as today.
  Verify both panes share `.cell` tokens; verify the rail+panel layout does not exceed the
  shell width. Commit changed files.
- **Task 5 — Company `/company/messages` page.** Build the company route to render the same
  `<MessagesInbox side="recruiter" />` inside the company `.app` shell, using the company app's
  thin-duplicate messages client. Attribution copy switches to "Candidate conversations". Verify
  both apps build (`--filter @ip/candidate build` and `--filter @ip/company build` both green).
  Commit changed files.
- **Task 6 — Full screen assembly + verify.**
  1. `--filter @ip/candidate build` and `--filter @ip/company build` are both green; `tsc
     --noEmit` is green in both apps.
  2. Run the dev server, navigate to `/messages` (candidate) and `/company/messages` (company)
     signed-in, screenshot in both themes at 1440×900 and 390×844.
  3. **Side-by-side fidelity check** against the design language tokens — verify rail/row
     spacing, mono timestamps, unread badge tint, active row treatment, type scale.
  4. Confirm a row click still routes to `/messages/[applicationId]` (candidate) or
     `/company/messages/[applicationId]` (company).
  5. Confirm the sidebar Messages badge still reflects total unread across all threads
     (`reduce` continues to feed it).
  6. Confirm `NEXT_PUBLIC_MOCK=1` renders the mock seed and that flipping to real (the existing
     1-line client swap) is the only path change.

## States & a11y

- **Loading** → 5 skeleton rail rows (token-driven shimmer, 700ms `--ease-out`); the active
  panel shows its own skeleton when `selectedId` is set, otherwise the empty-selection card.
- **Empty inbox** → `.cell` anchor variant with the aperture mark + audience-appropriate copy
  ("When a recruiter messages you about an application, it shows up here." /
  "Candidate conversations across your jobs land here.").
- **Empty selection** (rail has rows, no selection on desktop) → `.cell` with mark icon +
  "Select a conversation".
- **Error** → inline `--danger`-tinted `.cell` with a `.btn-ghost` "Retry" that triggers
  `queryClient.refetchQueries({ queryKey: listQueryKey() })`.
- **Success** → rail + active panel.
- **New-message indicator** — on a 30s refetch that returns a row whose `unread` increased, the
  row's `.badge` pulses once (`--dur-mid`, reduced-motion-safe). The rail container is
  `aria-live="polite"` so SRs are notified of "Sample candidate — 1 new message".
- **Responsive.** Two-pane ≥1001px (rail 320–380px / panel fills); single-pane ≤1000px (rail
  fills, row click navigates). The sidebar follows the existing shell collapse breakpoint.
- **Dark + light.** All colors via tokens. Active row background is `--teal-soft` in both
  themes; unread `.badge` uses `--teal-strong` ink on `--teal-soft` fill. No hard-coded hex.
- **A11y.** `<nav role="navigation" aria-label="Conversations">` wraps the rail; rows are
  `<li>` containing `<Link>`; the selected row carries `aria-current="true"`. The unread count
  is part of the link's accessible name ("Sample role at Candidate A, 2 unread, 14m ago"). The
  active panel announces itself via `role="region" aria-label="Active conversation"`. Touch
  targets ≥44×44. `:focus-visible` rings use `--teal` 2px outline / 4px halo. Contrast ≥4.5:1
  body, ≥3:1 large text. Honors `prefers-reduced-motion` (no badge pulse, no skeleton shimmer).

## Acceptance

- The rail + active-panel surface matches the Aperture Pro design language tokens, type scale,
  and motion vocabulary 1:1. Side-by-side screenshot proof committed under
  `docs/brand/redesign-v3/verify/messaging-inbox-{light,dark}-{candidate,company}.jpeg`.
- Both app builds (`--filter @ip/candidate build`, `--filter @ip/company build`) and
  `tsc --noEmit` are green; no console errors / warnings on the rendered page; reduced-motion is
  honored.
- **Zero functional diff** vs the old inbox: same `MessagingService.ListThreads` call, same
  `["messages","threads"]` query key, same 30s `refetchInterval` with
  `refetchIntervalInBackground: false`, same server-sort consumption, same total-unread
  reduction feeding the sidebar badge, same route navigation contract.
- Pre-launch posture is enforced: sample rows use "Sample candidate" / "Candidate A" / "Sample
  role"; no fake company names, no fabricated metrics in copy.
- Mock→real path (`NEXT_PUBLIC_MOCK=1` → `MessagingService`) is unchanged — the only swap is
  the existing 1-line client constructor.
- The dual-audience invariant holds: candidate at `/messages` and recruiter at
  `/company/messages` render the same component with `side` flipped, and each only sees their
  caller-scoped threads (server-enforced; UI never tries to render the other side's `unread`).
