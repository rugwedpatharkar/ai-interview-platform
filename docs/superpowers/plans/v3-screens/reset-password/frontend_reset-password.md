# Frontend — `reset-password` (Midnight v3)

> **Screen:** Complete password reset · **Goal:** reskin the existing reset screen to the **Midnight** auth split-panel, reusing the complete-reset handler verbatim (presentational only).
> **Unified route + role:** `/reset` · auth (signed-out). Token read from `?token=`.
> **Mockup:** ✗ → **build in Task 0** as `docs/brand/redesign-v2/reset-password.html` (auth split-panel: brand/value panel + new-password form card **plus** the invalid-link state).
> **Existing code it reskins:**
> - `frontend/apps/candidate/app/reset/page.tsx` (reads `?token=`; `resetPassword({ token, newPassword })` → `/login`; invalid-link branch → `/forgot`)
> - `frontend/apps/candidate/components/auth-layout.tsx` + `auth-split-panel.tsx`

## Layout & components
- **Shell:** **auth split-panel** (`AuthLayout` two-pane). Already wrapped today.
- **Form pane (flat):** `Card` → `CardHeader` ("Choose a new password") → either:
  - **valid-token state:** `Field`+`Input` (new password, `minLength={8}`) → `Button` ("Update password", `disabled` while `resetToken===null`), or
  - **invalid-link state** (`resetToken===""`): `Alert tone="danger"` "Invalid or expired link" + "Request a new link" → `/forgot`.
- **Brand panel:** `AuthSplitPanel` (Midnight reskin shared with `login`).
- **Components:** all reused — `AuthLayout`, `AuthSplitPanel`, `Card`, `Field`, `Input`, `Button`, `Alert`, `Link`, `ArrowLeft`. **No new component.**

## Data wiring (kept identical to today)
- **Client/seam:** `useAuth().api.auth.resetPassword({ token, newPassword })`; token via `URLSearchParams(window.location.search).get("token")`.
- **TanStack query keys:** none.
- **Consumes** (`backend_reset-password.md`): `resetPassword({ token, newPassword })` → `router.push("/login")`. **No field change.**

## Tasks (bite-sized; presentational only)
- [ ] **Task 0 — build the mockup.** Create `docs/brand/redesign-v2/reset-password.html`: split-panel, left flat card showing **both** the new-password form and the invalid-link `Alert` state; right Midnight brand panel. Browser-verify `:4173` (dark + light). Commit the HTML.
- [ ] **Task 1 — reskin the form card.** Swap ad-hoc colors → token classes across **both** branches (valid-token form + invalid-link). **Do not touch** the `useEffect` token read, `onSubmit`, `resetPassword`, the `disabled={resetToken === null}` guard, or `router.push("/login")`. Build + browser-verify `/reset?token=…` and `/reset` (no token); commit explicit path.

> **Restyle discipline:** the `resetToken` null/`""`/value state machine is load-bearing — **do not** alter it. Diff is markup/classes only.

## States & a11y
- **States (preserved, named):** **reading** (`resetToken===null` → submit `disabled`); **valid-token form**; **loading** (`Button loading` → "Updating…"); **invalid-link** (`resetToken===""` → `Alert` + `/forgot`); **error** (`Alert tone="danger"`, `errorMessage`); **success** (→ `/login`). No new states.
- **Responsive:** `lg:grid-cols-2`; panel `hidden` below `lg`.
- **Dark + light:** tokens throughout; brand panel reads `--accent`.
- **A11y:** `ArrowLeft` `aria-hidden`; labels via `Field`; form-first focus; disabled-submit during URL read; contrast ≥4.5:1.

## Acceptance
- Matches `reset-password.html`; build/typecheck green; **zero functional diff** (complete-reset + invalid-link branch identical); mock→real path unchanged (already real `Auth.*`).
