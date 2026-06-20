# Frontend — `auth-callback` (Midnight v3)

> **Screen:** SSO callback (branded spinner) · **Goal:** reskin the existing minimal SSO-callback screen to the **Midnight** look — a centered, branded spinner that reads the hash token → validates the JWT → role-routes. **No split-panel form** (this is a transient interstitial, not a form). Presentational only, zero behavior change.
> **Unified route + role:** `/auth/callback` · auth (signed-out → becoming signed-in). On valid token → `router.replace("/")` (role-aware home).
> **Mockup:** ✗ → **Task 0 is just a spinner state** (no full split-panel) — a small `redesign-v2/auth-callback.html` showing the centered branded "Signing you in…" card + the error fallback, on the Midnight surface.
> **Existing code it reskins:**
> - `frontend/apps/candidate/app/auth/callback/page.tsx` (hash parse, `isValidJwt`, `store.set`, `router.replace("/")`, `RESOLVE_TIMEOUT_MS`, error/back-to-login fallback)

## Layout & components
- **Shell:** **centered interstitial** (not the split-panel, not the `.app` shell) — a single centered `Card` on the Midnight `--bg`. Today: `<main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">` → `Card` → `Spinner` + "Signing you in…", with an error branch (`Alert tone="danger"` + back-to-login).
- **Components:** all reused — `Card`, `CardHeader`, `CardTitle`, `CardContent`, `Spinner`, `Alert`, `Link`, `ArrowRight`. Optionally add the aperture `LogoMark` above the spinner for brand consistency (decorative, `aria-hidden`). **No new component.**

## Data wiring (kept identical to today)
- **Client/seam:** `store.set({ access, refresh: "" })`; `router.replace("/")`. **No RPC** (see `backend_auth-callback.md`).
- **TanStack query keys:** none.
- **Consumes:** the hash `#access_token` / `#error`; `isValidJwt` client validation; `RESOLVE_TIMEOUT_MS`. **No field change.**

## Tasks (bite-sized; presentational only)
- [ ] **Task 0 — build the spinner mockup.** Create `docs/brand/redesign-v2/auth-callback.html` against `tokens.css` + `app.css`: a centered branded card on `--bg` with an aperture `LogoMark` + spinner + "Signing you in…", plus the error-fallback variant (`Alert` + back-to-login). **No split-panel** — this is a transient state. Browser-verify `:4173` (dark + light). Commit the HTML.
- [ ] **Task 1 — reskin the callback card.** In `apps/candidate/app/auth/callback/page.tsx`, swap ad-hoc colors (`text-muted-foreground`, `text-primary`) → Midnight token classes to match the mockup; optionally add the `aria-hidden` `LogoMark`. **Do not touch** the `useEffect`, `isValidJwt`, `store.set`, `router.replace("/")`, the `RESOLVE_TIMEOUT_MS` timer, or any error-string logic. Build + browser-verify `/auth/callback` (success spinner) and the `#error=…` fallback; commit explicit path.

> **Restyle discipline:** the hash parse, JWT validation, store seed, redirect, and timeout are **all** out of scope to edit — this page's security logic is load-bearing. Diff is markup/classes only.

## States & a11y
- **States (preserved, named):** **spinning** (`Spinner` + "Signing you in…", default); **error** (`#error` / no token / invalid JWT / timeout → `Alert tone="danger"` + back-to-login). No new states.
- **Responsive:** single centered card; fluid `max-w-md`, fine on mobile (no split-panel to collapse).
- **Dark + light:** tokens throughout (`Card`, `Alert`, `Spinner` read vars).
- **A11y:** `Spinner` has an accessible label; `ArrowRight`/`LogoMark` `aria-hidden`; error link keeps focus order; contrast ≥4.5:1.

## Acceptance
- Matches `auth-callback.html`; build/typecheck green; **zero functional diff** (hash→JWT validate→store→role-route + timeout + all error branches identical); mock→real path unchanged (no RPC — pure client).
