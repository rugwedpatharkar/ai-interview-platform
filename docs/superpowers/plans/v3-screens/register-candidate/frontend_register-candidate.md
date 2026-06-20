# Frontend — `register-candidate` (Midnight v3)

> **Screen:** Candidate sign-up · **Goal:** reskin the existing candidate register screen to the **Midnight** auth split-panel, reusing the register handler verbatim (presentational only).
> **Unified route + role:** `/register` · auth (signed-out). Post-register redirect → `/` (candidate home).
> **Mockup:** ✗ → **build in Task 0** as `docs/brand/redesign-v2/register-candidate.html` (auth split-panel: brand/value panel + form card).
> **Existing code it reskins:**
> - `frontend/apps/candidate/app/register/page.tsx` (wires `useAuth().register` into `CredentialsForm`)
> - `frontend/apps/candidate/components/credentials-form.tsx` (shared form body — **same component as `login`**)
> - `frontend/apps/candidate/components/auth-layout.tsx` + `auth-split-panel.tsx`

## Layout & components
- **Shell:** **auth split-panel** (`AuthLayout` two-pane). Identical structure to `login` — the candidate register page renders `CredentialsForm` with `action={register}`, labels "Create your account" / "Sign up", alt-link to `/login`. No SSO footer (none today).
- **Components:** all **reused** — `CredentialsForm`, `AuthLayout`, `AuthSplitPanel`, `Card`, `Field`, `Input`, `Button`, `Alert`, `Logo`. **No new component.** Because it shares `CredentialsForm`, the Midnight reskin from the `login` folder's Task 2 already covers the form card; this folder's work is the mockup + verifying the register flow under the new skin.

## Data wiring (kept identical to today)
- **Client/seam:** `useAuth().register` → `api.auth.registerCandidate({ email, password })`.
- **TanStack query keys:** none.
- **Consumes** (`backend_register-candidate.md`): `registerCandidate({ email, password })`; tokens+identity via `makeAuth`; then `router.push("/")`. **No field change.**

## Tasks (bite-sized; presentational only)
- [ ] **Task 0 — build the mockup.** Create `docs/brand/redesign-v2/register-candidate.html` against `tokens.css` + `app.css`: split-panel with the flat form card (company-free: email + password) left, Midnight brand panel right. Browser-verify `:4173` (dark + light). Commit the HTML.
- [ ] **Task 1 — confirm inherited reskin.** Because `/register` uses the **same `CredentialsForm`** reskinned in `login/frontend_login.md` Task 2, preview `/register` after that lands: form left, Midnight panel right; mobile collapse. **No edit expected.** If the page has its own residual wrapper, swap its ad-hoc colors → tokens only; commit explicit path.
- [ ] **Task 2 — verify the register flow.** Browser-verify a sign-up round-trip: submit → account created → `router.push("/")`. **No logic edit.** Commit only if a class-only tweak was required.

> **Restyle discipline:** do not touch `useAuth().register`, `onSubmit`, or `router.push`. Diff is markup/classes only.

## States & a11y
- **States (preserved):** **loading** (`Button loading` → "Working…"); **error** (`Alert tone="danger"`, `errorMessage`); **success** (redirect `/`). No new states.
- **Responsive:** `lg:grid-cols-2`; panel `hidden` below `lg`.
- **Dark + light:** tokens throughout; brand panel reads `--accent`.
- **A11y:** decorative rings `aria-hidden`; `Logo` link `aria-label`; form-first focus order; labels via `Field`; contrast ≥4.5:1.

## Acceptance
- Matches `register-candidate.html`; build/typecheck green; **zero functional diff** (register identical); mock→real path unchanged (already real `Auth.*`).
