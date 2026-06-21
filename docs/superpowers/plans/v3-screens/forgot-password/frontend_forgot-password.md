# Forgot password — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Public, token-free **request-password-reset surface**. Rebuild the existing split-panel/forgot UI
as the centered **auth-card** primitive with a single email input, a neutral-by-design success
state (never leak whether an account exists), and a quiet "Back to sign in" link. The
`useAuth().api.auth.forgotPassword({ email })` call is preserved verbatim — only the markup, tokens,
and motion are new.

## Route + role

`/forgot` · **public** (signed-out, pre-token). No redirect on success — the screen swaps to the
neutral success state in place.

## Approved mockup (build to this exactly)

- **Design language (canonical):** [`../_design-language.md`](../_design-language.md) — see the
  **auth-card primitive** (centered card on `var(--bg)`, ≤ 480px, aperture mark + display headline
  + Hanken form + teal CTA + truthful pre-launch footer).
- **Reference demo (for tokens, type, motion, mark):**
  [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
- **Screenshots for token / theme proof:**
  `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-{light,dark}-hero.jpeg`.

No per-screen mockup file. Build to the auth-card primitive; verify side-by-side against the
`/login` rebuild.

## Existing code being REPLACED (not modified)

Delete-and-rebuild scope:

- `frontend/apps/candidate/app/forgot/page.tsx` — current `<AuthLayout>` + email form + neutral
  `sent` `<Alert>` branch
- `frontend/apps/company/app/forgot/page.tsx` — recruiter-app copy (same structure today; v3
  unifies)
- `frontend/apps/candidate/components/auth-layout.tsx` — v2 two-pane shell (deleted by `/login`
  Task 1)
- `frontend/apps/candidate/components/auth-split-panel.tsx` — v2 brand panel (deleted by `/login`
  Task 1)

Preserved logic surfaces (out-of-scope to edit):

- `useAuth().api.auth.forgotPassword({ email })` — neutral fire-and-confirm; never read for
  account existence
- `setSent(true)` on resolve → render the neutral success state in place
- Neutral error string on reject → never leak existence

## Layout & components

Reuse the `@ip/ui` auth-card primitive from `/login` (Task 1 there).

| Region | Component | Tokens / primitives |
|---|---|---|
| Page surface | `<main class="auth">` | Identical to `/login`. |
| Card | `<AuthCard>` | Identical to `/login`. |
| Brand mark | `<LogoMark>` (aperture sprite) | Identical. |
| Headline | `<h1 class="display">Reset your password</h1>` | Schibsted Grotesk, `var(--step-3)`. |
| Sub | `<p>We'll email you a reset link.</p>` | Hanken Grotesk, `var(--step-0)`, `color: var(--ink-2)`. |
| Form (entry state) | `<form>` with `<Field>` + `<Input type="email" autocomplete="email" required>` + `<Button class="btn btn-primary">Send reset link</Button>` | Submit disabled until the email passes `required`. |
| Sent state | `<Alert tone="success">If an account exists for <em>{email}</em>, a reset link is on its way.</Alert>` + `<Button class="btn btn-ghost">Back to sign in</Button>` linking `/login` | **Neutral copy** — never confirms or denies the account exists. The `<em>` token is teal-medium per the design language (not italic). |
| Error state | `<Alert tone="danger">Couldn't send right now — please try again.</Alert>` | **Neutral copy** — never confirms or denies existence. |
| Back link (entry state) | `<Link href="/login"><ArrowLeft aria-hidden /> Back to sign in</Link>` | Below the form, `color: var(--ink-3)`, link in `--teal-strong`. |

The two branches (entry + sent) live inside the same `<AuthCard>` so the card geometry is stable
through the transition — no layout shift.

## Data wiring / seam

- **Client/seam:** `useAuth().api.auth.forgotPassword({ email })`.
- **Behavior:** on resolve → `setSent(true)` and render the neutral success `<Alert>` + "Back to
  sign in" CTA. On reject → render the neutral error `<Alert>` (never leak account existence).
- **TanStack query keys:** none.
- **Backend:** see [`backend_forgot-password.md`](./backend_forgot-password.md) — no proto delta,
  no new RPC.

## Tasks (TDD-style, build → screenshot-verify → commit per task)

> **Task 0 — design language is the mockup.** No per-screen HTML mockup. Build to the auth-card
> primitive; the entry + sent + error branches all render inside the same card.

- **Task 1 — Rebuild `/forgot`.** Replace `apps/candidate/app/forgot/page.tsx` (and the recruiter
  copy) so the route renders `<main class="auth"><AuthCard>…</AuthCard></main>` with the aperture
  mark, headline "Reset your password", sub, email field, "Send reset link" primary CTA, and the
  "Back to sign in" link. Wire `useAuth().api.auth.forgotPassword({ email })` + `setSent(true)`
  verbatim. Commit explicit paths.
- **Task 2 — Sent + error states.** Render the neutral success `<Alert>` when `sent === true` with
  the user's email interpolated via the `<em>` token (teal medium weight, non-italic). Render the
  neutral error `<Alert>` on reject. Verify the card geometry stays stable through the transition
  (no flash, no layout shift). Commit.
- **Task 3 — Verify + screenshot.** `--filter @ip/candidate build` + `tsc --noEmit` green. Run the
  dev server, navigate to `/forgot`, screenshot the entry and sent states at 1440×900 and 390×844
  in both themes. Side-by-side fidelity check against the `/login` rebuild — same card, same mark,
  same teal CTA. Verify that the success copy is neutral regardless of whether the email exists.

## States & a11y

- **States.** Entry (email empty, submit disabled) · typing (submit enables when `required`
  passes) · loading (`Button loading` → "Sending…", input disabled) · sent (neutral success
  `<Alert>` + "Back to sign in" CTA, form replaced) · error (neutral error `<Alert>` above the
  form, form still editable). Field-level: email format error inline with `aria-describedby` and
  `--danger`.
- **Responsive.** Card is `max-width: 480px` from `>= 480px`. Below `480px`, page padding
  collapses to `1rem` and the card fills the viewport. No split-panel to collapse.
- **Dark + light.** All colors via tokens. `<Alert tone="success">` reads `--good`; `<Alert
  tone="danger">` reads `--danger`; both resolve in both themes.
- **A11y.** One `<h1>`. Form label via `<Field>`; `aria-describedby` wires the field-level error.
  `<ArrowLeft>` icon is `aria-hidden`; the link text is the readable label. `:focus-visible` ring
  uses `--teal` 2px / 4px halo. Touch targets ≥44×44. Body contrast ≥4.5:1. `<Alert>` regions are
  `role="status"` (success) / `role="alert"` (error). On the entry→sent transition, focus moves to
  the success `<Alert>` so screen readers announce it. Honors `prefers-reduced-motion`.

## Acceptance

- Looks 1:1 like the auth-card primitive in [`_design-language.md`](../_design-language.md) — the
  same card geometry as `/login`, with a single email field and a neutral success state.
  Side-by-side screenshot proof committed under
  `docs/brand/redesign-v3/verify/forgot-password-{light,dark}.jpeg`.
- `--filter @ip/candidate build` is green; `--filter @ip/company build` is green (or the unified
  package if v3 unification has landed); `tsc --noEmit` is green; no console errors / warnings on
  the rendered page; reduced-motion is honored.
- **Zero functional diff** from today: `forgotPassword({ email })` is called with the same shape;
  `sent === true` on resolve renders the neutral success state; reject renders the neutral error.
  The neutral-by-design copy is **load-bearing** — never alter it to confirm or deny existence.
- The token minted by `forgotPassword` is consumed by `/reset` per its plan.
