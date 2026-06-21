# Message thread — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

A two-party conversation surface for a single application: a scrollable transcript of message
bubbles + a composer, with optimistic send, mark-read on open / new-inbound, and a 5s receive
poll. Replace the existing thread view with an Aperture Pro panel that renders self bubbles in
the resolved accent (`--teal`) and other-party bubbles on `--surface-2`, framed by the `.cell`
container. The data seam (`useThreadMessages(applicationId, side)`), the in-flight ref-latch,
the `["messages","thread", applicationId]` query key, the `MAX_BODY = 4096` client guard, and
the inbox cache invalidation on send all stay byte-for-byte identical. Pre-launch posture
throughout — sample transcripts use "Sample candidate" / "Candidate A" / "Sample reviewer".

## Route + role

- `/messages/[applicationId]` — **candidate** (`apps/candidate/app/messages/[applicationId]/page.tsx`).
- `/company/messages/[applicationId]` — **company / recruiter** (in the company `.app` shell;
  also embeddable inside the applicant-detail Messages tab on
  `/company/jobs/[id]/applicants/[appId]`).
- **One component serves both audiences.** `MessageThreadView` is role-aware via the existing
  `side: "candidate" | "recruiter"` prop; `senderRole === side` decides self-vs-other and
  `otherLabel` flips between "Candidate" / "Reviewer". The data hook, optimistic logic, and the
  mark-read trigger are identical across both.

## Approved mockup (build to this exactly)

- **Design language reference:** [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
  No per-screen mockup file yet; the bubble surface is composed from `.cell`, `.surface-2`,
  `.avatar`, `--teal`, `--teal-soft`, `--teal-ink`, `--r-lg`, the `.input` and `.btn-primary`
  primitives — all present in the demo.

A side-by-side fidelity check against the design language is part of acceptance — see
"Acceptance" below.

## Existing code being REPLACED (not modified)

Delete-and-rebuild scope (UI replaced; data seam preserved verbatim):

- `frontend/apps/candidate/app/messages/[applicationId]/page.tsx` — candidate route wrapper. UI
  replaced.
- `frontend/apps/candidate/components/message-thread-view.tsx` — bubble transcript + composer.
  Markup replaced; component file is rewritten against new primitives.
- `frontend/apps/company/components/message-thread-view.tsx` — company thin duplicate. Same
  rewrite, `side="recruiter"`.
- `frontend/apps/company/app/messages/[applicationId]/page.tsx` (and/or the embedded
  applicant-detail Messages tab panel) — route wrapper. UI replaced.

**Untouched (data seam — preserved verbatim):**

- `frontend/apps/candidate/lib/use-thread-messages.ts` — `useThreadMessages(applicationId,
  side)` exporting the 5s poll, the in-flight ref-latch for optimistic send, the cancel-on-fail
  text restore, and the mark-read trigger on open + on new-inbound. **Unchanged.**
- The company app's thin-duplicate `useThreadMessages` mirror. **Unchanged.**
- Query keys `["messages","thread", applicationId]` (the poll target) + invalidation of
  `["messages","threads"]` (inbox) on successful send. **Unchanged.**
- The `MAX_BODY = 4096` client guard mirroring the server cap. **Unchanged.**

## Layout & components — map to `@ip/ui` and tokens

The thread view lives inside the `.app` sidebar+topbar shell (when on its own route) or inside
the messaging inbox's right pane / applicant-detail Messages tab (when embedded). Pull all
primitives from `@ip/ui` per [`_design-language.md`](../_design-language.md). Surface-only
treatments that this screen owns live under `apps/<candidate|company>/components/messaging/`.

| Region | Component (new) | Primitives / tokens |
|---|---|---|
| App shell (standalone route) | reuse `<AppShell side={side} />` | `.app`, `.side`, `.topbar`, `.content` |
| Page head + back | `<ThreadHead />` | `.btn-ghost` "← Messages" + `h2` Schibsted Grotesk `--step-2` "Conversation" + mono application ID in `--ink-3` |
| Thread frame | `<ThreadFrame />` | outer `.cell` (22px radius, 1px `--line`, 1.4rem padding) holding transcript + composer; full height of the content area |
| Transcript | `<Transcript />` | `<div role="log" aria-live="polite" aria-relevant="additions">`; flex column reversed for scroll-to-bottom; gap `1rem`; overflow-y `auto` |
| Day separator | `<DaySeparator />` | centered `--ink-3` `--step--1` mono date label with hairline `--line` rules each side; appears whenever the day flips |
| Self bubble | `<Bubble self />` | right-aligned; `background: var(--teal)`; `color: var(--teal-ink)`; `--r-lg` corners with bottom-right squared; max-width `min(72ch, 75%)`; mono timestamp + read receipt below |
| Other bubble | `<Bubble />` | left-aligned; `background: var(--surface-2)`; `color: var(--ink)`; `--r-lg` corners with bottom-left squared; `.avatar` (24×24) preceding the bubble; mono timestamp below |
| Pending bubble | `<Bubble pending />` | self treatment at `opacity: 0.65`; small mono "Sending…" hint |
| Composer | `<Composer />` | bottom-pinned `<form>` row; `.input` (multi-line autosize, `maxLength={MAX_BODY}`) + `.btn.btn-primary` send (icon only, `aria-label="Send message"`, disabled when empty / `isSending`) |
| Counter | `<CharCounter />` | mono `--step--2` `--ink-3` showing `body.length / MAX_BODY`; flips to `--danger` ink at ≥95% |
| Empty state | `<EmptyThread />` | inner `.cell` with aperture mark + "No messages yet. Start the conversation below." |
| Error toast | reuse `<Toast tone="danger" />` | "Couldn't send. Your message is still in the box." (input text is restored — existing behavior) |

**Bubble anatomy** — self bubble (right-aligned):

1. Bubble body — `padding: 0.7rem 0.95rem`, `white-space: pre-wrap; word-break: break-word`,
   `font: var(--step-0)/1.5 "Hanken Grotesk"`; corners `--r-lg` with bottom-right squared.
2. Sub-row — mono `--step--2`, `--ink-3`: "You · 14:32" + when `readAt`, a small lucide
   `check` glyph tinted `--good`.

**Bubble anatomy** — other bubble (left-aligned):

1. `.avatar` (24×24, party initials) outside the bubble on the left, vertically aligned to the
   first line.
2. Bubble body — `background: var(--surface-2)`, `color: var(--ink)`, corners `--r-lg` with
   bottom-left squared.
3. Sub-row — mono `--step--2`, `--ink-3`: `otherLabel + " · " + formatLocal(createdAt)`.

**Anti-slop bans (apply explicitly here):**

- No left-border side-stripe on bubbles. Bubble shape comes from `--r-lg` and the squared corner,
  not a 4px accent bar.
- No glass / blur on bubbles or composer. Flat tokens only.
- No gradient ink on the self bubble. `--teal` solid with `--teal-ink` text.
- No fake "typing…" affordance from the other side — we don't have a presence channel.
  `aria-live="polite"` on the transcript announces newly-polled messages instead.

## Data wiring / seam (preserved verbatim)

- **Seam:** `useThreadMessages(applicationId, side)`. **Unchanged.** Provides:
  - `messages: MessageDTO[]` — ascending order for render.
  - `isLoading`, `isError`, `error`.
  - `send(body: string) → Promise<MessageDTO>` — optimistic prepend with the in-flight ref-latch;
    on success it reconciles against the server reply and invalidates `["messages","threads"]`.
  - `isSending: boolean`.
  - `markRead()` — fires on mount and on every poll tick where new inbound arrived.
- **Receive poll:** `refetchInterval: 5_000`, `refetchIntervalInBackground: false`. **Unchanged.**
- **Query keys:** `["messages","thread", applicationId]` (poll target) + invalidation of
  `["messages","threads"]` (inbox) on successful send. **Unchanged.**
- **Optimistic send invariant.** The in-flight ref-latch prevents duplicate sends if the user
  hits Enter twice; the new UI must continue to bind submit to a single `useCallback` that calls
  `send(trimmedBody)` and clears the input only after the optimistic prepend resolves.
- **Send failure invariant.** On `send` rejection, the input text is **restored** (today's
  behavior). The toast surfaces "Couldn't send. Your message is still in the box." — no silent
  drop.
- **Fields consumed** (from `backend_message-thread.md` `MessageDTO`): `id`, `senderRole`,
  `senderUserId`, `body`, `createdAt`, `readAt`. `senderRole === side` decides self-vs-other.
  `MAX_BODY = 4096` mirrors the server cap (client guard; server stays authority).
- **Mark-read trigger.** `useEffect` on mount calls `markRead()`; the same trigger fires when a
  poll tick yields a new inbound message whose `senderRole !== side`. **Unchanged.**
- **Mock parity test (must keep green):** the `pnpm test` contract check around
  `MessagingService.{listMessages,sendMessage,markRead}` continues to pass; new UI must not
  introduce field reads beyond the documented `MessageDTO`.

## Tasks (build → screenshot-verify → commit per task)

> **Task 0 — Mockup is the design language.** No per-screen mockup file. Reference is the
> design language doc + the demo at
> [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html). Do not
> modify the demo.

- **Task 1 — Bubble + composer primitives into `@ip/ui` (if missing).** Add `.bubble`,
  `.bubble.self`, `.bubble.pending`, `.day-separator`, `.composer` rules to
  `@ip/ui/src/app.css`, composed from existing tokens (`--teal`, `--teal-ink`, `--surface-2`,
  `--ink`, `--line`, `--r-lg`, `--ease-out`, `--dur-fast`). The transcript container is a
  `.cell` variant — no new primitive. Verify `--filter @ip/ui build` is green. Commit
  `frontend/packages/ui/src/app.css`.
- **Task 2 — `<Bubble />` + `<DaySeparator />` + `<Transcript />`.** Build the three components.
  Wire `role="log" aria-live="polite" aria-relevant="additions"` on the transcript; verify
  self/other alignment, the squared bubble corner, the avatar position for other bubbles, and
  the day separator flips on UTC date change rendered in the viewer's zone. Screenshot in both
  themes. Commit the new components.
- **Task 3 — `<Composer />` + `<CharCounter />`.** Build the composer row inside a `<form>`.
  Autosize the textarea (1–6 rows), `maxLength={MAX_BODY}`, disabled when empty / `isSending`.
  Wire Enter-to-send + Shift+Enter newline. Verify `aria-label="Send message"` and disabled
  state. Commit the new components.
- **Task 4 — Candidate route wrapper + `<MessageThreadView />` rebuild.** Rewrite
  `apps/candidate/app/messages/[applicationId]/page.tsx` and
  `apps/candidate/components/message-thread-view.tsx` against the new primitives inside the
  candidate `.app` shell with the `<ThreadHead />` back link. Wire the unchanged
  `useThreadMessages(applicationId, "candidate")` hook — DO NOT alter the hook. Verify: bubbles
  align/colour correctly; send appears optimistically then reconciles; failed-send restores
  the input; mark-read fires on open and on new inbound. Commit changed files.
- **Task 5 — Company route wrapper + thin-duplicate rebuild.** Rewrite
  `apps/company/components/message-thread-view.tsx` and
  `apps/company/app/messages/[applicationId]/page.tsx` (and update the applicant-detail
  Messages tab embed). `side="recruiter"`, `otherLabel="Candidate"`. The hook stays identical.
  Verify both apps build. Commit changed files.
- **Task 6 — Full screen assembly + verify.**
  1. `--filter @ip/candidate build` and `--filter @ip/company build` are both green; `tsc
     --noEmit` is green in both apps.
  2. Run the dev server. Open a thread on each side; screenshot the transcript + composer in
     both themes at 1440×900 and 390×844.
  3. **Side-by-side fidelity check** against the design language tokens — verify bubble color,
     corner shape, avatar size, mono timestamp tint, composer height ≥46px, send button
     translateY(1px) on active.
  4. Confirm send → optimistic prepend → reconcile → inbox query invalidates (the inbox row's
     `lastSnippet` + `lastMessageAt` refresh on the next poll, and `unread` increments on the
     receiving side only).
  5. Confirm mark-read fires on open and zeroes the caller's `unread` (the sidebar badge math
     drops by the right amount).
  6. Confirm `NEXT_PUBLIC_MOCK=1` renders the mock seed; flipping to real is the existing
     1-line client swap.

## States & a11y

- **Loading** → 4 skeleton bubbles (alternating self/other widths) inside the `.cell`.
- **Empty** → `<EmptyThread />` card; composer still active so the first send creates the
  thread server-side.
- **Error** → inline `--danger`-tinted `.cell` with `.btn-ghost` "Retry" that refetches
  `["messages","thread", applicationId]`.
- **Success** → transcript + composer.
- **Sending** — input disabled, send button shows a spinner glyph + `aria-busy="true"`;
  pending bubble appears at the bottom at `opacity: 0.65`.
- **Send-failed** → toast (`--danger` tone) + input text restored (existing behavior). The
  pending bubble is removed and the toast offers a "Try again" affordance that re-fires the
  same send.
- **New inbound (polled)** → the transcript scrolls to bottom only when the user was already
  at the bottom (`atBottom` ref preserved). The new bubble enters with `.rise` (`translateY(8px)
  → 0`, 240ms `--ease-out`). `aria-live="polite"` announces "Candidate: <first 60 chars>" once.
- **Reduced motion.** All entrance animations no-op under `prefers-reduced-motion: reduce`;
  bubbles simply appear.
- **Responsive.** Transcript fills available vertical space; composer pinned to bottom;
  bubble `max-width` clamps to `min(72ch, 75%)` then 88% under 480px so long lines wrap
  cleanly.
- **Dark + light.** Self bubble uses `--teal` + `--teal-ink` (both resolve correctly in either
  theme); other bubble uses `--surface-2` + `--ink`. No hard-coded hex.
- **A11y.** Transcript is `role="log" aria-live="polite" aria-relevant="additions"`. Composer
  is a `<form>`; send button has `aria-label="Send message"`. Bubble bodies are
  `white-space: pre-wrap` (pasted markup inert; no HTML rendering). Touch targets ≥44×44.
  `:focus-visible` rings use `--teal` 2px outline / 4px halo. Contrast ≥4.5:1.

## Acceptance

- The bubble surface matches the Aperture Pro design language tokens, type scale, motion
  vocabulary, and accent treatment 1:1. Side-by-side screenshot proof committed under
  `docs/brand/redesign-v3/verify/message-thread-{light,dark}-{candidate,company}.jpeg`.
- Both app builds (`--filter @ip/candidate build`, `--filter @ip/company build`) and
  `tsc --noEmit` are green; no console errors / warnings; reduced-motion is honored.
- **Zero functional diff** vs the old thread view: same `useThreadMessages` hook, same 5s
  receive poll with `refetchIntervalInBackground: false`, same in-flight ref-latch on send,
  same `MAX_BODY` client guard, same query keys, same inbox cache invalidation on send, same
  mark-read trigger on open + on new inbound, same input-restore on send failure.
- Pre-launch posture is enforced: sample data uses "Sample candidate" / "Candidate A" /
  "Sample reviewer". No fake company names, no claimed integrations.
- Mock→real path (`NEXT_PUBLIC_MOCK=1` → `MessagingService`) is unchanged — only the existing
  1-line client constructor swap.
- The dual-audience invariant holds: candidate at `/messages/[applicationId]` and recruiter at
  `/company/messages/[applicationId]` render the same component with `side` flipped;
  `senderRole === side` correctly decides self-vs-other in both contexts.
