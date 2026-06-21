# Interview completed — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## 🔒 Strict-proctored invariants (non-negotiable)

> **Camera + mic required. No mute. No camera-off. Fullscreen-locked. On-device detectors only.
> Server-authoritative auto-end.**
>
> The post-interview surface is the candidate's last-touch screen. It honors the invariants by
> being **read-only** — no playback control, no "retry interview" button, no "request another
> attempt" CTA (one strictly proctored AI interview per role; no second takes). The
> auto-terminated variant carries the truthful danger-tone messaging, names the integrity policy
> link, and offers contact-support — but never apologizes for the auto-end and never offers a
> path back into the room.
>
> The strict-proctored invariants are part of the **Aperture Pro design language** itself (see
> `_design-language.md` §"Mandatory revamp rule" item 5). This screen's danger-variant copy is
> the truthful framing from the proctored-interview backend's `terminated` ack — no inflation,
> no minimization. If a reviewer asks for "let them try again" / "retry the interview", refuse
> and link this block.

## Goal

Replace the inline "Interview complete" / "Auto-terminated" ended-state cards that today live
**inside** the live room with a **dedicated post-interview route**. After clean exit or
auto-terminated termination, the live room navigates here so the candidate has a clear, focused
last-touch surface: confirmation, timing expectations, integrity policy reference (when
auto-terminated), and a single path back to the dashboard. The page is a focused fullscreen
room shell (NOT the `.app` candidate shell) — same family as the lobby, same visual register as
the live room's ended-state cards (so the transition feels intentional).

## Route + role

`/interview/[applicationId]/done` · **candidate** (`useRequireAuth` +
`useRequireRole(["candidate"])`).

This route does **not** mount the `.app` sidebar shell. It is a focused fullscreen room shell
(same shell-free pattern the lobby + live room use). The page accepts a single optional query
param `?reason=auto_terminated` to render the danger variant explicitly when the live room
navigates here after a server-stamped `terminated: true` ack; otherwise it derives the variant
from the application's current `state` (terminal `interviewed` / `scored` / etc. → clean exit
variant; `interview_in_progress` paired with a terminal proctor flag → auto-terminated variant
— see Data wiring).

## Approved mockup (build to this exactly)

- **Design language (canonical):** [`../_design-language.md`](../_design-language.md) — see the
  `.cell` family used for the live room's ended-state cards (teal leading icon for clean,
  danger leading icon for auto-terminated, warn for fallback), the `.pill-good` / `.pill-danger`
  treatment, and the `.btn.btn-ghost` "Back to dashboard" pattern.
- **Reference demo:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
  — pull tokens, type scale, button treatment.
- **Sibling reference (the live room this is the post-screen for):**
  [`../proctored-interview/frontend_proctored-interview.md`](../proctored-interview/frontend_proctored-interview.md)
  — that plan's ended-state cards are the **structural template** for this page. The live room
  (per that plan) continues to render the ended-state cards itself for the in-room phase
  transition; this dedicated route is the **canonical** post-interview surface that the live
  room navigates to after a brief in-room confirmation (or that the candidate is routed to
  directly on auto-termination).
- **Sibling reference (pre-interview):** [`../interview-lobby/frontend_interview-lobby.md`](../interview-lobby/frontend_interview-lobby.md)
  — same shell-free room shell; the lobby and the completed page bracket the live room
  visually.

No per-screen mockup file yet. Build to the design language + the proctored-interview sibling
and verify side-by-side that this page reads as a clean closing bracket to the lobby + room
sequence.

## Existing code being REPLACED (not modified)

**This is a NEW screen — there is no existing code per screen.** Today, the live room
(`/interview/[applicationId]`) mounts its own ended-state cards as a final phase. Those
in-room cards continue to exist per
[`../proctored-interview/frontend_proctored-interview.md`](../proctored-interview/frontend_proctored-interview.md);
this dedicated route gives the post-interview surface a canonical URL that the live room can
route to (and that the recruiter can deep-link to in messages, etc.).

Files that will be **created** by this plan (no replacements):

- `frontend/apps/candidate/app/interview/[applicationId]/done/page.tsx` — new route file;
  mounts `<InterviewCompleted />`.
- `frontend/apps/candidate/components/interview-completed.tsx` — new completed-page component
  (two variants: clean exit + auto-terminated).

Files **NOT modified** (per the user brief — "DO NOT modify the existing proctored-interview
plan files"):

- `frontend/apps/candidate/app/interview/[applicationId]/page.tsx` — the live room route. The
  live room continues to render its own in-room ended-state cards as documented in the
  proctored-interview plan. This dedicated route is **additive** — the live room can
  navigate here on the user's "Back to dashboard" click (the live room's existing ended-state
  card already wires that button), or it can navigate here automatically on the server's
  `terminated: true` ack with `?reason=auto_terminated`.

Files **frozen — do not modify** (data seam stays as-is):

- `frontend/apps/candidate/app/interview/[applicationId]/types.ts` — `RtcToken` / `ProctorAck`
  / `HIGH_SEVERITY` / `severityOf`.
- The proctor `sink` (typed events → `recordProctorEvents` → reads `ProctorAck.terminated`
  defensively) — unchanged.

## Layout & components

**Shell:** **shell-free.** The page is a focused fullscreen room — a single `<main
role="main">` filling the viewport (no `.app` sidebar, no topbar). A thin top strip carries
the brand mark, the application title (`{jobTitle ?? "Job {jobId}"} at {companyName ?? "Employer"}`),
and a `<small>` neutral indicator ("Interview complete" / danger-tinted "Session ended early"
for the auto-terminated variant).

### Variant A — clean exit

| Region | Aperture-Pro primitive | Behavior |
|---|---|---|
| Top strip | `.room-topbar` | Brand mark on the left; title in the center; "Interview complete" indicator (neutral, `--ink-2`) on the right. |
| Hero card | `.cell` (single centered card; `max-width: min(48rem, 100% - 2.5rem)`; teal leading-icon block `<svg><use href="#check"/></svg>` in a `--teal-soft` chip) | `<h1 class="display">Interview captured.</h1>` (Schibsted 700, `--step-3`) + body paragraph (`--step-1`, `--ink-2`): "Your responses have been recorded. Our team will review and your report will be ready in approximately **{ETA}** minutes." The `{ETA}` is a sensible default ("a few", derived from `report.scoreEtaMinutes` when present; otherwise a generic "a few minutes — we'll let you know when it's ready"). |
| What's next strip | inline `.stats-grid` (3 columns at ≥ 760 px, stacks at ≤ 760 px) — 3 `.stat`s | (1) **Outcome** — "Pending" with a `.pill-warn` chip; (2) **Estimated time** — the ETA value; (3) **You'll see updates in** — "Your tracker" with a link to `/applications/[id]`. |
| Footer alert | `<Alert tone="info">` | "We'll email you when your report is ready. You can close this window safely." |
| CTAs | `.toolbar` with two buttons | (1) `.btn.btn-primary` "Open application tracker" → `/applications/[applicationId]` (so the candidate can see the new `interviewed` state immediately). (2) `.btn.btn-ghost` "Back to dashboard" → `/`. |

### Variant B — auto-terminated

| Region | Aperture-Pro primitive | Behavior |
|---|---|---|
| Top strip | `.room-topbar` | Brand mark on the left; title in the center; **danger-tinted** "Session ended early" indicator (`--danger`, leading lucide `shield` icon). The strip background subtly tints `--danger-soft` to telegraph the variant. |
| Hero card | `.cell` (single centered card; `max-width: min(56rem, 100% - 2.5rem)`; danger leading-icon block `<svg><use href="#shield"/></svg>` in a `--danger-soft` chip) | `<h1 class="display">Session ended early by integrity policy.</h1>` (Schibsted 700, `--step-3`) + body paragraph (`--step-1`, `--ink-2`): "A serious integrity signal triggered our automatic stop. Your recruiter has been notified. Our team will review the session before any final decision is made." If the server returns a non-empty `terminatedReason`, render it as a quoted `<blockquote>` (curly-quote markers, `--ink-2`) under the body. |
| What happens next strip | inline `.stats-grid` (3 columns at ≥ 760 px, stacks at ≤ 760 px) — 3 `.stat`s | (1) **Status** — "Under review" with a `.pill-warn` chip; (2) **Decision timing** — "1–3 business days" (a truthful range, not a promise); (3) **You'll be notified by** — "Email and tracker update". |
| Integrity policy block | `<Alert tone="warn">` with a `.def-panel.detect`-style gold leading icon | "These are the rules everyone agreed to in the lobby. Read the integrity policy to understand what triggered the auto-stop and what the review process looks like." + a `.btn.btn-ghost` "Read the integrity policy →" → `/legal/integrity-policy`. |
| CTAs | `.toolbar` with three buttons | (1) `.btn.btn-ghost` "Contact support" → opens a support modal (existing primitive — composes a `mailto:` link or, when the support-form mutation is wired, posts a typed support request). (2) `.btn.btn-ghost` "Read the integrity policy" → `/legal/integrity-policy` (mirrors the link in the integrity panel; the duplicate is intentional — it's the most likely next action). (3) `.btn.btn-ghost` "Back to dashboard" → `/`. **No retry button. No "request another attempt" button.** |

> **Primitives reference (do NOT redefine):** `.cell · .pill · .pill-{good,warn,danger} · .stats-grid · .stat · .def-panel · .badge · .btn · .btn-{primary,ghost,sm}` — all defined in `@ip/ui/src/app.css` per the [design language](../_design-language.md). `<Alert>` is the existing alert primitive (info / warn / danger tones).

**No retry. No playback. No "request another attempt".** The completed page's only interactive
elements are: the dashboard CTA, the application-tracker CTA, the integrity-policy link, and
the contact-support link (auto-terminated variant only). Anything else is a hard violation of
the strict-proctored invariants block at the top of this plan.

## Data wiring / seam (preserved verbatim)

- **No fetch on mount in the simple case.** The page reads the application from the
  dashboard's `["applications"]` cache (the title comes from a client-side filter on
  `applicationId`). The page does NOT call `listMyApplications` again.
- **Variant detection:**
  1. **Explicit:** `?reason=auto_terminated` query param → render Variant B. This is the path
     the live room takes when the server's `terminated: true` ack lands; the room reads the
     ack defensively and `router.push("/interview/[id]/done?reason=auto_terminated")`s here.
  2. **Implicit (defensive):** when the query param is absent, derive from the application's
     current `state` — `interviewed` / `scored` / `shortlisted` / `hired` / `rejected` →
     Variant A (clean exit); `withdrawn` → redirect to `/applications/[id]` (the candidate
     withdrew, not a clean exit); any other state → Variant A fallback (defensive — never
     render the danger variant without a positive signal). The auto-terminated detection
     never depends on the absence of a flag; it requires the explicit query param OR a
     future contract delta on the `Application` shape (e.g., `terminatedByProctor: true`)
     that the FE can read render-if-present.
- **Backend integrity-ack read:** the truthful `terminatedReason` quote in Variant B comes
  from the proctored-interview RPC return — specifically, the live room captures the
  `ProctorAck.reason` from the terminal `recordProctorEvents` ack into a small client-side
  cache (e.g., `useSessionStorage("interview:lastTerminatedReason:" + applicationId)`) before
  it navigates here, and the completed page reads it on mount and clears it after render.
  This is a small client-side bridge — no new RPC, no server change. When the cache is empty
  (deep link from email), the quoted reason is omitted and only the body paragraph renders.
- **No mutations** on this page. The dashboard's existing `["applications"]` poll will pick
  up the new `state` on its next cycle; if the candidate returns to `/`, they see the
  updated row.
- **No proctoring events emitted from this page.** The page is read-only.

See [`backend_interview-completed.md`](./backend_interview-completed.md) for the full RPC
contract; it is unchanged from today.

## Tasks (build → screenshot-verify → commit per task)

> **Task 0 — Design language is the mockup.** No per-screen HTML mockup. Build to the design
> language + the proctored-interview sibling. This page is the **canonical** form of the live
> room's existing ended-state cards, lifted to a dedicated route.

- **Task 1 — Route + shell + variant router.** Create
  `apps/candidate/app/interview/[applicationId]/done/page.tsx` and
  `apps/candidate/components/interview-completed.tsx`. Render the shell-free `<main>` and the
  top strip. Implement the variant router: read `?reason=auto_terminated` first; otherwise
  derive from the application's `state` in the dashboard cache. Verify both variants render
  correctly under forced conditions; verify a `withdrawn` state redirects to
  `/applications/[id]` before render. Commit explicit paths.

- **Task 2 — Variant A (clean exit).** Build the hero `.cell` with the teal leading icon, the
  `<h1>` "Interview captured.", the body paragraph with `{ETA}` interpolation, the 3-stat
  `.stats-grid`, the info alert, and the two-button `.toolbar`. Verify the CTAs route
  correctly (Open application tracker → `/applications/[applicationId]`; Back to dashboard →
  `/`); verify the ETA falls back to "a few minutes" when no `scoreEtaMinutes` is available.
  Commit.

- **Task 3 — Variant B (auto-terminated).** Build the hero `.cell` with the danger leading
  icon, the `<h1>` "Session ended early by integrity policy.", the body paragraph, the
  optional `<blockquote>` for the server's `terminatedReason`, the 3-stat
  `.stats-grid`, the integrity-policy `<Alert tone="warn">`, and the three-button `.toolbar`.
  Read the `terminatedReason` from session storage; clear it after render. Verify the
  Variant B CTAs (Contact support, Read the integrity policy, Back to dashboard); verify
  the integrity-policy link routes to `/legal/integrity-policy`; verify the top strip is
  danger-tinted only in Variant B. Commit.

- **Task 4 — Wire the live room → done route handoff.** Adjust the live room's
  ended-state-card "Back to dashboard" buttons to first `router.push("/interview/[id]/done")`
  (or `?reason=auto_terminated` for the auto-terminated case) and let the completed page own
  the final "Back to dashboard" CTA. This keeps the live room's UI unchanged from the
  proctored-interview plan's perspective — only the final navigation target changes. Verify
  end-to-end with `NEXT_PUBLIC_MOCK=1`: fake room → clean exit → done page Variant A. Then:
  fake room → fake HIGH event → server stamps `terminated: true` → done page Variant B with
  the `terminatedReason` quoted. Commit.

- **Task 5 — Strict-invariant audit + Fidelity verify + Responsive verification.**
  1. `--filter @ip/candidate build` is green; `--filter @ip/candidate exec tsc --noEmit` is
     green.
  2. Run the dev server, force each variant via the URL, verify the page renders correctly
     in both themes at 1440 × 900 and 390 × 844.
  3. **Strict-invariant audit** — grep the new components for `retry`, `try again`,
     `request another`, `restart interview`, `resume interview`, `start over`. **Zero hits**
     in any path on this page. The page is read-only and never offers a path back into the
     interview.
  4. Side-by-side fidelity check vs. the proctored-interview sibling's in-room ended-state
     cards — the dedicated page reads as the **canonical** version of those cards (same
     family, same tokens, slightly more breathing room because it owns the whole viewport).
     Save proofs at
     `docs/brand/redesign-v3/verify/interview-completed-{variantA,variantB}-{light,dark}.jpeg`.
  5. **Responsive verification** — execute the 8-step list from
     [`../_design-language.md`](../_design-language.md) §"Mandatory verification":
     1. **Screenshot at all 7 reference sizes:** 375 × 667 · 430 × 932 · 768 × 1024 portrait ·
        820 × 1180 portrait · 1024 × 1366 portrait · 1366 × 1024 landscape · 1440 × 900 ·
        1920 × 1080.
     2. **No horizontal scroll** at any width ≥ 320 px (test with
        `document.documentElement.scrollWidth`).
     3. **Every interactive element ≥ 44 × 44 px** when measured at the smallest breakpoint.
     4. **Keyboard does not cover form inputs** on iOS Safari (manual test or
        `visualViewport.height` check) — no forms on this page, but the support-modal's
        composer honors the rule when opened.
     5. **Orientation change** (portrait ↔ landscape) on iPad sizes — layout adapts
        gracefully, no clipped content; the hero card stays centered in both orientations.
     6. **`prefers-reduced-motion`** — every animation no-ops (test by enabling reduce-motion
        in DevTools); the page renders statically without entrance reveals.
     7. **Cross-browser:** iOS Safari, Chrome Android, Samsung Internet, desktop Safari /
        Chrome / Firefox / Edge — at minimum Safari + Chrome on every OS.
     8. **Save side-by-side proof** to
        `docs/brand/redesign-v3/verify/interview-completed-{mobile,tablet,desktop}.jpeg`.

## States & a11y

- **States.**
  - **Variant A (clean exit) — loaded** — hero `.cell` with teal icon + body + 3-stat strip
    + info alert + two CTAs.
  - **Variant B (auto-terminated) — with reason** — hero `.cell` with danger icon + body +
    quoted `terminatedReason` + 3-stat strip + integrity-policy alert + three CTAs;
    top-strip danger-tinted.
  - **Variant B (auto-terminated) — without reason** (deep link from email; session storage
    empty) — same as above but the `<blockquote>` is omitted; body paragraph stands alone.
  - **Variant A (clean exit) — ETA unavailable** — the "Estimated time" stat falls back to
    "A few minutes"; the body paragraph reads "in a few minutes" instead of the interpolated
    minutes value.
  - **`withdrawn` state** — redirect to `/applications/[applicationId]` before render (the
    candidate withdrew, not a clean exit; the detail page handles withdrawn copy).
  - **Application not in cache (deep link)** — title falls back to "Loading…" → `Job {jobId}`
    when the cache hydrates; the rest of the page renders normally.
- **Responsive.**
  - ≥ 1100 px — hero `.cell` centered, `max-width` per variant; the `.stats-grid` is 3
    columns; the `.toolbar` is inline.
  - 760–1099 px — same layout, slightly tighter spacing.
  - ≤ 760 px — hero `.cell` is full-bleed minus 1 rem gutter; the `.stats-grid` stacks to 1
    column; the `.toolbar` becomes full-width sticky to `safe-area-inset-bottom`
    (`position: sticky; bottom: env(safe-area-inset-bottom);`).
  - ≤ 540 px — the page is full-screen; the `<h1>` clamps tighter via the design language
    type scale; the integrity-policy alert wraps its leading icon above the text.
- **Dark + light:** all colors via tokens; teal icon for Variant A (`--teal-soft` chip
  background, `--teal` icon stroke), danger icon for Variant B (`--danger-soft` chip
  background, `--danger` icon stroke), gold accent for the integrity-policy alert.
- **Reduced motion:** `prefers-reduced-motion: reduce` disables any `.rise` reveal — content
  remains visible immediately.
- **A11y.**
  - Single `<main role="main">`; one `<h1>` per variant.
  - The variant tone is **also** announced via the page title (`document.title`): "Interview
    captured · Aptura" for Variant A; "Session ended early · Aptura" for Variant B.
  - Each region uses `<section role="region" aria-labelledby>` so screen readers can navigate.
  - The integrity-policy block uses `role="alert"` so the danger variant announces
    immediately on render.
  - The `<blockquote>` for `terminatedReason` is wrapped in a `<figure>` with a `<figcaption>`
    ("Reason cited by the system") so the quote has a clear source attribution.
  - All CTAs are real `<button>` (when triggering a modal) or `<a>` (when navigating); none
    is a click-on-div.
  - Focus rings via tokens (`--teal` 2px outline + 4px halo); touch targets ≥ 44 × 44; body
    contrast ≥ 4.5:1.

## Acceptance

- The completed page reads as the canonical post-interview surface — same shell-free family
  as the lobby + live room, same `.cell` ended-state vocabulary. Side-by-side proof
  committed at
  `docs/brand/redesign-v3/verify/interview-completed-{variantA,variantB}-{light,dark}.jpeg`
  and the responsive trio at `…-{mobile,tablet,desktop}.jpeg`.
- `--filter @ip/candidate build` is green; `tsc --noEmit` is green; no console errors /
  warnings on either variant; reduced-motion is honored.
- **Strict-proctored invariants intact** — grep audit passes (no `retry` / `try again` /
  `request another` / `restart interview` / `resume interview` / `start over` anywhere in
  the page or its descendants). The page is read-only and never offers a path back into
  the interview.
- **Variant routing is correct** — `?reason=auto_terminated` forces Variant B; absence
  derives from `state` (clean variants for terminal post-interview states; redirect for
  `withdrawn`; defensive Variant A fallback for anything else).
- **`terminatedReason` quoting is faithful** — when the live room captured a reason in
  session storage, the page renders it verbatim in a `<blockquote>` with curly-quote
  markers and a `<figcaption>` attribution; when no reason is available (deep link), the
  block is omitted (no fabricated reasons).
- The live room → done route handoff works for both clean exit and auto-terminated paths;
  the live room's existing in-room ended-state cards remain unchanged per the
  proctored-interview plan (this dedicated page is additive).
- Pre-launch anti-fiction posture preserved: ETA values use truthful framing ("a few
  minutes" fallback when no `scoreEtaMinutes` is available); decision-timing language is a
  range ("1–3 business days"), not a promise; no fabricated outcome language ("you did
  great!" / "you nailed it") appears anywhere.
