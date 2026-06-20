# Frontend — `verify-email` (Midnight v3)

> **Screen:** Verify email · **Goal:** reskin the existing verify screen (token-from-URL + `VerifyCard` with resend) to the **Midnight** auth split-panel, reusing the verify/resend handlers verbatim (presentational only).
> **Unified route + role:** `/verify` · auth (signed-out). Token read from `?token=`.
> **Mockup:** ✗ → **build in Task 0** as `docs/brand/redesign-v2/verify-email.html` (auth split-panel: brand/value panel + verify-status card across its working/ok/error/invalid states).
> **Existing code it reskins:**
> - `frontend/apps/candidate/app/verify/page.tsx` (reads `?token=`; `verify({ token })` → status; `resendVerification({ email })`; wraps `VerifyCard` in `<AuthLayout selfFramed>`)
> - `frontend/packages/ui/src/verify-card.tsx` (`@ip/ui VerifyCard` + `VerifyStatus`)
> - `frontend/apps/candidate/components/auth-layout.tsx` + `auth-split-panel.tsx`

## Layout & components
- **Shell:** **auth split-panel** (`AuthLayout`). Note the page uses `<AuthLayout selfFramed>` — `VerifyCard` brings its own frame, so the layout doesn't re-add the form `max-w-md` centering. Preserve `selfFramed`.
- **Form pane:** `@ip/ui VerifyCard` — status-driven (`working` spinner / `ok` success + continue `/` / `error` message + resend / `invalid` missing-token). Reskin `VerifyCard`'s ad-hoc colors → Midnight tokens.
- **Brand panel:** `AuthSplitPanel` (Midnight reskin shared with `login`).
- **Components:** all reused — `AuthLayout`, `AuthSplitPanel`, `VerifyCard`. **No new component.**

## Data wiring (kept identical to today)
- **Client/seam:** `useAuth().api.auth.verify({ token })`; `api.auth.resendVerification({ email })` (passed as `onResend` to `VerifyCard`).
- **TanStack query keys:** none (one-shot `useEffect` with a `called` ref guard).
- **Consumes** (`backend_verify-email.md`): `verify`, `resendVerification`; `continueHref="/"`. **No field change.**

## Tasks (bite-sized; presentational only)
- [ ] **Task 0 — build the mockup.** Create `docs/brand/redesign-v2/verify-email.html`: split-panel, left a self-framed verify card showing the **four** states (working/ok/error/invalid, e.g. stacked variants), right Midnight brand panel. Browser-verify `:4173` (dark + light). Commit the HTML.
- [ ] **Task 1 — reskin `VerifyCard`.** In `packages/ui/src/verify-card.tsx`, swap ad-hoc colors → Midnight token classes/vars across all four `VerifyStatus` branches; keep the resend input/handler + `continueHref` wiring verbatim. `@ip/ui` typecheck + (if present) the existing `VerifyCard` test stays green. Build + browser-verify; commit explicit path.
- [ ] **Task 2 — reskin/confirm the page frame.** Confirm `<AuthLayout selfFramed>` + the reskinned panel render correctly; swap any residual ad-hoc color on the page → tokens. **Do not touch** the `useEffect` token read, the `called` ref, `verify`, or `resendVerification`. Build + browser-verify `/verify?token=…` and `/verify` (no token); commit.

> **Restyle discipline:** the `called` ref-guard, the status state machine, and the resend handler are out of scope to edit. Diff is markup/classes only. (`selfFramed` must stay so the card isn't double-framed.)

## States & a11y
- **States (preserved, named):** **working** (spinner); **ok** (success + continue `/`); **error** (message + resend); **invalid** (missing token). No new states.
- **Responsive:** `lg:grid-cols-2`; panel `hidden` below `lg`.
- **Dark + light:** tokens throughout (`VerifyCard` + panel); brand panel reads `--accent`.
- **A11y:** decorative rings `aria-hidden`; spinner has an accessible label; resend field labeled; form-first focus; contrast ≥4.5:1.

## Acceptance
- Matches `verify-email.html`; `@ip/ui` + `@ip/candidate` build/typecheck green; **zero functional diff** (verify + resend + all four states identical); mock→real path unchanged (already real `Auth.*`).
