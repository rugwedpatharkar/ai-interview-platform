# Reset password — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Public, token-scoped **complete-password-reset surface**. Rebuild the existing split-panel/reset UI
as the centered **auth-card** primitive with a new-password input + strength meter, and a clear
invalid-link branch when the URL has no `?token=` (or the server rejects the token). The
`resetToken` null/`""`/value state machine and the `useAuth().api.auth.resetPassword({ token,
newPassword })` call are preserved verbatim.

## Route + role

`/reset` · **public** (signed-out, token-scoped via `?token=` URL parameter). On success →
`router.push("/login")` (the user signs in with the new password).

## Approved mockup (build to this exactly)

- **Design language (canonical):** [`../_design-language.md`](../_design-language.md) — see the
  **auth-card primitive** and the password-strength meter (shipped by `/register` Task 1).
- **Reference demo (for tokens, type, motion, mark):**
  [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
- **Screenshots for token / theme proof:**
  `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-{light,dark}-hero.jpeg`.

No per-screen mockup file. Build to the auth-card primitive; verify against the `/login` rebuild.

## Existing code being REPLACED (not modified)

Delete-and-rebuild scope:

- `frontend/apps/candidate/app/reset/page.tsx` — current `<AuthLayout>` + new-password form + the
  invalid-link branch
- `frontend/apps/company/app/reset/page.tsx` — recruiter-app copy (same structure today; v3
  unifies)
- `frontend/apps/candidate/components/auth-layout.tsx` and `auth-split-panel.tsx` — v2 shells
  (deleted by `/login` Task 1)

Preserved logic surfaces (out-of-scope to edit):

- `useEffect` that reads `URLSearchParams(window.location.search).get("token")` and stores it as
  `resetToken` (a `string | null` where `null` = still reading, `""` = missing token, otherwise
  the token)
- The `disabled={resetToken === null}` guard on the submit button (prevents submit before the URL
  has been read)
- `useAuth().api.auth.resetPassword({ token, newPassword })`
- The success `router.push("/login")` redirect
- The invalid-link branch on `resetToken === ""` (renders the `<Alert>` + "Request a new link"
  CTA → `/forgot`; RPC is **not** called)

## Layout & components

Reuse the `@ip/ui` auth-card primitive from `/login` (Task 1 there) and the
`<PasswordStrengthMeter>` primitive from `/register` (Task 1 there).

| Region | Component | Tokens / primitives |
|---|---|---|
| Page surface | `<main class="auth">` | Identical to `/login`. |
| Card | `<AuthCard>` | Identical to `/login`. |
| Brand mark | `<LogoMark>` (aperture sprite) | Identical. |
| Headline | `<h1 class="display">Choose a new password</h1>` | Schibsted Grotesk, `var(--step-3)`. |
| Sub | `<p>Pick something you haven't used here before.</p>` | Hanken Grotesk, `var(--step-0)`, `color: var(--ink-2)`. |
| Form (valid-token state) | `<form>` with `<Field>` + `<Input type="password" autocomplete="new-password" minLength={8} required>` + `<PasswordStrengthMeter>` + `<Button class="btn btn-primary" disabled={resetToken === null}>Update password</Button>` | Min-length 8 client + server. Reveal toggle is a `<Button aria-pressed>`. |
| Invalid-link state | `<Alert tone="danger">This reset link is invalid or expired.</Alert>` + `<Button class="btn btn-primary">Request a new link</Button>` linking `/forgot` | Triggered when `resetToken === ""`; RPC is never called. |
| Error state | `<Alert tone="danger">{errorMessage(err)}</Alert>` | Server reject (e.g. token already used, expired server-side); form remains for retry. |
| Back link | `<Link href="/login"><ArrowLeft aria-hidden /> Back to sign in</Link>` | Below the form, `color: var(--ink-3)`, link in `--teal-strong`. |

Both branches (valid-token form + invalid-link panel) live inside the same `<AuthCard>` — no
layout shift between them.

## Data wiring / seam

- **Client/seam:** `useAuth().api.auth.resetPassword({ token, newPassword })`. Token read from
  `URLSearchParams(window.location.search).get("token")` inside a `useEffect` and stored as
  `resetToken: string | null`. Empty token (`""`) → invalid-link branch, RPC not called.
- **`resetToken` state machine.** `null` (still reading the URL — submit disabled) → either `""`
  (missing token — render invalid-link panel) or a token string (render the form, enable submit).
  **Load-bearing — do not alter.**
- **On success:** `router.push("/login")`. The user then signs in with the new password.
- **TanStack query keys:** none.
- **Backend:** see [`backend_reset-password.md`](./backend_reset-password.md) — no proto delta, no
  new RPC.

## Tasks (TDD-style, build → screenshot-verify → commit per task)

> **Task 0 — design language is the mockup.** No per-screen HTML mockup. Build to the auth-card
> primitive + reuse the `<PasswordStrengthMeter>` shipped by `/register`.

- **Task 1 — Rebuild `/reset`.** Replace `apps/candidate/app/reset/page.tsx` (and the recruiter
  copy) so the route renders `<main class="auth"><AuthCard>…</AuthCard></main>` with the aperture
  mark, headline "Choose a new password", sub, new-password field, the strength meter, the "Update
  password" primary CTA, and the back link. Wire the `useEffect` URL read + `resetToken` state +
  `useAuth().api.auth.resetPassword` call + `router.push("/login")` verbatim. Commit explicit
  paths.
- **Task 2 — Invalid-link branch.** Render the invalid-link `<Alert>` + "Request a new link"
  primary CTA → `/forgot` when `resetToken === ""`. The RPC must **not** fire in this branch.
  Verify by visiting `/reset` with no query string. Commit.
- **Task 3 — Error + loading states.** Render the RPC error `<Alert>` from `errorMessage(err)`
  for `INVALID_ARGUMENT` / token-used / token-expired-server-side / `UNAVAILABLE`. Show the
  primary button in `loading` state during the mutation; keep the `disabled={resetToken === null}`
  guard so the user can't submit before the URL is read. Verify field-level inline error for
  too-short password renders with `aria-describedby` and `--danger`. Commit.
- **Task 4 — Verify + screenshot.** `--filter @ip/candidate build` + `tsc --noEmit` green. Run the
  dev server, navigate to `/reset?token=demo`, screenshot the form state at 1440×900 and 390×844
  in both themes. Then navigate to `/reset` (no token), screenshot the invalid-link state. Verify
  a successful reset round-trip lands on `/login`. Side-by-side fidelity check against the
  `/login` rebuild.

## States & a11y

- **States.** Reading URL (`resetToken === null`, submit disabled — brief flicker that the
  `useEffect` resolves on first paint) · valid-token form (password empty, strength meter at zero,
  submit enabled when `required` + `minLength={8}` pass) · typing (strength meter live) · loading
  (`Button loading` → "Updating…", input disabled) · invalid-link (`resetToken === ""` → `<Alert>`
  + "Request a new link", RPC not called) · error (server reject → `<Alert>`, form remains) ·
  success (redirect to `/login`).
- **Responsive.** Card is `max-width: 480px` from `>= 480px`. Below `480px`, page padding
  collapses to `1rem` and the card fills the viewport. No split-panel to collapse.
- **Dark + light.** All colors via tokens. Strength meter colors (`--good`, `--warn`, `--danger`,
  `--teal`) resolve in both themes.
- **A11y.** One `<h1>`. Form label via `<Field>`; `aria-describedby` wires field-level error and
  the strength meter. Password reveal is `<Button aria-pressed>`. `<ArrowLeft>` icon is
  `aria-hidden`. `:focus-visible` ring uses `--teal` 2px / 4px halo. Touch targets ≥44×44. Body
  contrast ≥4.5:1. `<Alert>` regions are `role="alert"`. Strength meter is announced via
  `aria-live="polite"` (debounced ~250ms). On the form→success transition, the redirect happens
  without a flash of empty page. Honors `prefers-reduced-motion`.

## Acceptance

- Looks 1:1 like the auth-card primitive in [`_design-language.md`](../_design-language.md) — the
  same card geometry as `/login`, with a new-password field, the strength meter, and a clear
  invalid-link branch. Side-by-side screenshot proof committed under
  `docs/brand/redesign-v3/verify/reset-password-{light,dark}.jpeg`.
- `--filter @ip/candidate build` is green; `--filter @ip/company build` is green (or the unified
  package if v3 unification has landed); `tsc --noEmit` is green; no console errors / warnings on
  the rendered page; reduced-motion is honored.
- **Zero functional diff** from today: `resetPassword({ token, newPassword })` is called with the
  same shape; the `resetToken` state machine is preserved; success routes to `/login`; invalid-link
  branch never calls the RPC. The `disabled={resetToken === null}` guard is **load-bearing** — do
  not remove it.
- The token consumed here was minted by `/forgot` per its plan; this contract documents nothing
  about token minting.
