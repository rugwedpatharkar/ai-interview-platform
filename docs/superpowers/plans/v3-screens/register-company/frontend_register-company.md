# Company sign-up — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Public, token-free **company sign-up surface** for recruiters / hiring teams. Rebuild the existing
standalone register form as the centered **auth-card** primitive — same shape as `/login`, with
three fields (company name, work email, password) and a live password-strength meter. The
`registerCompany` → auto-`login` → `/jobs` chain (with the `/login?notice=account-created`
verify-gate fallback) is preserved verbatim.

## Route + role

`/company/register` · **public** (signed-out, pre-token).

Post-register happy path: `registerCompany` resolves → auto-`login(email, password)` resolves →
`toast.success("Company created — check your email to verify.")` + `router.push("/jobs")`.

Post-register verify-gate fallback: `registerCompany` resolves → auto-`login` throws (server requires
email verification before issuing a session) → caught → `router.push("/login?notice=account-created")`
(the success notice renders on `/login` per its plan).

## Approved mockup (build to this exactly)

- **Design language (canonical):** [`../_design-language.md`](../_design-language.md) — see the
  **auth-card primitive** (centered card on `var(--bg)`, ≤ 480px, aperture mark + display headline
  + Hanken form + teal CTA). This screen uses the same primitive as `/login` and `/register`, with
  three fields instead of two and a recruiter-facing headline + sub.
- **Reference demo (for tokens, type, motion, mark):**
  [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
- **Screenshots for token / theme proof:**
  `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-{light,dark}-hero.jpeg`.

No per-screen mockup file. Build to the auth-card primitive; verify against the design language doc
and the `/login` rebuild.

## Existing code being REPLACED (not modified)

Delete-and-rebuild scope:

- `frontend/apps/company/app/register/page.tsx` — current standalone `<form noValidate>` with the
  three fields + `<AuthLayout>` + `<AuthSplitPanel>` shell
- `frontend/apps/company/components/auth-layout.tsx` — recruiter-app v2 two-pane shell (deleted)
- `frontend/apps/company/components/auth-split-panel.tsx` — recruiter-app v2 brand panel (deleted)
- `frontend/apps/company/components/credentials-form.tsx` — recruiter-app shared form body
  (deleted in favor of the `@ip/ui` auth-card primitive)

Preserved logic surfaces (out-of-scope to edit):

- `useAuth().api.auth.registerCompany({ companyName, email, password })` — direct call (no
  `register` config on the company `makeAuth`, since the company form needs `companyName`)
- `useAuth().login(email, password)` — auto-login after `registerCompany`
- The post-success `toast.success(...)` + `router.push("/jobs")` happy path
- The verify-gate fallback `catch` → `router.push("/login?notice=account-created")`
- `noValidate` on the `<form>` (server is the source of truth for validation)
- The `busy` flag / early-return error handling

## Layout & components

Reuse the `@ip/ui` auth-card primitive from `/login` (Task 1 there). The password-strength meter
primitive from `/register` (Task 1 there) is reused too.

| Region | Component | Tokens / primitives |
|---|---|---|
| Page surface | `<main class="auth">` | Identical to `/login`. |
| Card | `<AuthCard>` | Identical to `/login`. |
| Brand mark | `<LogoMark>` (aperture sprite) | Identical. |
| Headline | `<h1 class="display">Create your company</h1>` | Schibsted Grotesk, `var(--step-3)`, `text-wrap: balance`. |
| Sub | `<p>Set up your recruiter account and post your first verified-interview role.</p>` | Hanken Grotesk, `var(--step-0)`, `color: var(--ink-2)`. **Truthful** — no fake "trusted by 500+ teams" framing. |
| Form | `<form noValidate>` | `display: grid; gap: 1rem`. `noValidate` preserved — server validates. |
| Company name field | `<Field>` + `<Input name="companyName" autocomplete="organization" required>` | Inline format help: "The legal or trading name your candidates will see." |
| Email field | `<Field>` + `<Input type="email" name="email" autocomplete="email" required>` | Inline help: "Use a work address — we use this domain to verify your team." |
| Password field | `<Field>` + `<Input type="password" name="password" autocomplete="new-password" minLength={8} required>` with reveal toggle | Min-length 8 client + server. |
| Strength meter | `<PasswordStrengthMeter value={password} />` | Same primitive as `/register`. |
| Primary CTA | `<Button class="btn btn-primary">Create company</Button>` | `loading` → "Working…"; disabled while `busy`. |
| Error | `<Alert tone="danger">` | RPC error via `errorMessage(err)`; cleared on next submit. |
| Terms note | `<p class="terms">By continuing you agree to the <Link href="/legal/terms">Terms</Link> and <Link href="/legal/privacy">Privacy</Link>.</p>` | `var(--step--1)`, `color: var(--ink-3)`. |
| Footer link | `<p>Already have an account? <Link href="/login">Sign in</Link></p>` | `var(--step--1)`, `color: var(--ink-3)` with link in `--teal-strong`. |

## Data wiring / seam

- **Client/seam:** `useAuth().api.auth.registerCompany({ companyName, email, password })` →
  `useAuth().login(email, password)`. Tokens + identity (role `recruiter`/`company`, `tenantId`)
  are stored inside `makeAuth`; the page reacts to `useAuth()` state.
- **Happy path:** on `login` resolve → `toast.success("Company created — check your email to
  verify.")` + `router.push("/jobs")`.
- **Verify-gate fallback:** if `login` throws (server requires verification before issuing a
  session), `catch` → `router.push("/login?notice=account-created")`. The notice renders on
  `/login` per its plan.
- **TanStack query keys:** none (two sequential mutations).
- **Backend:** see [`backend_register-company.md`](./backend_register-company.md) — no proto delta,
  no new RPC.

## Tasks (TDD-style, build → screenshot-verify → commit per task)

> **Task 0 — design language is the mockup.** No per-screen HTML mockup. Build to the auth-card
> primitive + reuse the `<PasswordStrengthMeter>` shipped by `/register`.

- **Task 1 — Rebuild `/company/register`.** Replace `apps/company/app/register/page.tsx` so the
  route renders `<main class="auth"><AuthCard>…</AuthCard></main>` with the aperture mark,
  headline "Create your company", sub, three fields (company name, work email, password), the
  strength meter, the "Create company" primary CTA, the terms note, and the "Sign in" footer link.
  Wire `registerCompany` → `login` → `router.push("/jobs")` verbatim; keep the `noValidate` on the
  form. Commit explicit paths.
- **Task 2 — Verify-gate fallback wiring.** Implement the `catch` on the auto-`login` that routes
  to `/login?notice=account-created`. Verify: a 200 from `registerCompany` followed by an error
  from `login` lands the user on `/login` with the success notice visible. Verify: a 200 followed
  by a 200 lands on `/jobs` with the toast visible. Commit.
- **Task 3 — Error + loading states + field validation.** Render the RPC error `<Alert>` from
  `errorMessage(err)` for `INVALID_ARGUMENT`, duplicate company, weak password, and `UNAVAILABLE`.
  Show the primary button in `loading` state during the mutation chain; set `busy=false` and early
  return on `registerCompany` error (no auto-login attempt). Verify submit is disabled until all
  three fields pass `required` + `minLength={8}` on the password. Commit.
- **Task 4 — Verify + screenshot.** `--filter @ip/company build` + `tsc --noEmit` green. Run the
  dev server, navigate to `/company/register`, screenshot at 1440×900 and 390×844 in both themes.
  Side-by-side fidelity check against the `/login` rebuild — same card, same mark, same type, same
  teal CTA. Verify the happy path and the verify-gate fallback both work end-to-end.

## States & a11y

- **States.** Initial (all fields empty, submit disabled) · typing (strength meter live) · loading
  (`Button loading` → "Working…", inputs disabled, `busy=true`) · error (`<Alert tone="danger">`
  above the form, `busy=false`, early return — no auto-login attempt) · happy success (toast +
  `/jobs`) · verify-gate fallback (`/login?notice=account-created`). Field-level: company-name
  empty inline; email format inline; password too-short inline; weak-password warning inline
  (advisory only).
- **Responsive.** Card is `max-width: 480px` from `>= 480px`. Below `480px`, page padding collapses
  to `1rem` and the card fills the viewport. No split-panel to collapse.
- **Dark + light.** All colors via tokens. Resolves cleanly in both themes; no hard-coded hex.
- **A11y.** One `<h1>`. Form labels via `<Field>`; `aria-describedby` wires field-level help and
  errors. Password reveal is a `<Button aria-pressed>`. `:focus-visible` ring uses `--teal` 2px /
  4px halo. Touch targets ≥44×44. Body contrast ≥4.5:1. `Alert` is `role="alert"`. Strength meter
  is announced via `aria-live="polite"`. `noValidate` preserved (server is the validator). Honors
  `prefers-reduced-motion`.

## Acceptance

- Looks 1:1 like the auth-card primitive in [`_design-language.md`](../_design-language.md) — the
  same card geometry as `/login`, with three fields and the strength meter. Side-by-side
  screenshot proof committed under
  `docs/brand/redesign-v3/verify/register-company-{light,dark}.jpeg`.
- `--filter @ip/company build` is green; `tsc --noEmit` is green; no console errors / warnings on
  the rendered page; reduced-motion is honored.
- **Zero functional diff** from today: `registerCompany({ companyName, email, password })` →
  auto-`login(email, password)` is called with the same shapes; happy path lands on `/jobs` with
  the toast; verify-gate fallback lands on `/login?notice=account-created` with the notice; error
  branches render the `<Alert>` and leave the form populated.
- Pre-launch posture is enforced: no fake customer counts, no fabricated social proof, no claimed
  ATS integrations. Only what's true.
- The role claim minted by `registerCompany` (`recruiter` / `company` + `tenantId`) still drives
  the post-login shell routing — the existing role-gating logic is untouched.
