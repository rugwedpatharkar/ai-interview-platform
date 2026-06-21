# Verify email — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Public, token-scoped **email-verification surface**. Rebuild the existing self-framed `<VerifyCard>`
UI as the centered **auth-card** primitive with four explicit states (`working` spinner / `ok`
success / `error` message + resend / `invalid` missing-token). The one-shot
`useAuth().api.auth.verify({ token })` call (guarded by a `called` ref so it never fires twice in
StrictMode) and the `api.auth.resendVerification({ email })` action are preserved verbatim.

## Route + role

`/verify` · **public** (signed-out, token-scoped via `?token=`). On `ok` → "Continue to your
home" button → `/` (candidate home).

## Approved mockup (build to this exactly)

- **Design language (canonical):** [`../_design-language.md`](../_design-language.md) — see the
  **auth-card primitive**. The four `VerifyStatus` branches all render inside the same card.
- **Reference demo (for tokens, type, motion, mark):**
  [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
- **Screenshots for token / theme proof:**
  `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-{light,dark}-hero.jpeg`.

No per-screen mockup file. Build to the auth-card primitive; the four branches each render inside
the same card with state-specific copy, icon, and CTA.

## Existing code being REPLACED (not modified)

Delete-and-rebuild scope:

- `frontend/apps/candidate/app/verify/page.tsx` — current `<AuthLayout selfFramed>` + `<VerifyCard>`
  shell with the `called` ref guard, `useEffect` URL read, and `onResend` wiring
- `frontend/apps/company/app/verify/page.tsx` — recruiter-app copy
- `frontend/packages/ui/src/verify-card.tsx` — current `<VerifyCard>` + `VerifyStatus` (rebuilt
  inside the new auth-card primitive in `@ip/ui`; the `VerifyStatus` enum stays — see below)
- `frontend/apps/candidate/components/auth-layout.tsx` and `auth-split-panel.tsx` — v2 shells
  (deleted by `/login` Task 1)

Preserved logic surfaces (out-of-scope to edit):

- `useEffect` that reads `URLSearchParams(window.location.search).get("token")` and the `called`
  ref that ensures `verify({ token })` fires exactly once (StrictMode-safe)
- `useAuth().api.auth.verify({ token })` — sets `status="ok"` on resolve, `status="error"` +
  `message = errorMessage(err)` on reject
- `useAuth().api.auth.resendVerification({ email })` — wired as the `onResend` handler in the
  `error` branch
- `VerifyStatus = "working" | "ok" | "error" | "invalid"` (kept as an exported `@ip/ui` type so
  the page state stays the same shape)

## Layout & components

Reuse the `@ip/ui` auth-card primitive from `/login` (Task 1 there). The four branches render
inside the same card.

| Region | Component | Tokens / primitives |
|---|---|---|
| Page surface | `<main class="auth">` | Identical to `/login`. |
| Card | `<AuthCard>` | Identical to `/login`. The card geometry is stable across all four states — no layout shift. |
| Brand mark | `<LogoMark>` (aperture sprite) | Identical. |
| `working` headline | `<h1 class="display">Verifying your email…</h1>` | Schibsted Grotesk, `var(--step-3)`. |
| `working` body | `<Spinner aria-label="Verifying" /> <p>One second.</p>` | Spinner sized 40px, color `--teal`; respects `prefers-reduced-motion` (replaces the spin with a static `--teal-glow` ring). |
| `ok` headline | `<h1 class="display">Email verified</h1>` | Schibsted Grotesk, `var(--step-3)`. |
| `ok` body | `<svg><use href="#shield-check"/></svg>` icon (color `--good`) + `<p>You're all set. Welcome to Aptura.</p>` + `<Button class="btn btn-primary">Continue to your home</Button>` → `/` | `continueHref="/"` (existing prop). |
| `error` headline | `<h1 class="display">Couldn't verify</h1>` | Schibsted Grotesk, `var(--step-3)`. |
| `error` body | `<Alert tone="danger">{message}</Alert>` + resend block | Resend block: `<Field>` + `<Input type="email" autocomplete="email" required>` + `<Button class="btn btn-ghost">Resend verification email</Button>`. On resend success: `<Alert tone="success">If that account exists, a new link is on its way.</Alert>` (neutral). |
| `invalid` headline | `<h1 class="display">No verification token</h1>` | Schibsted Grotesk, `var(--step-3)`. |
| `invalid` body | `<Alert tone="danger">This verification link is missing the token. Try opening it from your email again, or request a new one.</Alert>` + same resend block as `error` | The RPC is never called in this branch. |
| Back link (all states) | `<Link href="/login"><ArrowLeft aria-hidden /> Back to sign in</Link>` | Below the body, `color: var(--ink-3)`, link in `--teal-strong`. |

The page is a thin wrapper that renders `<AuthCard>` with the right state-specific contents — the
old `<VerifyCard>` self-framed component is replaced by the centered auth-card primitive so this
screen looks identical to its siblings.

## Data wiring / seam

- **Client/seam:** `useAuth().api.auth.verify({ token })` (one-shot, guarded by the `called` ref);
  `useAuth().api.auth.resendVerification({ email })` (wired as `onResend`).
- **State machine.** `status: VerifyStatus = "working" | "ok" | "error" | "invalid"`. On mount the
  `useEffect` reads the URL token: empty → `status="invalid"` (no RPC); non-empty → fire `verify`
  exactly once → `status="ok"` on resolve, `status="error"` + `message` on reject.
- **`called` ref** ensures the RPC never fires twice in StrictMode. **Load-bearing — do not
  remove.**
- **Resend handler:** on `onResend(email)` → `api.auth.resendVerification({ email })` → on resolve
  render the neutral success `<Alert>`; on reject render the neutral error `<Alert>` (never leak
  existence).
- **TanStack query keys:** none (one-shot mutation + one-shot resend mutation).
- **Backend:** see [`backend_verify-email.md`](./backend_verify-email.md) — no proto delta, no new
  RPC.

## Tasks (TDD-style, build → screenshot-verify → commit per task)

> **Task 0 — design language is the mockup.** No per-screen HTML mockup. Build to the auth-card
> primitive; the four branches each render inside the same card.

- **Task 1 — Rebuild `/verify` using the auth-card primitive.** Replace
  `apps/candidate/app/verify/page.tsx` (and the recruiter copy) so the route renders
  `<main class="auth"><AuthCard>…</AuthCard></main>` with the four state-specific contents (see
  the Layout & components table). Move the `VerifyStatus` enum export into `@ip/ui` (re-exported
  from `frontend/packages/ui/src/verify-status.ts` so the page can `import { VerifyStatus } from
  "@ip/ui"`). Wire the `useEffect` URL read, the `called` ref, and the `verify` call verbatim.
  Commit explicit paths.
- **Task 2 — Resend wiring.** In the `error` + `invalid` branches, render the resend block (email
  `<Field>` + `<Input>` + `<Button>`). Wire `api.auth.resendVerification({ email })`. Render the
  neutral success `<Alert>` on resolve, the neutral error `<Alert>` on reject. Verify the resend
  email validation (`required` + format) before allowing the button to fire. Commit.
- **Task 3 — All four states verified.** Verify each `VerifyStatus` branch renders inside the same
  card with no layout shift:
  1. `working` — spinner + "Verifying your email…" (initial state on a valid `?token=`).
  2. `ok` — shield-check + "Email verified" + "Continue to your home" → `/`.
  3. `error` — `<Alert>` with the server message + resend block.
  4. `invalid` — `<Alert>` for missing token + resend block (RPC not called).
  Commit.
- **Task 4 — Verify + screenshot.** `--filter @ip/candidate build` + `tsc --noEmit` green. Run the
  dev server, navigate to `/verify?token=demo` (mock the success and the error responses) and
  `/verify` (no token). Screenshot each of the four states at 1440×900 and 390×844 in both
  themes. Side-by-side fidelity check against the `/login` rebuild. Verify the `called` ref
  prevents a double-fire in StrictMode (the dev server should show the `verify` request exactly
  once in the network tab).

## States & a11y

- **States.** `working` (spinner, no CTA, polite live region) · `ok` (success icon + continue CTA;
  focus moves to the CTA) · `error` (`<Alert>` + resend block; focus moves to the alert) ·
  `invalid` (`<Alert>` + resend block, RPC not called; focus moves to the alert). Resend nested
  states: idle → loading → sent (neutral success) / error (neutral failure). All four states use
  the same card geometry — **no layout shift** between them.
- **Responsive.** Card is `max-width: 480px` from `>= 480px`. Below `480px`, page padding
  collapses to `1rem` and the card fills the viewport. No split-panel to collapse.
- **Dark + light.** All colors via tokens. Spinner color `--teal`; success icon color `--good`;
  alerts `--danger` / `--good`; all resolve in both themes.
- **A11y.** One `<h1>` per state (the headline changes with `status`). Spinner has
  `aria-label="Verifying"`. Resend `<Field>` label + `aria-describedby` for the email format.
  `<ArrowLeft>` icon is `aria-hidden`. `:focus-visible` ring uses `--teal` 2px / 4px halo. Touch
  targets ≥44×44. Body contrast ≥4.5:1. `<Alert>` regions are `role="alert"`. On `status`
  transition, focus moves to the new primary action (continue / alert / resend input). The
  `called`-ref guard prevents two RPCs in StrictMode (avoids a double-fire announcement to screen
  readers). Honors `prefers-reduced-motion` — spinner falls back to a static `--teal-glow` ring.

## Acceptance

- Looks 1:1 like the auth-card primitive in [`_design-language.md`](../_design-language.md) — the
  same card geometry as `/login`, with state-specific contents per `VerifyStatus`. Side-by-side
  screenshot proof committed under
  `docs/brand/redesign-v3/verify/verify-email-{light,dark}-{working,ok,error,invalid}.jpeg`.
- `--filter @ip/ui build` + `--filter @ip/candidate build` is green; `--filter @ip/company build`
  is green (or the unified package if v3 unification has landed); `tsc --noEmit` is green; no
  console errors / warnings on the rendered page; reduced-motion is honored.
- **Zero functional diff** from today: `verify({ token })` is called exactly once (`called` ref
  guard preserved); `resendVerification({ email })` fires on the resend handler; the four
  `VerifyStatus` branches map to the same `status` state machine; `continueHref="/"` lands on the
  candidate home. The `called` ref is **load-bearing** — do not remove it.
- The token consumed here was minted by the registration flow (or by a prior `resendVerification`
  call); this contract documents nothing about token minting.
