# Frontend Issues — Aperture Pro v3 (2026-06-21)

Source: overnight test+fix pass on the merged Aperture Pro v3 (`origin/main`). Inputs were
static gates (turbo typecheck 6/6 + build 3/3), live runtime testing (real register→login,
~50-route sweep, theme verification), and 3 deep code audits (candidate-authed surface,
company surface, `@ip/ui` + shared integration). **Frontend only** — backend issues are in
`2026-06-21-autonomous-test-issues.md`.

Severity: **P0** broken/UX-breaking · **P1** major · **P2** minor · **P3** polish.
Status: ✅ solved (committed + pushed) · ⬜ open (backlog).

---

## ✅ SOLVED (committed + pushed — typecheck 6/6, build 3/3)

| # | Sev | Issue | File | Fix | Commit |
|---|-----|-------|------|-----|--------|
| 1 | **P0** | Dual theme system — header toggle wrote `@ip/ui`'s `"theme"` key but the candidate pre-paint script reads `aptura.appearance.v1`, so light/dark was silently lost on reload | `packages/ui/src/theme.tsx`, new `apps/candidate/components/appearance-toggle.tsx`, shells + interview pages + `layout.tsx` | New app-local `AppearanceToggle` drives the appearance system; orphaned `ThemeProvider` removed from candidate; `@ip/ui` system kept for company app. Runtime-verified (light persists across reload) | `0bbd6fe` |
| 2 | **P1** | `/cookies` footer link 404'd on every marketing + legal page | `packages/ui/src/aperture-chrome.tsx` (`DEFAULT_LEGAL` ~:374) | Removed the dead `/cookies` entry | `7df1903` |
| 3 | **P1·SEO** | Home, `/pilot`, `/waitlist` were client components with no `metadata` → generic root `<title>` | `apps/candidate/app/{page,pilot/page,waitlist/page}.tsx` (+ new `page-client.tsx` siblings) | Split into server `page.tsx` exporting `metadata` + client child; all three now static-render with real titles | `b661492` |
| 4 | **P1·a11y** | `@ip/ui Field` generated an id but never wired `htmlFor`↔input `id` → unlabelled inputs in settings/in-app forms | `packages/ui/src/field.tsx` | Resolve id (child id → `htmlFor` → `useId`), inject onto cloned child + `Label`, add `aria-describedby`/`aria-invalid` on error | `b661492` |
| 5 | **P1** | Company onboarding "Finish" persists nothing yet copy promised "Invitations are sent when you save" | `apps/candidate/app/company/onboarding/page.tsx` (~:122-127, :343) | Truthful copy (copy-only; full RPC persistence still open — see #14) | `7df1903` |
| 6 | **P2** | Dashboard greeting showed a raw Mongo ObjectId ("Welcome back, 6a377dd3…") for a new user with no name | `apps/candidate/components/dashboard.tsx` (~:147) | Greet from email local-part; fall back to "there"; never the id | `7df1903` |
| 7 | **P2** | Dashboard KPI "Interviews scheduled" actually counted available-to-start interviews | `apps/candidate/components/dashboard.tsx` (~:216) | Relabel "Interviews to start" | `7df1903` |
| 8 | **P2** | Register mapped every failure to "Something went wrong. Please try again." | `apps/candidate/app/register/page.tsx` | Surface `ALREADY_EXISTS` + server validation message (pairs with BE `INVALID_ARGUMENT` fix) | `7df1903` |
| 9 | **P2** | Settings nav pointed at `/account` → client-redirect to `/settings` (extra hop + nav highlight never matched) | `apps/candidate/components/candidate-shell.tsx` (~:63) | Point straight at `/settings` | `7df1903` |
| 10 | **P2** | Company schedule `addToCalendar` awaited `getIcs` with no try/catch (called via `void`) → unhandled promise rejection | `apps/candidate/app/company/jobs/[id]/applicants/[appId]/schedule/page.tsx` (~:134) | Wrap in try/catch + `toast.error` | `7df1903` |
| 11 | **P2** | Applicant Decline toast + dialog claimed "candidate will be notified" but no notification RPC is sent | `apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx` (~:175, :390) | Truthful copy ("notifications coming soon"); advance→`overrideGate` unchanged | `b661492` |
| 12 | **P2** | Dashboard "Avg response time" tile was permanently "— / 0" (response carries no timestamps) | `apps/candidate/components/dashboard.tsx` (~:129-136) | Removed the dead tile; strip is now 3 columns | `b661492` |
| 13 | **P2** | `@ip/ui notification-item` computed relative time with `Date.now()` during render → SSR/client hydration mismatch | `packages/ui/src/notification-item.tsx` (~:23,58) | Render absolute `<time>` on SSR, swap to relative after mount | `b661492` |

---

## ⬜ OPEN (backlog)

### Needs a product/scope decision
| Sev | Issue | File | Recommended fix |
|-----|-------|------|-----------------|
| **P1** | Legacy standalone `apps/company` is fully duplicated by the unified `/company/*` and drifting | `apps/company/*` | **Deprecate the app.** If kept: `app/dashboard.tsx:147-152` Advance/Reject are no-op (no onClick); `app/branding/page.tsx:48` hardcodes `makeMockBrandingClient()` (never persists live) — wire both |
| **P1** | Company onboarding collects profile + first-role + team invites but "Finish" runs no RPC (data discarded) | `apps/candidate/app/company/onboarding/page.tsx:343` | Wire persistence (companyProfile upsert / createJob draft / team invites). Copy already corrected (#5) |

### P1 — major
| Issue | File | Fix |
|-------|------|-----|
| Desktop mega-menu is mouse-only / not keyboard-operable (no `aria-expanded`/`aria-controls`, no Escape; trigger button does nothing on Enter/Space) | `packages/ui/src/aperture-chrome.tsx:263-301` | Make it a real disclosure (Radix `NavigationMenu`/`DropdownMenu` or manual `useState` + `aria-expanded` + Escape + arrow keys) |
| `themeScript` exported but never injected (the FOUC-correct pre-paint for `@ip/ui`'s System A); company app relies on it | `packages/ui/src/theme.tsx` | For company: either inject `themeScript` pre-paint or migrate company onto the appearance system too (candidate already done in #1) |

### P2 — minor
| Issue | File | Fix |
|-------|------|-----|
| Token store has no cross-tab `storage` listener → logout/refresh in tab A doesn't update tab B (stale token until its own 401) | `packages/shared/src/tokens.ts:20-40` | Add `window.addEventListener("storage", …)` that re-reads + notifies |
| SSO cookie-refresh `fetch('/auth/oauth/refresh')` has no timeout/abort → can hang the single-flight + every queued 401 retry | `packages/shared/src/transport.ts:48-51` | Add `AbortController` + timeout |
| Refresh retry can still spend a rotated refresh token under a 3-way race (WeakMap entry deleted in `finally` before the 2nd caller checks) | `packages/shared/src/transport.ts:107-117` | Latch last-known-good access token / rotation counter; compare against it, not only `sent !== current` |
| `Input`/`Textarea` don't `forwardRef` (blocks RHF `register()`, focus-on-error, `asChild`) | `packages/ui/src/{input,textarea}.tsx:5` | Wrap in `forwardRef` (Button already does) |
| `Button size="icon"` permits a button with no accessible name (icons `aria-hidden`, children optional, no required `aria-label`) | `packages/ui/src/button.tsx:39-41` | Require `aria-label` at the type level for icon size |
| ~13 `lucide-react` **value**-imports inside `@ip/ui` (violates the lucide-in-app rule; package even comments it) | `packages/ui/src/`: `theme.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `select.tsx`, `checkbox.tsx`, `alert.tsx`, `spinner.tsx`, `button.tsx` (`Loader2`), `app-shell.tsx`, `chat-window.tsx`, `message-thread-view.tsx`, `notification-bell.tsx`, `verify-card.tsx` | Inline SVGs (as `logo.tsx`/`aperture-sprite.tsx` do) or accept icon props. Type-only `import type { LucideIcon }` is fine |
| `ApIcon name` has no fallback for an unknown sprite id → `<use href="#ap-missing">` renders an empty SVG silently | `packages/ui/src/aperture-sprite.tsx:180-189`, `aperture-chrome.tsx` | Type `name` against a union of sprite ids, or render a fallback |
| Login redirect-after-success has two owners (submit `push` + mount-effect `replace`) → latent bounce if `decodeRoleFromStore()` and hydrated `identity.role` disagree | `apps/candidate/app/login/page.tsx:52-69` | Rely on one path or add a "navigating" guard |
| `auth/callback` arms an 8s "taking too long" timeout *after* `router.replace` (success path) → can flash an error over a successful login | `apps/candidate/app/auth/callback/page.tsx:76-80` | Only arm the timeout on the pending path / clear immediately after `replace` |
| Multiple unlabelled `<nav>` landmarks ("navigation, navigation" for SR) | `apps/candidate/app/layout.tsx:121,127` + `app-shell.tsx` | Add `aria-label` to each `<nav>` |
| Standalone pages start at `<h2>` (no `<h1>`) — `CardTitle` hard-coded `h2`, `VerifyCard` renders own `<main>` | `packages/ui/src/{card.tsx:30,verify-card.tsx:55}` | Allow heading level / add page `<h1>` |
| Company `audit` + `billing` are mock-only (`makeMock*`, no live client) → show fixture data against a live backend | `apps/candidate/app/company/{audit,billing}/*` | Wire live clients when the RPCs land (pre-launch placeholders) |
| Company `settings` uses candidate/shadcn token vocab (`border-border`/`bg-surface`) vs Aperture v3 (`border-line`/`bg-surface-2`) → off-brand tab bar | `apps/candidate/app/company/settings/page.tsx` | Re-skin `TabsList`/`TabsTrigger` to Aperture tokens |
| Company job edit `save` is a `NEXT_PUBLIC_MOCK` no-op + `updateJob` cast-seam (RPC not in proto yet) → edits can silently vanish | `apps/candidate/app/company/jobs/[id]/edit/page.tsx:40,91` | Track proto-gen follow-up; add a visible "saved" assertion |
| `company/jobs/new` parses skills but never sends them to `createJob` (only title+jdText) | `apps/candidate/app/company/jobs/new/page.tsx:57,87` | Confirm intent; send skills or drop the dead `setV` |
| `pilot`/`waitlist` forms are `mailto:` seams that show unconditional success after 600ms regardless of delivery | `apps/candidate/app/{pilot,waitlist}/page-client.tsx` | Replace with a real submit endpoint when available |

### P3 — polish
| Issue | File | Fix |
|-------|------|-----|
| `analytics` query omits `enabled: Boolean(token)` (every other page has it) | `apps/candidate/app/company/analytics/page.tsx:37-40` | Add for parity |
| `onboarding` + `profile` use only `useRequireAuth` (no `useRequireRole`) unlike practice/schedule | `apps/candidate/app/{onboarding,profile}/page.tsx` | Add `useRequireRole(["candidate"])` for parity |
| 2FA enabled-state is local `useState(false)` → a user who already has TOTP on sees "Not enabled" until they act | `apps/candidate/components/settings/security-tab.tsx:118` | Seed from a `me`/profile `totp_enabled` read |
| Stale `as unknown as ProctorAck` cast — `terminated`/`reason` ARE now in the generated `ProctorAccepted` | `apps/candidate/app/interview/[applicationId]/page.tsx:154-156` | Drop the cast; read `res.terminated` directly |
| `RescoreDialog` "submits" by copying text to clipboard + a toast; button label "Copy & open messages" doesn't open messages | `apps/candidate/app/applications/[id]/outcome/page.tsx:431-446` | Route to `/messages/[id]` after copy, or relabel |
| Redundant `invalidateQueries(["saved-jobs","ids"])` then `(["saved-jobs"])` (prefix already matches) | `apps/candidate/components/save-job-button.tsx:40-41` | Drop the narrower call |
| `marketing-footer` has one `href="#"` | `apps/candidate/components/marketing/marketing-footer.tsx:61` | Point at a real target or remove |
| `verify` `continueHref` is a dead ternary (`company ? "/login" : "/login"`) | `apps/candidate/app/verify/page.tsx:79` | Collapse, or make the company branch differ if intended |
| `global-error.tsx` uses the stale old-brand accent `#7c5cff` (violet) vs v3 indigo/cyan | `apps/candidate/app/global-error.tsx:34` | Update to a v3 token-equivalent hex (renders before CSS loads, so hardcode is OK — just the wrong color) |
| Interview lobby ID/env scans are stubbed `setTimeout` placeholders ("v3.2") | `apps/candidate/app/interview/[applicationId]/lobby/page.tsx:122-127` | Implement when v3.2 lands (flagged for visibility) |

---

## Audited clean (no action)
- Integration core: `transport.ts` single-flight refresh / retry-don't-re-refresh, `tokens.ts` SSR guards,
  `auth.tsx` malformed-token clear, the admin-vs-ai-agents transport split, and the api-client "quad" —
  **every `api.<svc>` used in source resolves** against `AdminClients`/`AiAgentsClients` (no imported-but-unexported service).
- Radix-backed `dialog`/`dropdown-menu`/`select`/`tabs`/`radio-group`/`checkbox` (focus trap/Escape/arrow nav for free);
  `confirm-dialog`, `progress` ARIA, `chat-window` StrictMode+AbortController handling.
- gRPC field access is correct camelCase across the whole surface; no conditional hooks, no unguarded `JSON.parse`,
  no `.map` on unguarded undefined; auth screens' local `Field` associates labels correctly + password fields typed.
- Aperture tokens (`globals.css` Tailwind v4 `@theme inline`) are clean; hardcoded hex only where unavoidable
  (viewport themeColor, manifest, Satori OG, the deliberately token-free `global-error`).
