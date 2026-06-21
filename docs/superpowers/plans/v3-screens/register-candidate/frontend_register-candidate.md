# Candidate sign-up — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Public, token-free **candidate sign-up surface**. Rebuild the existing split-panel/register UI as
the centered **auth-card** primitive — same shape as `/login`, with email + password (min 8) and a
live password-strength meter that gives the candidate a clear, honest signal before submit. Every
existing auth call (`useAuth().register` → `api.auth.registerCandidate`) is preserved verbatim —
only the markup, tokens, and motion are new.

## Route + role

`/register` · **public** (signed-out, pre-token). Post-register: `router.push("/")` to the
candidate home (existing `makeAuth` token-store path).

## Approved mockup (build to this exactly)

- **Design language (canonical):** [`../_design-language.md`](../_design-language.md) — see the
  **auth-card primitive** (centered card on `var(--bg)`, ≤ 480px, aperture mark + display headline
  + Hanken form + teal CTA + truthful pre-launch footer). This screen reuses the same primitive as
  `/login`, with one extra field group: the live password-strength meter.
- **Reference demo (for tokens, type, motion, mark):**
  [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
  — use the same aperture `<symbol id="mark">`, the same `--teal` button treatment, the same
  Schibsted Grotesk + Hanken Grotesk + Geist Mono families.
- **Screenshots for token / theme proof:**
  `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-{light,dark}-hero.jpeg`.

No per-screen mockup file. Build to the auth-card primitive; verify side-by-side against the
screenshots and the `/login` rebuild.

## Existing code being REPLACED (not modified)

Delete-and-rebuild scope:

- `frontend/apps/candidate/app/register/page.tsx` — current `<AuthLayout>` + `CredentialsForm`
  shell
- `frontend/apps/candidate/components/credentials-form.tsx` — shared form body with `/login`
  (replaced by the new auth-card primitive in `@ip/ui`)
- `frontend/apps/candidate/components/auth-layout.tsx` — v2 two-pane shell (deleted)
- `frontend/apps/candidate/components/auth-split-panel.tsx` — v2 brand panel (deleted)

Preserved logic surfaces (out-of-scope to edit):

- `useAuth().register(email, password)` → `api.auth.registerCandidate({ email, password })` via the
  `makeAuth` `register` closure
- The post-register `router.push("/")` redirect
- Server-side validation (uniqueness, min-length, weak-password) — surfaced in the FE as
  `errorMessage(err)` only

## Layout & components

Reuse the `@ip/ui` auth-card primitive from `/login` (Task 1 there). This screen adds one extra
primitive: the **password-strength meter**.

| Region | Component | Tokens / primitives |
|---|---|---|
| Page surface | `<main class="auth">` | Identical to `/login`. |
| Card | `<AuthCard>` | Identical to `/login`. |
| Brand mark | `<LogoMark>` (aperture sprite `<use href="#mark"/>`) | Identical. |
| Headline | `<h1 class="display">Create your account</h1>` | Schibsted Grotesk, `var(--step-3)`, `text-wrap: balance`. |
| Sub | `<p>Get matched to roles that hire on proven merit.</p>` | Hanken Grotesk, `var(--step-0)`, `color: var(--ink-2)`. **Truthful** — no fake "join 2M users" framing. |
| Form | `<form>` | `display: grid; gap: 1rem`. |
| Email field | `<Field>` + `<Input type="email" autocomplete="email" required>` | Inline error under the field via `aria-describedby` (e.g., "Use your work or personal email."). |
| Password field | `<Field>` + `<Input type="password" autocomplete="new-password" minLength={8} required>` with reveal toggle (`<Button aria-pressed>`) | Min-length 8 enforced client + server. |
| Strength meter | `<PasswordStrengthMeter value={password} />` | 5px bar (`.bar`) below the password field, segmented in 4 ticks; fills with `--teal` for strong, `--warn` for medium, `--danger` for weak. Label is mono (`Geist Mono`, `var(--step--2)`) e.g. `weak / fair / good / strong`. **Score is presentational** (zxcvbn-style local heuristic; never sent to the server). |
| Primary CTA | `<Button class="btn btn-primary">Create account</Button>` | `loading` → "Working…". |
| Error | `<Alert tone="danger">` | RPC error via `errorMessage(err)`. |
| Terms note | `<p class="terms">By continuing you agree to the <Link href="/legal/terms">Terms</Link> and <Link href="/legal/privacy">Privacy</Link>.</p>` | `var(--step--1)`, `color: var(--ink-3)`. |
| Footer link | `<p>Already have an account? <Link href="/login">Sign in</Link></p>` | `var(--step--1)`, `color: var(--ink-3)` with link in `--teal-strong`. |

`<PasswordStrengthMeter>` is exported from `@ip/ui` so the `reset-password` screen reuses the same
control. No app-local copy.

## Data wiring / seam

- **Client/seam:** `useAuth().register(email, password)` — wraps `api.auth.registerCandidate({
  email, password })` via the `makeAuth` `register` closure. Tokens + identity (role `candidate`)
  are stored inside `makeAuth`; the page reacts to `useAuth()` state and calls
  `router.push("/")` on success.
- **No SSO on this page today.** If `listOAuthProviders` later returns providers and the product
  decides to offer SSO sign-up, the same gated `<SsoButtons>` group used on `/login` can be added
  — same primitive, same gating rule (render nothing on empty).
- **TanStack query keys:** none (register is a single mutation).
- **Password strength** is a **local, presentational** computation — no network call, no telemetry.
- **Backend:** see [`backend_register-candidate.md`](./backend_register-candidate.md) — no proto
  delta, no new RPC.

## Tasks (TDD-style, build → screenshot-verify → commit per task)

> **Task 0 — design language is the mockup.** No per-screen HTML mockup. Build to the auth-card
> primitive + the new `<PasswordStrengthMeter>` and verify against the design language doc and the
> `/login` rebuild.

- **Task 1 — `<PasswordStrengthMeter>` into `@ip/ui`.** Add the component (5px segmented bar +
  mono label) using the existing `.bar` token shape from the design language. The strength scoring
  is a small local heuristic (length, character classes, common-password list) — keep it
  dependency-free if reasonable; otherwise pin the existing helper used by the legacy form. Commit
  `frontend/packages/ui/src/password-strength-meter.tsx` and the corresponding CSS in
  `frontend/packages/ui/src/app.css`.
- **Task 2 — Rebuild `/register`.** Replace `apps/candidate/app/register/page.tsx` so the route
  renders `<main class="auth"><AuthCard>…</AuthCard></main>` with the aperture mark, headline
  "Create your account", sub, email + password fields, the strength meter, the "Create account"
  primary CTA, the terms note, and the "Sign in" footer link. Wire `useAuth().register` and
  `router.push("/")` verbatim. Commit explicit paths.
- **Task 3 — Error + loading states + field validation.** Render the RPC error `<Alert>` from
  `errorMessage(err)` (duplicate email, weak password, `INVALID_ARGUMENT`, `UNAVAILABLE` all map to
  the same alert with the server's message). Show the primary button in `loading` state during the
  mutation. Verify that submit is disabled until both fields pass `required` + `minLength={8}`.
  Verify field-level inline errors render with `aria-describedby` and `--danger` color. Commit.
- **Task 4 — Verify + screenshot.** `--filter @ip/candidate build` + `tsc --noEmit` green. Run the
  dev server, navigate to `/register`, screenshot at 1440×900 and 390×844 in both themes.
  Side-by-side fidelity check against the `/login` rebuild — same card, same mark, same type,
  same teal CTA. Verify a successful sign-up round-trip lands on `/` (candidate home). Verify a
  duplicate-email error renders the `<Alert>` and leaves the form populated.

## States & a11y

- **States.** Initial (both fields empty, strength meter at zero, submit disabled) · typing
  (strength meter updates live) · loading (`Button loading` → "Working…", inputs disabled) · error
  (`<Alert tone="danger">` above the form, focus moves to the alert) · success (redirect to `/`,
  no flash of empty page). Field-level: email format error inline; password too-short error inline;
  weak-password warning inline (advisory only — server is the source of truth).
- **Responsive.** Card is `max-width: 480px` from `>= 480px`. Below `480px`, the page padding
  collapses to `1rem` and the card fills the viewport width. No split-panel to collapse.
- **Dark + light.** All colors via tokens. Strength meter fill colors (`--good`, `--warn`,
  `--danger`, `--teal`) resolve in both themes; the strength label is `--ink-3` mono.
- **A11y.** One `<h1>`. Form labels via `<Field>`; `aria-describedby` wires field-level errors and
  the strength meter ("Password strength: fair"). Password reveal is a `<Button aria-pressed>` with
  a visible focus ring. `:focus-visible` ring uses `--teal` 2px / 4px halo. Touch targets ≥44×44.
  Body contrast ≥4.5:1. `Alert` regions are `role="alert"`. Strength meter is announced via
  `aria-live="polite"` (changes are debounced ~250ms to avoid spamming the screen reader). Honors
  `prefers-reduced-motion`.

## Acceptance

- Looks 1:1 like the auth-card primitive in [`_design-language.md`](../_design-language.md) — the
  same card geometry as `/login`, plus the password-strength meter as a single new control.
  Side-by-side screenshot proof committed under
  `docs/brand/redesign-v3/verify/register-candidate-{light,dark}.jpeg`.
- `--filter @ip/candidate build` is green; `tsc --noEmit` is green; no console errors / warnings on
  the rendered page; reduced-motion is honored.
- **Zero functional diff** from today: `useAuth().register` is called with the same `{ email,
  password }` shape; success routes to `/`; duplicate-email + weak-password + network errors map
  to the same `<Alert>`. The strength meter is purely presentational and never affects submit
  enablement (only `required` + `minLength={8}` do).
- Pre-launch posture is enforced: no fake user counts, no fabricated social-proof copy. Only what's
  true ("Get matched to roles that hire on proven merit.").
- The role claim minted by `registerCandidate` (`candidate`) still drives the post-login shell
  routing — the existing role-gating logic is untouched.
