# Frontend — `register-company` (Midnight v3)

> **Screen:** Company sign-up · **Goal:** reskin the existing **standalone** company register screen (it carries a `companyName` field + its own `registerCompany`→`login` flow) to the **Midnight** auth split-panel — reusing the handler verbatim (presentational only).
> **Unified route + role:** `/company/register` · auth (signed-out). Post-register: auto-login → `/jobs`, or `/login?notice=account-created` on the verify-gate fallback.
> **Mockup:** ✗ → **build in Task 0** as `docs/brand/redesign-v2/register-company.html` (auth split-panel: brand/value panel + 3-field form card — company name, work email, password).
> **Existing code it reskins:**
> - `frontend/apps/company/app/register/page.tsx` (standalone form: `companyName`/`email`/`password`, `registerCompany`→`login`→`router.push("/jobs")`, `catch`→`/login?notice=account-created`, `noValidate`)
> - `frontend/apps/company/components/auth-layout.tsx` + `auth-split-panel.tsx` (company-app copies of the shared shell/panel)

## Layout & components
- **Shell:** **auth split-panel** (`AuthLayout` two-pane). This page is **not** `CredentialsForm` — it's a standalone `<form noValidate>` (needs `companyName`). Already wrapped in `<AuthLayout>` today.
- **Form pane (flat):** `Card` → `CardHeader` ("Create your company" / "Set up your recruiter account.") → 3 `Field`+`Input` (company name, work email, password) → `Button` ("Create company") → alt-link "Already have an account? Log in" → `/login`.
- **Brand panel:** company-app `AuthSplitPanel` — reskin to Midnight tokens (recruiter-facing value copy preserved as-is).
- **Components:** all reused — `AuthLayout`, `AuthSplitPanel`, `Card`, `Field`, `Input`, `Button`, `Alert`. **No new component.**

## Data wiring (kept identical to today)
- **Client/seam:** `useAuth().api.auth.registerCompany({ companyName, email, password })` then `useAuth().login(email, password)`.
- **TanStack query keys:** none.
- **Consumes** (`backend_register-company.md`): `registerCompany` + `login`; on success `toast.success(...)` + `router.push("/jobs")`; on auto-login failure `router.push("/login?notice=account-created")`. **No field change.**

## Tasks (bite-sized; presentational only)
- [ ] **Task 0 — build the mockup.** Create `docs/brand/redesign-v2/register-company.html` against `tokens.css` + `app.css`: split-panel, left flat card with **three** fields (company name, work email, password), right Midnight brand panel (recruiter framing). Browser-verify `:4173` (dark + light). Commit the HTML.
- [ ] **Task 1 — reskin the company `AuthSplitPanel`.** Swap hardcoded gradient/`text-white` → Midnight tokens (`--accent`/`--accent-strong`, `--accent-ink`/`--accent-soft`). Keep copy + `aria-hidden` rings verbatim. Build (`@ip/company`) + browser-verify; commit explicit path.
- [ ] **Task 2 — reskin the form card.** In `apps/company/app/register/page.tsx`, swap ad-hoc colors (`text-muted-foreground`, etc.) → token classes to match the mockup. **Do not touch** `onSubmit`, the `registerCompany`→`login` sequence, the `catch`→`/login?notice=account-created` fallback, `noValidate`, or any `router.push`. Build + browser-verify `/company/register`; commit.
- [ ] **Task 3 — verify the flow.** Browser-verify: submit valid → company created → `/jobs` (or notice fallback). **No logic edit.** Commit only if a class-only tweak was needed.

> **Restyle discipline:** the `registerCompany`→`login`→route chain is out of scope to edit. Diff is markup/classes only.

## States & a11y
- **States (preserved):** **loading** (`Button loading` → "Create company"); **error** (`Alert tone="danger"`, `errorMessage`, `busy=false`, early return); **success happy path** (`toast.success` + `/jobs`); **verify-gate fallback** (`/login?notice=account-created`). No new states.
- **Responsive:** `lg:grid-cols-2`; panel `hidden` below `lg`.
- **Dark + light:** tokens throughout; brand panel reads `--accent` after Task 1.
- **A11y:** decorative rings `aria-hidden`; labels via `Field`; form-first focus; `noValidate` preserved (server is the validator); contrast ≥4.5:1.

## Acceptance
- Matches `register-company.html`; `@ip/company` build/typecheck green; **zero functional diff** (registerCompany→login→route + fallback identical); mock→real path unchanged (already real `Auth.*`).
