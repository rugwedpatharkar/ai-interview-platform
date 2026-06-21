# Autonomous Test & Fix — Master Issue List (2026-06-21)

Branch `main` (Aperture Pro v3 merged: backend + FE on `cde4404`). Full BE+FE run,
every page/functionality tested (static gates + live runtime + 3 deep code audits).
Severity: **P0** broken/UX-breaking · **P1** major · **P2** minor · **P3** polish.

## Verification baseline — ALL GREEN
- Backend gate (`scripts/check.sh`): PASS (5 suites + ruff + pip-audit).
- FE typecheck 6/6, FE build 3/3 (every candidate + company page compiles).
- All ~50 routes SSR without 500/crash (fetch sweep). Public pages render real v3 content.
- Live FE↔BE authed integration WORKS (registered + logged-in candidate; dashboard/RPCs OK, no console errors).

---

## P0
- **[P0] Dual, conflicting theme systems** — `@ip/ui` `ThemeProvider`/`ThemeToggle` write localStorage
  key `"theme"`, but the app's pre-paint script is `appearanceScript` (key `aptura.appearance.v1`).
  Toggling theme is **silently dropped on reload**. `ThemeToggle` is live in candidate-shell, company-shell,
  marketing-nav, and all 3 interview pages. Unify on one key + one pre-paint script.
  Files: `packages/ui/src/theme.tsx`, `apps/candidate/app/settings/appearance-client.ts`, the shells.

## P1
- **[P1·BE] register input validation uncaught** — `src/admin/app/resources/auth.py:83` constructs `User(...)`
  which raises pydantic `ValidationError` on bad email/field → propagates unhandled → grpcweb INTERNAL
  instead of clean `INVALID_ARGUMENT`. User-input boundary must catch + convert. Repro: register `x@aptura.test`.
  Likely same in `register_company`.
- **[P1·FE] company onboarding persists nothing** — `apps/candidate/app/company/onboarding/page.tsx:343`
  "Finish setup" only `clearState()`+`router.push`; no RPC. Profile + first-role + team invites
  (copy :122-127 promises "Invitations are sent when you save") all discarded. Wire RPCs OR fix copy.
- **[P1·FE] `/cookies` 404 site-wide** — `packages/ui/src/aperture-chrome.tsx:374` `DEFAULT_LEGAL` links
  `/cookies`; no `app/cookies/page.tsx`. Footer ships on every marketing+legal page. Create page or drop link.
- **[P1·FE·SEO] homepage, `/pilot`, `/waitlist` have no `metadata`** → generic root `<title>`. All 3 are
  client components with no server wrapper. Split into server `page.tsx` (exports metadata) + client child.
- **[P1·FE·a11y] `Field` doesn't associate label↔input** — `packages/ui/src/field.tsx` generates `useId`
  but never sets the child input `id`/`htmlFor`. Standard form wrapper ships unlabelled inputs (auth screens
  use a different, correct local Field; this bites settings + in-app forms).
- **[P1·FE·a11y] mega-menu keyboard-inaccessible** — `aperture-chrome.tsx:263-301` trigger `<button>` has no
  onClick/`aria-expanded`/`aria-controls`; panel is hover/focus-within only; no Escape. Make a real disclosure.
- **[P1·FE] legacy `apps/company` no-op + dead mock** — `app/dashboard.tsx:147-152` Advance/Reject have no
  onClick; `app/branding/page.tsx:48` hardcodes `makeMockBrandingClient()` (never persists). Fully duplicated
  by unified `/company/*` and drifting → **recommend deprecating `apps/company`**.

## P2
- **[P2·FE] register error mapping** — `apps/candidate/app/register/page.tsx` maps all errors to "Something
  went wrong." Surface INVALID_ARGUMENT message / ALREADY_EXISTS. (Pairs with the BE fix.)
- **[P2·FE] dashboard greeting shows raw user id** — `components/dashboard.tsx` "Welcome back, <ObjectId>." +
  avatar from id when name empty (new users). Fall back to email local-part / "there".
- **[P2·FE] dashboard "Interviews scheduled" mislabeled** — `dashboard.tsx:216` counts available-to-start.
- **[P2·FE] dashboard avg-response tile dead** — `dashboard.tsx:129-136` always null (no timestamps).
- **[P2·FE] Settings nav hop** — `components/candidate-shell.tsx:63` → `/account` redirects to `/settings`;
  nav highlight never matches. Point straight at `/settings`.
- **[P2·FE] applicant hold/reject toast-only** — `company/jobs/[id]/applicants/[appId]/page.tsx:162-181`
  promises notification, sends none.
- **[P2·FE] schedule getIcs unguarded await** — `…/applicants/[appId]/schedule/page.tsx:134-141` no try/catch.
- **[P2·FE] Input/Textarea no forwardRef** — `packages/ui/src/{input,textarea}.tsx` (blocks RHF/focus-on-error).
- **[P2·FE] notification-item `Date.now()` during render** — `packages/ui/src/notification-item.tsx:23,58`
  → SSR/client hydration mismatch.
- **[P2·FE] tokens cross-tab not propagated** — `packages/shared/src/tokens.ts` no `storage` listener.
- **[P2·FE] transport cookie-refresh no timeout** — `packages/shared/src/transport.ts:48-51` raw fetch can hang.
- **[P2·FE] login/callback redirect race + premature timeout** — `login/page.tsx:52-69`, `auth/callback:76-80`.
- **[P2·FE] ~13 `lucide-react` value-imports in `@ip/ui`** (violates lucide-in-app rule).
- **[P2·FE] company audit/billing mock-only**, **company settings off-brand tokens**, **jobs/new drops skills**.

## P3 (polish backlog)
- verify `continueHref` dead ternary; `global-error.tsx` stale `#7c5cff` accent; multiple unlabelled `<nav>`;
  standalone-page `<h1>` (verify-card/card start at h2); 2FA enabled-state local-only; stale ProctorAccepted
  cast; redundant invalidateQueries; analytics `enabled:` parity; onboarding/profile missing useRequireRole.

## Investigated — NOT bugs
- preview_click not firing React submit = tool quirk (`requestSubmit()` works).
- Login does not require email verification (`auth.py:157-202`) — flagged as product observation.
- `@aptura.test` rejected = correct (reserved TLD); test-data error.
- Dashboard "empty space" screenshot = scroll artifact; shell layout (sticky header + h-screen aside) is correct.
- Integration core (transport/tokens/auth/api-client quad) audited SOLID; no imported-but-unexported service.

## Fixed (committed + pushed to origin/main)
- **[P1·BE] register email validation** → `d4f0271`. `User(...)` ValidationError now caught at the
  registration boundary (`_build_user`) → INVALID_ARGUMENT (was INTERNAL). TDD: 2 tests. Full gate green.
- **[P0] dual theme system** → `0bbd6fe`. Candidate header toggle now drives the appearance system
  (`aptura.appearance.v1`, the injected pre-paint key) via a new `AppearanceToggle`; orphaned ThemeProvider
  removed; @ip/ui System A kept for the company app. **Runtime-verified**: set mode=light → reload → pre-paint
  applied light (`htmlDark:false`). typecheck 6/6, build 3/3.
- **[P2] register error mapping** → `7df1903`. ALREADY_EXISTS + server validation message surfaced (pairs
  with the BE fix; the generic "Something went wrong" is gone for these).
- **[P2] dashboard greeting raw ObjectId** → `7df1903`. Greets from email local-part, falls back to "there".
- **[P2] dashboard KPI mislabel** → `7df1903`. "Interviews scheduled" → "Interviews to start".
- **[P2] Settings nav hop** → `7df1903`. Candidate Settings nav → `/settings` directly.
- **[P2] schedule getIcs unguarded await** → `7df1903`. try/catch + toast.error.
- **[P1] company onboarding misleading copy** → `7df1903`. Finish step no longer promises invites it never
  sends (copy-only; full persistence wiring still backlog).
- **[P1] /cookies 404 site-wide** → `7df1903`. Dead footer link removed.

### Re-test after fixes — GREEN
- Backend FULL gate re-run (post auth fix): PASS, exit 0 — no cross-suite regression.
- FE typecheck 6/6 + build 3/3 after each FE batch.
- Theme persistence runtime-verified (see P0 above).
- Live register flow re-tested: valid email → account created + session (token stored) + → /verify.

## In progress / remaining backlog (precise locations above)
Batch 2 (being applied): Field label↔input a11y; homepage/pilot/waitlist metadata; applicant decision copy;
dashboard dead avg tile; notification-item Date.now() hydration.
Not yet done: company onboarding full persistence RPCs; mega-menu keyboard a11y; legacy `apps/company`
deprecation (or wire its no-op buttons + mock branding); tokens cross-tab listener; transport cookie-refresh
timeout; login/callback redirect race; ~13 lucide value-imports in `@ip/ui`; company audit/billing live
clients; the P3 polish list.
