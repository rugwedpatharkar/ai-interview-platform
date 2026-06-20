# Message thread — FE plan (Midnight reskin)

> **Screen & goal.** A single two-party conversation for one application: a scrollable transcript of **chat bubbles**
> + a **composer**. Goal: reskin today's thread surface into the Midnight `.app` shell. **Appearance-only: zero
> behavior change** (poll receive, optimistic send, mark-read all unchanged).
>
> **Unified route(s) + role:**
> - `/messages/[applicationId]` — **candidate** (`apps/candidate/app/messages/[applicationId]/page.tsx`).
> - company side — the recruiter reaches the same thread from the applicant-detail **Messages tab**
>   (`apps/company/app/jobs/[id]/applicants/[appId]/page.tsx` → `MessageThreadView side="recruiter"`); in the
>   single-app world this is `/company/messages/[applicationId]` (or the embedded tab). **One component serves both** —
>   `MessageThreadView` is already role-aware via `side`; only `otherLabel` / attribution copy differs.
>
> **Mockup:** ✗ — build `docs/brand/redesign-v2/message-thread.html` in **Task 0**.
> **Existing code it reskins** (markup/classes only):
> - `frontend/apps/candidate/app/messages/[applicationId]/page.tsx` (route wrapper).
> - `frontend/apps/candidate/components/message-thread-view.tsx` (the bubble transcript + composer — the reskin target).
> - `frontend/apps/company/components/message-thread-view.tsx` (company thin duplicate — same reskin, `side="recruiter"`).
> - data seam `frontend/apps/candidate/lib/use-thread-messages.ts` (poll/optimistic/mark-read — **untouched**).
>
> **Backend:** `backend_message-thread.md` (EXISTING — `MessagingService` send/list/mark-read for an application).

---

## Layout & components

**Shell:** `.app` (sidebar + topbar). Candidate route in the candidate shell with a `.btn-ghost` "← Messages" back
link + `.page-head` ("Conversation"). Company side renders inside the applicant-detail Messages tab panel (no
separate page chrome).

**Chat bubbles + composer:**
- **Transcript** — a scroll region (`role="log" aria-live="polite" aria-relevant="additions"`) of bubbles. Self
  bubbles align right (`flex-row-reverse`, accent fill); other-party bubbles align left (`.surface-2` fill). Map to
  tokens: self → `background: var(--accent); color: var(--accent-ink)`; other → `background: var(--surface-2);
  color: var(--ink)`; both with `--r-lg` corners (one corner squared toward the avatar, matching today's
  `rounded-tr-sm`/`rounded-tl-sm`). Each row has a `.avatar` (party) + a small `.sub` attribution line ("You" /
  `otherLabel`) + the body (`white-space: pre-wrap; word-break: break-word`). Optimistic/pending rows at reduced
  opacity.
- **Composer** — a `<form>` row: `.input` (message, `maxLength={MAX_BODY}`) + a `.btn.btn-primary` send button
  (icon, `aria-label="Send message"`, disabled when empty / sending).
- **Auto-stick** — keep today's `atBottom`/`onScroll`/`endRef` behavior; a "scroll to latest" affordance if present.

**`@ip/ui` class map:** `.app/.content/.page-head` (shell), `.btn-ghost` (back), `.avatar` (party), `.input` +
`.btn.btn-primary` (composer), bubbles composed from `--surface-2`/`--accent`/`--accent-ink`/`--r-lg` tokens.
New: a `.bubble`/`.bubble.self` treatment (compose from tokens — **no new `@ip/ui` primitive**).

## Data wiring (kept identical to today)

- **Seam:** `useThreadMessages(applicationId, side)` — poll receive (5s, `refetchIntervalInBackground: false`),
  optimistic send with the `inFlight` ref-latch, mark-read on open/new-inbound — **all unchanged**.
- **TanStack query keys:** `["messages","thread",applicationId]` (`threadQueryKey`, the poll target) +
  invalidation of `["messages","threads"]` (inbox) on send — **unchanged**.
- **Fields consumed** (from `backend_message-thread.md` `MessageDTO`): `id`, `senderRole`, `body`, `createdAt`,
  `readAt`. `senderRole === side` decides self-vs-other. `MAX_BODY = 4096` mirrors the server cap (client guard;
  server stays authority).

## Tasks (bite-sized; presentation-only)

### Task 0 — build the mockup (mockup ✗)
- [ ] Build `docs/brand/redesign-v2/message-thread.html` against `tokens.css` + `app.css`: the `.app` shell, a back
  link, a transcript of ~6 bubbles (alternating self/other, one pending) using the accent/surface-2 bubble treatment,
  and the composer (`.input` + `.btn-primary` send). Dark-first + light pass.
- [ ] Browser-verify on `:4173` (both themes); commit `docs/brand/redesign-v2/message-thread.html` only.

### Task 1 — reskin `MessageThreadView` bubbles + composer (candidate)
- [ ] In `apps/candidate/components/message-thread-view.tsx`, swap the ad-hoc Tailwind bubble/composer classes →
  the token bubble treatment + `.input`/`.btn-primary`. Keep `useThreadMessages`, the optimistic merge, `onScroll`/
  `endRef` auto-stick, `role="log"`, and `maxLength={MAX_BODY}` **identical**.
- [ ] Build + browser-verify (bubbles align/colour correctly; send appears optimistically then reconciles; no console
  errors); commit `apps/candidate/components/message-thread-view.tsx` only.

### Task 2 — route wrapper into the `.app` shell (candidate)
- [ ] Wrap `apps/candidate/app/messages/[applicationId]/page.tsx` in the Midnight shell with the `.btn-ghost` back
  link + `.page-head`. No data change.
- [ ] Build + browser-verify; commit that file only.

### Task 3 — company thin duplicate (recruiter side)
- [ ] Apply the identical bubble/composer reskin to `apps/company/components/message-thread-view.tsx`
  (`side="recruiter"`, `otherLabel="Candidate"`). Hook body stays identical to candidate.
- [ ] Build + browser-verify both apps; commit changed files only.

## States & a11y

- **Loading** → skeleton bubbles. **Empty** → "No messages yet" card ("Start the conversation below"). **Error** →
  inline error + retry. **Success** → the transcript. **Send-failed** → toast + the input text is **restored** (today's
  behavior, kept).
- **Responsive:** the transcript fills the panel; composer pinned; full-bleed on mobile.
- **Dark + light:** bubble fills via `--accent`/`--accent-ink`/`--surface-2`/`--ink`; **no hardcoded color**.
- **A11y:** `role="log" aria-live="polite" aria-relevant="additions"` so polled inbound messages are announced; the
  composer is a `<form>`; send `Button` `aria-label="Send message"`; bubbles `white-space: pre-wrap` (pasted markup
  inert); focus rings via `:focus-visible`; contrast ≥4.5:1.

## Acceptance

Matches `message-thread.html`; both app builds/typechecks green; **zero functional diff** (poll 5s, optimistic send +
ref-latch, mark-read, `MAX_BODY` guard, query keys all unchanged); mock→real (`MessagingService`) path unchanged.
