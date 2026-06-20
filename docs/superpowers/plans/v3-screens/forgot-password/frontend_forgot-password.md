# Frontend — `forgot-password` (Midnight v3)

> **Screen:** Request password reset · **Goal:** reskin the existing forgot screen to the **Midnight** auth split-panel, reusing the request-reset handler verbatim (presentational only).
> **Unified route + role:** `/forgot` · auth (signed-out).
> **Mockup:** ✗ → **build in Task 0** as `docs/brand/redesign-v2/forgot-password.html` (auth split-panel: brand/value panel + single-email form card with neutral success state).
> **Existing code it reskins:**
> - `frontend/apps/candidate/app/forgot/page.tsx` (`forgotPassword({ email })` → neutral `sent` success / neutral error; "Back to login" links)
> - `frontend/apps/candidate/components/auth-layout.tsx` + `auth-split-panel.tsx`

## Layout & components
- **Shell:** **auth split-panel** (`AuthLayout` two-pane). Already wrapped today.
- **Form pane (flat):** `Card` → `CardHeader` ("Reset your password" / "We'll email you a reset link.") → either:
  - **form state:** `Field`+`Input` (email) → `Button` ("Send reset link") → "Back to login" link (`ArrowLeft`), or
  - **sent state:** `Alert tone="success"` (neutral "if an account exists…") + "Back to login".
- **Brand panel:** `AuthSplitPanel` (Midnight reskin shared with `login`).
- **Components:** all reused — `AuthLayout`, `AuthSplitPanel`, `Card`, `Field`, `Input`, `Button`, `Alert`, `Link`, `ArrowLeft`. **No new component.**

## Data wiring (kept identical to today)
- **Client/seam:** `useAuth().api.auth.forgotPassword({ email })`.
- **TanStack query keys:** none.
- **Consumes** (`backend_forgot-password.md`): `forgotPassword({ email })` → `setSent(true)` on resolve; neutral error otherwise. **No field change.**

## Tasks (bite-sized; presentational only)
- [ ] **Task 0 — build the mockup.** Create `docs/brand/redesign-v2/forgot-password.html`: split-panel, left flat card showing **both** the email-entry state and the neutral success `Alert`; right Midnight brand panel. Browser-verify `:4173` (dark + light). Commit the HTML.
- [ ] **Task 1 — reskin the form card.** Swap ad-hoc colors (`text-muted-foreground`, `text-primary`, etc.) → token classes to match the mockup, across **both** the `sent` and form branches. **Do not touch** `onSubmit`, `forgotPassword`, the neutral error string, or `setSent`. Build + browser-verify both states of `/forgot`; commit explicit path.

> **Restyle discipline:** the neutral-by-design success/error behavior is load-bearing (never leak account existence) — **do not** alter the copy logic. Diff is markup/classes only.

## States & a11y
- **States (preserved, named):** **form** (email entry); **loading** (`Button loading` → "Sending…"); **sent** (neutral `Alert tone="success"`); **error** (neutral `Alert tone="danger"`). No new states.
- **Responsive:** `lg:grid-cols-2`; panel `hidden` below `lg`.
- **Dark + light:** tokens throughout; brand panel reads `--accent`.
- **A11y:** `ArrowLeft` `aria-hidden`; labels via `Field`; form-first focus; neutral copy preserved; contrast ≥4.5:1.

## Acceptance
- Matches `forgot-password.html`; build/typecheck green; **zero functional diff** (request-reset + neutral states identical); mock→real path unchanged (already real `Auth.*`).
