# Frontend — `login` (Midnight v3)

> **Screen:** Sign in · **Goal:** reskin the existing login screen to the **Midnight Intelligence** auth split-panel — flat form card on the left, brand/value panel on the right — **reusing every auth handler verbatim** (presentational only, zero behavior change).
> **Unified route + role:** `/login` · auth (signed-out). Role-aware post-login redirect: candidate → `/`, recruiter/company → `/company`.
> **Mockup:** ✗ → **build in Task 0** as `docs/brand/redesign-v2/login.html` (centered auth split-panel: brand/value panel + form card).
> **Existing code it reskins:**
> - `frontend/apps/candidate/app/login/page.tsx` (wires `useAuth().login` into `CredentialsForm` + `SsoButtons` footer)
> - `frontend/apps/candidate/components/credentials-form.tsx` (the form body + `onSubmit`/`router.push("/")`)
> - `frontend/apps/candidate/components/sso-buttons.tsx` (gated SSO via `listOAuthProviders`)
> - `frontend/apps/candidate/components/auth-split-panel.tsx` (current brand panel — reskinned to Midnight)
> - `frontend/apps/candidate/components/auth-layout.tsx` (the two-pane shell)

## Layout & components
- **Shell:** **auth split-panel** (not the `.app` sidebar shell). `AuthLayout` = two-pane grid (`lg:grid-cols-2`): form pane left, `AuthSplitPanel` right; panel `hidden` below `lg` (form fills viewport).
- **Form pane (flat):** `Logo` link → `Card` (`--surface`/`--line`/`--r-lg`) → `CardHeader` ("Welcome back" + description) → `<form>` with `Field`+`Input` (email/password, `.input` token styling), `forgotHref` link, `Button` (`.btn-primary`, `--accent`), alt-link to `/register`, `SsoButtons` footer.
- **Brand panel:** `AuthSplitPanel` reskinned to the Midnight gradient (deep indigo→electric-cyan accent surface, white/`--accent-soft` ink), aperture `LogoMark`, tagline "Get seen. Get interviewed. Get hired.", proctored/fair/merit value line + bullets, decorative `aria-hidden` rings.
- **New vs reused:** **no new components** — `AuthLayout`, `AuthSplitPanel`, `CredentialsForm`, `SsoButtons`, `Logo`/`LogoMark`, `Card`, `Field`, `Input`, `Button`, `Alert` all reused; only their token classes/markup change to match the Midnight mockup.

## Data wiring (kept identical to today)
- **Client/seam:** `useAuth()` → `login` (→ `AuthService.Login`); `useAuth().api.auth.listOAuthProviders({})` inside `SsoButtons`.
- **TanStack query keys:** none (no data fetch beyond the one-shot providers `useEffect`).
- **Consumes** (`backend_login.md`): `login(email, password)` (tokens+identity via `makeAuth`), `{ providers: string[] }`. **No field added or removed.**

## Tasks (bite-sized; presentational only)
- [ ] **Task 0 — build the mockup.** Create `docs/brand/redesign-v2/login.html` against `tokens.css` + `app.css`: a centered split-panel (left flat form card, right Midnight gradient brand panel with aperture + tagline + value bullets). Browser-verify on the `:4173` preview (dark **and** light). Commit `docs/brand/redesign-v2/login.html`.
- [ ] **Task 1 — reskin `AuthSplitPanel`.** Swap the hardcoded `bg-[linear-gradient(135deg,#7c3aed,#4f46e5)]`/`text-white` for Midnight tokens (`--accent`/`--accent-strong` gradient, `--accent-ink`/`--accent-soft` text) so the panel themes correctly. Keep the tagline/bullets/`aria-hidden` rings **verbatim**. Build + browser-verify; commit explicit path.
- [ ] **Task 2 — reskin the form card.** In `credentials-form.tsx`, swap ad-hoc Tailwind colors (`text-muted-foreground`, `bg-border`, etc.) → token component classes/vars to match the mockup. **Do not touch** `useState`/`onSubmit`/`action`/`router.push("/")`/the `forgotHref`/alt-link wiring. Build + browser-verify `/login`; commit.
- [ ] **Task 3 — verify role-aware redirect is untouched.** Confirm the post-login redirect still routes by role (candidate `/`, recruiter `/company`) exactly as today — **no logic edit**, just confirm the reskin didn't alter the `router.push` path. Browser-verify a login round-trip; commit if any class-only change was needed.

> **Restyle discipline:** the diff per file is markup/classes only. If a task touches a handler, `useMutation`, `router.push`, or an RPC call — **stop**, it's out of scope.

## States & a11y
- **States (preserved, named):** **loading** (`Button loading` → "Working…"); **error** (`Alert tone="danger"` with `errorMessage(err)`); **success** (redirect by role); **SsoButtons empty** (no providers → renders nothing) / **populated** (provider buttons).
- **Responsive:** `lg:grid-cols-2` desktop (form + panel); below `lg` panel `hidden`, form centered `max-w-md` (matches today).
- **Dark + light:** form pane all tokens (auto-themes); brand panel reads `--accent`/`--accent-soft` (no hardcoded hex after Task 1).
- **A11y:** decorative rings/aperture `aria-hidden`; `Logo` link keeps `aria-label`; focus order form-first (panel is `<aside>`); focus ring `--accent-strong`; labels via `Field`; contrast ≥4.5:1.

## Acceptance
- Matches `login.html`; build/typecheck green; **zero functional diff** (login + role redirect + SSO identical to today); mock→real path unchanged (the page already calls real `Auth.*`).
