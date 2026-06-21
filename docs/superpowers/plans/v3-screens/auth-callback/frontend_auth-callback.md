# SSO callback — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Transient, token-receiving **SSO callback** interstitial. Rebuild the existing minimal callback
card as the centered **auth-card** primitive — branded spinner up top while the page parses the
SSO hash → validates the JWT → seeds the token store → role-routes. An error fallback uses the
same card with an `<Alert>` + "Back to sign in" CTA. Every existing security-critical step (hash
parse, `isValidJwt`, `store.set`, `router.replace`, `RESOLVE_TIMEOUT_MS`) is preserved verbatim.

## Route + role

`/auth/callback` · **public → becoming signed-in** (the page consumes the hash JWT, seeds the
store, then role-routes). On valid token → `router.replace("/")` for candidate or
`router.replace("/company")` for recruiter (role-aware, same as `/login`'s post-login redirect).

## Approved mockup (build to this exactly)

- **Design language (canonical):** [`../_design-language.md`](../_design-language.md) — see the
  **auth-card primitive**. This is the **transient** flavor: spinner state + an error fallback
  inside the same card.
- **Reference demo (for tokens, type, motion, mark):**
  [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
- **Screenshots for token / theme proof:**
  `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-{light,dark}-hero.jpeg`.

No per-screen mockup file. Build to the auth-card primitive; the spinning state and the error
fallback both render inside the same card.

## Existing code being REPLACED (not modified)

Delete-and-rebuild scope:

- `frontend/apps/candidate/app/auth/callback/page.tsx` — current `<main>` + `<Card>` +
  `<Spinner>` shell + `<Alert>` error branch
- `frontend/apps/company/app/auth/callback/page.tsx` — recruiter-app copy (same structure today;
  v3 unifies)

Preserved logic surfaces (out-of-scope to edit — **all security-critical**):

- `window.location.hash` parse (handles `#access_token=…` and `#error=…`)
- `isValidJwt(access)` — 3 dot-segments, all non-empty; base64url payload parses to a non-null
  object; `exp` not in the past (10s clock-skew grace)
- `store.set({ access, refresh: "" })` — seeds the in-memory/persisted auth store; refresh rides
  an HttpOnly cookie (not JS-readable), so `refresh` is seeded as `""`
- `router.replace("/")` (candidate) / `router.replace("/company")` (recruiter) — role-aware
- `RESOLVE_TIMEOUT_MS = 8000` — the page never spins forever; on timeout it falls back to the
  error branch
- All error strings (no-token, invalid-JWT, expired, hash-error, timeout) — preserved verbatim

## Layout & components

Reuse the `@ip/ui` auth-card primitive from `/login` (Task 1 there). This is the **only** auth
screen that is a transient interstitial — no form, no inputs, no submit.

| Region | Component | Tokens / primitives |
|---|---|---|
| Page surface | `<main class="auth">` | Identical to `/login`. |
| Card | `<AuthCard>` | Identical to `/login`. The card geometry is stable across the spinning + error states — no layout shift. |
| Brand mark | `<LogoMark>` (aperture sprite) | Identical, sized 40px; on the spinning state the mark gets a `--teal-glow` halo (the aperture is the "brand spinner" — see the demo's status pulse for the motion vocabulary). |
| Spinning headline | `<h1 class="display">Signing you in…</h1>` | Schibsted Grotesk, `var(--step-3)`. |
| Spinning body | `<Spinner aria-label="Signing in" />` + `<p>One second.</p>` | Spinner sized 32px, color `--teal`. Respects `prefers-reduced-motion` (replaces the spin with a static `--teal-glow` ring; the page still resolves on the JWT-validation path or the `RESOLVE_TIMEOUT_MS` timer). |
| Error headline | `<h1 class="display">Sign-in didn't complete</h1>` | Schibsted Grotesk, `var(--step-3)`. |
| Error body | `<Alert tone="danger">{errorMessage}</Alert>` + `<Button class="btn btn-primary">Back to sign in</Button>` linking `/login` | `errorMessage` is one of the existing preserved strings (no-token, invalid-JWT, expired, `#error=…`, timeout). |

The card geometry is stable across both states — no layout shift between spinning and error.

## Data wiring / seam

- **No RPC.** This page is **pure client** — it consumes what the SSO redirect delivered.
- **Inbound:** `window.location.hash` carries `#access_token=<jwt>` (or `#error=<…>`). Refresh
  token rides an HttpOnly cookie (not JS-readable).
- **Sequence (preserved verbatim):**
  1. Parse the hash. If `#error=…` → error branch with "Sign-in failed. Please try again."
  2. If no `access_token` → error branch with "No session was returned."
  3. Validate the JWT with `isValidJwt`. If invalid → error branch with "The session token was
     invalid. Please sign in again."
  4. `store.set({ access, refresh: "" })`.
  5. `router.replace("/")` for candidate or `router.replace("/company")` for recruiter (role read
     from the JWT payload, same logic as `/login`).
- **Timeout:** a `RESOLVE_TIMEOUT_MS = 8000` guard ensures the page never spins forever; on
  timeout → error branch with "Sign-in is taking too long. Please try again."
- **TanStack query keys:** none (no fetch).
- **Backend:** see [`backend_auth-callback.md`](./backend_auth-callback.md) — no RPC, no contract
  delta; the OAuth dispatcher upstream is unchanged.

## Tasks (TDD-style, build → screenshot-verify → commit per task)

> **Task 0 — design language is the mockup.** No per-screen HTML mockup. Build to the auth-card
> primitive; the spinning + error branches both render inside the same card.

- **Task 1 — Rebuild `/auth/callback`.** Replace `apps/candidate/app/auth/callback/page.tsx` (and
  the recruiter copy) so the route renders `<main class="auth"><AuthCard>…</AuthCard></main>`
  with the aperture mark (sized 40px, with the `--teal-glow` halo on spinning state), the
  spinning headline + spinner + body, and the error fallback. Wire the hash parse, `isValidJwt`,
  `store.set`, `router.replace`, and `RESOLVE_TIMEOUT_MS` verbatim. Commit explicit paths.
- **Task 2 — Error branch + timeout.** Render the error `<Alert>` + "Back to sign in" CTA for each
  preserved error string (no-token, invalid-JWT, expired, `#error=…`, timeout). Verify the
  `RESOLVE_TIMEOUT_MS` timer fires the timeout branch when the JWT validation hangs or the role
  read is delayed. Verify a malformed JWT (e.g. 2 segments) triggers the invalid-JWT branch
  **before** any `store.set`. Commit.
- **Task 3 — Verify + screenshot.** `--filter @ip/candidate build` + `tsc --noEmit` green. Run the
  dev server, navigate to `/auth/callback#access_token=<valid-test-jwt>`, screenshot the spinning
  state at 1440×900 and 390×844 in both themes (use throttle / breakpoint to hold the spinner).
  Navigate to `/auth/callback#error=oauth_denied`, screenshot the error state. Verify the
  role-aware redirect: a candidate-role JWT lands on `/`, a recruiter-role JWT lands on
  `/company`. Side-by-side fidelity check against the `/login` rebuild — same card, same mark,
  same teal motion vocabulary.

## States & a11y

- **States.** Spinning (default on a valid `#access_token=…`; `<Spinner aria-label="Signing in">`,
  polite live region announces "Signing in") · error (preserved error strings — no-token,
  invalid-JWT, expired, `#error=…`, timeout; focus moves to the alert + CTA). The card geometry is
  stable across both states — **no layout shift**.
- **Responsive.** Card is `max-width: 480px` from `>= 480px`. Below `480px`, page padding
  collapses to `1rem` and the card fills the viewport. No split-panel to collapse.
- **Dark + light.** All colors via tokens. Spinner + halo `--teal` / `--teal-glow`; alert
  `--danger`; both resolve in both themes.
- **A11y.** One `<h1>` per state. `<Spinner>` has `aria-label="Signing in"`. `<LogoMark>` is
  `aria-hidden`. The spinning state uses `aria-busy="true"` + `aria-live="polite"`. On the
  spinning→error transition, focus moves to the alert + CTA. `:focus-visible` ring uses `--teal`
  2px / 4px halo. Touch targets ≥44×44. Body contrast ≥4.5:1. `<Alert>` is `role="alert"`. Honors
  `prefers-reduced-motion` — spinner + aperture-halo fall back to a static `--teal-glow` ring;
  the JWT validation + redirect still happen on the same timeline.

## Acceptance

- Looks 1:1 like the auth-card primitive in [`_design-language.md`](../_design-language.md) — the
  same card geometry as `/login`, with the spinning state and the error fallback inside the same
  card. Side-by-side screenshot proof committed under
  `docs/brand/redesign-v3/verify/auth-callback-{light,dark}-{spinning,error}.jpeg`.
- `--filter @ip/candidate build` is green; `--filter @ip/company build` is green (or the unified
  package if v3 unification has landed); `tsc --noEmit` is green; no console errors / warnings on
  the rendered page; reduced-motion is honored.
- **Zero functional diff** from today: hash parse, `isValidJwt`, `store.set`, `router.replace`,
  and the `RESOLVE_TIMEOUT_MS` timer all behave identically. Every preserved error string still
  renders for its specific failure mode. The role-aware redirect lands candidates on `/` and
  recruiters on `/company`. **All security-critical logic is load-bearing — do not edit any step.**
- The upstream OAuth authorize redirect (started by `/login`'s SSO buttons) is unchanged; this
  page consumes only what the redirect delivered.
