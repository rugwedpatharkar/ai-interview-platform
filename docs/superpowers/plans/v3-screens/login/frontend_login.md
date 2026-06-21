# Sign in — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Public, token-free **sign-in surface** for Aptura. Rebuild the existing split-panel/login UI as a
small, focused, centered **auth-card** that lives directly on `var(--bg)` — the aperture mark up top,
a confident Schibsted Grotesk headline, a clean Hanken Grotesk form, a teal primary CTA, and a
truthful pre-launch footer. Every existing auth call (`useAuth().login`, `listOAuthProviders`,
role-aware redirect) is preserved verbatim — only the markup, tokens, and motion are new.

## Route + role

`/login` · **public** (signed-out, pre-token). Role-aware post-login redirect: candidate role → `/`,
recruiter/company role → `/company`. The page is reachable from both apps' route trees today
(`apps/candidate/app/login/page.tsx`, `apps/company/app/login/page.tsx`) — the v3 unified shell
funnels both into one rebuilt page.

## Approved mockup (build to this exactly)

- **Design language (canonical):** [`../_design-language.md`](../_design-language.md) — see the
  **auth-card primitive** (centered card on `var(--bg)`, ≤ 480px, aperture mark + display headline +
  Hanken form + teal CTA + truthful pre-launch footer).
- **Reference demo (for tokens, type, motion, mark):**
  [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
  — use the same aperture `<symbol id="mark">`, the same `--teal` button treatment, the same
  Schibsted Grotesk + Hanken Grotesk + Geist Mono families.
- **Screenshots for token / theme proof:**
  `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-{light,dark}-hero.jpeg` — verify the
  rebuilt auth-card resolves cleanly in both themes (no hard-coded hex; tokens only).

There is no per-screen mockup yet for `/login`. The screen is built to the auth-card primitive in
the design language doc, with the demo as the visual-token reference. Side-by-side screenshot proof
is part of the acceptance criteria — see "Acceptance" below.

## Existing code being REPLACED (not modified)

Delete-and-rebuild scope (assume these files will be re-written from scratch by the new plan):

- `frontend/apps/candidate/app/login/page.tsx` — current `<AuthLayout>` + `CredentialsForm` +
  `SsoButtons` shell
- `frontend/apps/company/app/login/page.tsx` — recruiter-app login (same structure today; v3
  unifies)
- `frontend/apps/candidate/components/credentials-form.tsx` — the email/password form body
- `frontend/apps/candidate/components/sso-buttons.tsx` — SSO provider buttons (gated by
  `listOAuthProviders`)
- `frontend/apps/candidate/components/auth-layout.tsx` — the v2 two-pane shell (replaced by the
  new centered auth-card primitive in `@ip/ui`)
- `frontend/apps/candidate/components/auth-split-panel.tsx` — v2 brand panel (deleted; the new
  auth-card has no split panel)
- `frontend/apps/company/components/credentials-form.tsx` and `auth-layout.tsx` — recruiter-app
  copies; replaced by the same primitive in `@ip/ui`

Preserved logic surfaces (out-of-scope to edit):

- `useAuth().login(email, password)` and the `makeAuth` token-store closure
- `useAuth().api.auth.listOAuthProviders({})` + `GET ${ADMIN_URL}/auth/oauth/authorize` redirect
- The role-aware post-login redirect (`router.push("/")` for candidate, `router.push("/company")`
  for recruiter)
- The `?notice=account-created` success-notice render path (set by company register's verify-gate
  fallback)

## Layout & components

Pull all primitives from `@ip/ui` per [`_design-language.md`](../_design-language.md). The auth-card
primitive is the **only** structural component this screen needs. Auth screens **do not** use the
`.app` sidebar shell and **do not** use the old `auth-split-panel`.

| Region | Component | Tokens / primitives |
|---|---|---|
| Page surface | `<main class="auth">` | Full-viewport `min-height: 100dvh`; background `var(--bg)`; centered grid (`place-items: center`); responsive padding `clamp(1.5rem, 5vh, 4rem)`. |
| Card | `<AuthCard>` | `max-width: 480px`; `background: var(--surface)`; `border: 1px solid var(--line)`; `border-radius: 22px`; `padding: clamp(1.75rem, 4vh, 2.5rem)`; `box-shadow: 0 18px 56px -28px color-mix(in oklch, var(--ink) 28%, transparent)`. |
| Brand mark | `<LogoMark>` (aperture sprite `<use href="#mark"/>`) | 36–40px, color `var(--teal)`, `aria-hidden`; sits above the headline with `margin-bottom: 1.25rem`. |
| Headline | `<h1 class="display">Welcome back</h1>` | Schibsted Grotesk, `var(--step-3)`, `letter-spacing: -0.04em`, `color: var(--ink-deep)`, `text-wrap: balance`. |
| Sub | `<p>Sign in to continue.</p>` | Hanken Grotesk, `var(--step-0)`, `color: var(--ink-2)`. |
| Form | `<form>` | Hanken Grotesk; `display: grid; gap: 1rem`. |
| Field | `<Field>` + `<Input>` (email, password) | Label `var(--step--1)` / `color: var(--ink-2)`; input `height: 46px`, `border-radius: 12px`, `border: 1px solid var(--line-2)`, `background: var(--surface)`, focus ring `--teal` 2px / 4px halo per design language. |
| Primary CTA | `<Button class="btn btn-primary">Sign in</Button>` | `btn-primary` from the demo: `background: var(--teal)`; `color: var(--teal-ink)`; `height: 46px`; `border-radius: 12px`; `box-shadow: 0 1px 0 color-mix(in oklch, var(--teal-strong) 60%, transparent)`. |
| Forgot link | `<Link href="/forgot">Forgot password?</Link>` | Inline below the password field, right-aligned, `color: var(--teal-strong)`. |
| SSO group (gated) | `<SsoButtons providers={…} />` (replacement) | If `providers.length > 0`: render a separator (`<hr class="auth-sep">` with centered "or" label in `--ink-3`) + one `<Button class="btn btn-ghost">` per provider. If `providers.length === 0`: render nothing — **no dead buttons**. |
| Notice (account-created) | `<Alert tone="success">` | Shown when `?notice=account-created`; "Account created — please verify your email, then sign in." |
| Error | `<Alert tone="danger">` | RPC error via `errorMessage(err)`; inline above the form. |
| Footer link | `<p>New to Aptura? <Link href="/register">Create an account</Link></p>` | `var(--step--1)`, `color: var(--ink-3)`, with the link in `var(--teal-strong)`. |

The auth-card primitive (`<AuthCard>` + `<Field>` + `<Input>` + `<Button>` + `<Alert>` + the `or`
separator + the aperture `<LogoMark>`) lives in `@ip/ui` so the other six auth screens consume the
same source. No app-local copies. The aperture mark is the existing `<symbol id="mark">` sprite,
mounted once in the root layout (per the design language doc).

## Data wiring / seam

- **Client/seam:** `useAuth().login(email, password)` — wraps the existing `AuthService.Login` →
  `makeAuth` closure that stores `{ access, refresh }` and sets `identity` (with the role claim).
- **SSO providers:** `useAuth().api.auth.listOAuthProviders({})` on mount (one-shot `useEffect`,
  no TanStack key); returns `{ providers: string[] }`. Failure degrades silently to "no SSO" — no
  dead buttons, no toast.
- **SSO start:** clicking a provider button → `window.location.href =
  ${ADMIN_URL}/auth/oauth/authorize?provider=<p>&redirect=<thisApp>/auth/callback` (same shape as
  today; reused verbatim from the existing `SsoButtons` source).
- **Role-aware redirect:** after `login` resolves, read the role from `identity` (or the JWT
  claim) → `router.push("/")` for candidate, `router.push("/company")` for recruiter/company. Logic
  unchanged from today.
- **`?notice=account-created`:** preserved render path — when the query is present, the
  success-notice `<Alert>` shows above the form.
- **TanStack query keys:** none (login is a mutation; providers is a one-shot effect).
- **Backend:** see [`backend_login.md`](./backend_login.md) — no proto delta, no new RPC.

## Tasks (TDD-style, build → screenshot-verify → commit per task)

> **Task 0 — design language is the mockup.** The auth-card primitive is defined in
> [`_design-language.md`](../_design-language.md). The demo at
> [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html) is the
> visual-token reference. Do **not** invent a per-screen HTML mockup — build directly to the
> primitive and verify against the screenshots.

- **Task 1 — Auth-card primitive into `@ip/ui`.** Add `<AuthCard>`, the `.auth` page-surface class,
  the `or`-separator, and the auth-only `<LogoMark>` wrapper to `@ip/ui` (extending the existing
  tokens + classed primitives). Six other auth screens will consume the same source. Commit
  `frontend/packages/ui/src/auth-card.tsx`, `frontend/packages/ui/src/app.css` (auth-card classes
  added), and any sprite mount the root layout needs.
- **Task 2 — Rebuild `/login`.** Replace `apps/candidate/app/login/page.tsx` (and the recruiter
  copy if still split per the v3 unification plan) so the route renders `<main class="auth"><AuthCard>…</AuthCard></main>`
  with the aperture mark, headline "Welcome back", sub "Sign in to continue.", email + password
  fields, "Forgot password?" link, "Sign in" primary CTA, the SSO group (gated), and the
  "Create an account" footer link. Wire the existing `useAuth().login` + `listOAuthProviders` +
  role-aware redirect verbatim. Commit explicit paths.
- **Task 3 — Notice + error + loading states.** Render the success-notice `<Alert>` when
  `?notice=account-created`. Render the error `<Alert>` from `errorMessage(err)` on RPC failure.
  Show the primary button in `loading` state ("Working…") during the mutation. Verify the SSO
  group renders nothing when `providers.length === 0`. Commit.
- **Task 4 — Verify + screenshot.** `--filter @ip/candidate build` + `tsc --noEmit` green. Run the
  dev server, navigate to `/login`, screenshot at 1440×900 and 390×844 in both themes. Side-by-side
  fidelity check against the auth-card spec in the design language doc and the hero crops of
  `D-aperture-pro-{light,dark}-hero.jpeg` (same type, same teal, same mark). Verify the role-aware
  redirect: candidate goes to `/`, recruiter/company goes to `/company`. Verify the
  `?notice=account-created` query renders the success `<Alert>`.

## States & a11y

- **States.** Initial form (email + password empty) · loading (`Button loading` → "Working…",
  inputs disabled) · error (`<Alert tone="danger">` above the form, focus moves to the alert) ·
  success (redirect by role; no flash of empty page) · `?notice=account-created` success notice ·
  SSO group empty (renders nothing) / populated (one button per provider). Field-level errors
  appear inline under the field with `aria-describedby` and `--danger` color; password reveal
  toggle is a button with `aria-pressed`.
- **Responsive.** Card is `max-width: 480px` from `>= 480px`. Below `480px`, the page padding
  collapses to `1rem` and the card fills the viewport width (still 22px radius). No split-panel
  to collapse — the layout is the same at every breakpoint.
- **Dark + light.** All colors via tokens (`--bg`, `--surface`, `--line`, `--ink-deep`, `--ink-2`,
  `--ink-3`, `--teal`, `--teal-strong`, `--teal-ink`, `--danger`, `--good`). Resolves cleanly in
  both themes; no hard-coded hex.
- **A11y.** One `<h1>`. `<header><main><footer>` landmarks; aperture mark is `aria-hidden` (label
  is the visible "Aptura" wordmark or the `aria-label` on the brand link if used). Form labels via
  `<Field>`; `aria-describedby` wires field errors. `:focus-visible` ring uses `--teal` 2px outline
  / 4px halo. Touch targets ≥44×44 (inputs 46px, buttons 46px). Body contrast ≥4.5:1
  (`--ink-2` on `--bg`). `Alert` regions are `role="alert"` so screen readers announce errors.
  Honors `prefers-reduced-motion` (button transitions reduce to 0ms).

## Acceptance

- Looks 1:1 like the auth-card primitive in
  [`_design-language.md`](../_design-language.md) — small, focused, centered card on `var(--bg)`,
  aperture mark + display headline + Hanken form + teal primary CTA. Side-by-side screenshot proof
  committed under `docs/brand/redesign-v3/verify/login-{light,dark}.jpeg`.
- `--filter @ip/candidate build` is green; `--filter @ip/company build` is green (or the unified
  package if the v3 unification has landed); `tsc --noEmit` is green; no console errors / warnings
  on the rendered page; reduced-motion is honored.
- **Zero functional diff** from today: `useAuth().login` and `listOAuthProviders` are called with
  the same shapes; the role-aware redirect lands candidates on `/` and recruiters on `/company`;
  the `?notice=account-created` notice still renders; SSO degrades silently when no providers.
- Pre-launch posture is enforced: no fake SSO partner logos (only providers the backend actually
  returns), no fake "2 million users" callouts, no fabricated trust badges. Only what's true.
- The signed-in route gating elsewhere (candidate dashboard / `useRequireAuth` redirect) is
  untouched.
