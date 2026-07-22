# Aptura Frontend Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the highest-value correctness, security, SEO, performance, and consolidation gaps in the Aptura frontend, in phases that each ship independently.

**Architecture:** `frontend/` is a pnpm + turbo monorepo. `apps/candidate` is the unified Next.js 15 App Router app hosting both candidate (`/…`) and recruiter (`/company/…`) routes. `apps/company` is a legacy duplicate slated for deletion. `packages/ui` (`@ip/ui`) is the source-only design system, `packages/shared` (`@ip/shared`) holds auth/transport, `packages/api-client` holds generated gRPC clients (never hand-edit).

**Tech Stack:** Next.js 15.5 (App Router, React 19), Tailwind CSS v4 (CSS-first `@theme inline`, no config file), TypeScript, TanStack Query, Connect gRPC-web, Satori (OG images).

## Global Constraints

- Light mode only. Dark mode was removed; do not reintroduce `dark:` utilities.
- Brand token is `--brand: oklch(0.53 0.24 300)`. `--teal` / `--coral` / `--gold` are **aliases** to it and are still referenced in ~52 files — do not blind-rename (see Phase 6, Task 6.4).
- `packages/api-client/src/gen/*` is generated. Never edit by hand.
- Stage **explicit paths** when committing. Never `git add -A`.
- Conventional Commits, subject ≤ 70 chars. Include `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Per-package typecheck must pass before every commit:
  `cd frontend && npx pnpm@9.15.0 --filter @ip/<pkg> exec tsc --noEmit`
- Never run a package `build` while a dev server is live on that app's port.

## Already Done (do not redo)

Verified present on `main` as of 2026-07-22:

- **Fonts are self-hosted.** `apps/candidate/public/fonts/*.woff2` (6 files) + `app/fonts.css` `@font-face` + preloads in `app/layout.tsx`. Geist Mono via `next/font/google` (build-time self-hosted). No external font CDN remains.
- **Logo geometry unified.** `LogoMark` (`packages/ui/src/logo.tsx`) and the `#ap-mark` sprite symbol (`packages/ui/src/aperture-sprite.tsx`) now draw identical geometry (viewBox 64, r=27, stroke 3 / 2.6, six radial spokes). Task 1.2 removes the remaining *drift risk*, not a visual mismatch.
- **Analytics placeholder tiles removed**, favicon/apple-icon/OG moved off stale teal onto brand violet.

---

## File Structure

**Phase 1** — `apps/candidate/next.config.ts`, new `apps/candidate/middleware.ts`, `packages/ui/src/logo.tsx`, `packages/ui/src/aperture-sprite.tsx`, `packages/ui/src/styles/primitives.css`, `apps/candidate/app/company/analytics/page.tsx`

**Phase 2** — delete `apps/company/**`; edit `frontend/README.md`, `.claude/launch.json`

**Phase 3** — new `apps/candidate/app/robots.ts`, `apps/candidate/app/sitemap.ts`, `apps/candidate/lib/structured-data.ts`; edit the job-detail route

**Phase 4** — `apps/candidate/components/landing/*`, `packages/ui/src/aperture-lens.tsx`, `packages/ui/src/styles/primitives.css`

**Phase 5** — new `.github/workflows/frontend.yml`, `frontend/e2e/**`, `frontend/playwright.config.ts`

**Phase 6** — `packages/ui/src/**` (icons, button, typography), plus a codemod across ~55 app files

---

## Phase 1 — Security & correctness

Small, self-contained, high value. Ship each task as its own commit.

### Task 1.1: Nonce-based CSP (drop `script-src 'unsafe-inline'` in production)

`apps/candidate/next.config.ts:17` currently ships `script-src 'self' 'unsafe-inline'` in **production**, which largely defeats the CSP's XSS protection. Next 15 supports nonces via middleware.

**Files:**
- Create: `frontend/apps/candidate/middleware.ts`
- Modify: `frontend/apps/candidate/next.config.ts` (CSP array, ~lines 12–35)

- [ ] **Step 1: Read the current CSP block**

Run: `sed -n '1,45p' frontend/apps/candidate/next.config.ts`
Note the exact array entries and how the header is attached (`headers()` at ~line 35).

- [ ] **Step 2: Add nonce middleware**

Create `frontend/apps/candidate/middleware.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";

// Per-request nonce so production CSP can drop `script-src 'unsafe-inline'`.
// Next injects this nonce into its own inline bootstrap scripts automatically
// when it sees the nonce in the CSP header.
export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const isDev = process.env.NODE_ENV === "development";

  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob: https:",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "font-src 'self'",
    "connect-src 'self' http://localhost:8080 http://localhost:8081 https: wss:",
  ].join("; ");

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Skip static assets and image optimisation.
    { source: "/((?!_next/static|_next/image|favicon.ico|fonts/).*)" },
  ],
};
```

> `connect-src` must list the real admin/ai-agents origins for your environments. Copy the existing values from `next.config.ts` rather than the localhost placeholders above.

- [ ] **Step 3: Remove the static CSP header from next.config.ts**

Delete the `Content-Security-Policy` entry from the `headers()` return so the middleware is the single source. Keep all other security headers (HSTS, X-Content-Type-Options, Referrer-Policy) in `next.config.ts`.

- [ ] **Step 4: Verify no CSP violations**

```bash
cd frontend && npx pnpm@9.15.0 --filter @ip/candidate build
```
Then start the app and load `/`, `/login`, `/jobs`, and one `/company/*` route. Open the browser console and confirm **zero** `Content-Security-Policy` violation errors. Satori OG rendering (`/opengraph-image`) must still return 200.

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/candidate/middleware.ts frontend/apps/candidate/next.config.ts
git commit -m "fix(fe): nonce-based CSP, drop script-src unsafe-inline in prod"
```

---

### Task 1.2: Single-source the brand mark

`LogoMark` and the `#ap-mark` sprite symbol currently hold **two copies** of identical geometry, kept in sync only by a code comment. Make one the source.

**Files:**
- Modify: `frontend/packages/ui/src/logo.tsx`
- Modify: `frontend/packages/ui/src/aperture-sprite.tsx`

**Interfaces:**
- Produces: `APERTURE_MARK_VIEWBOX: string`, `ApertureMarkPaths: () => JSX.Element` — consumed by both `LogoMark` and the sprite symbol.

- [ ] **Step 1: Extract the shared geometry**

Create the shared drawing in `frontend/packages/ui/src/aperture-mark-geometry.tsx`:

```tsx
/** The one true Aptura aperture. Both <LogoMark> and the #ap-mark sprite
 *  symbol render this — never duplicate the path data. */
export const APERTURE_MARK_VIEWBOX = "0 0 64 64";

export function ApertureMarkPaths({ spin = false }: { spin?: boolean }) {
  return (
    <>
      <circle cx="32" cy="32" r="27" fill="none" stroke="currentColor" strokeWidth="3" />
      <g
        className={spin ? "spin" : undefined}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      >
        <line x1="43" y1="32" x2="55.4" y2="45.5" />
        <line x1="37.5" y1="41.5" x2="32" y2="59" />
        <line x1="26.5" y1="41.5" x2="8.6" y2="45.5" />
        <line x1="21" y1="32" x2="8.6" y2="18.5" />
        <line x1="26.5" y1="22.5" x2="32" y2="5" />
        <line x1="37.5" y1="22.5" x2="55.4" y2="18.5" />
      </g>
    </>
  );
}
```

- [ ] **Step 2: Point `LogoMark` at it**

In `logo.tsx`, replace the inline `<circle>` + `<g>` block with `<ApertureMarkPaths spin={spin} />` and use `viewBox={APERTURE_MARK_VIEWBOX}`.

- [ ] **Step 3: Point the sprite symbol at it**

In `aperture-sprite.tsx`, replace the `#ap-mark` symbol body:

```tsx
<symbol id="ap-mark" viewBox={APERTURE_MARK_VIEWBOX}>
  <ApertureMarkPaths />
</symbol>
```

- [ ] **Step 4: Typecheck and verify visually**

```bash
cd frontend && npx pnpm@9.15.0 --filter @ip/ui exec tsc --noEmit
```
Start the candidate app; confirm the mark is unchanged on `/` (landing nav, spinning) and `/login` (sprite consumer, violet).

- [ ] **Step 5: Commit**

```bash
git add frontend/packages/ui/src/aperture-mark-geometry.tsx frontend/packages/ui/src/logo.tsx frontend/packages/ui/src/aperture-sprite.tsx
git commit -m "refactor(ui): single-source the aperture mark geometry"
```

---

### Task 1.3: Respect `prefers-reduced-motion`

The logo spin (`markspin`, 34s infinite), `ctaflow`, the `ApertureLens` rAF loop, and the landing audience crossfade all animate unconditionally.

**Files:**
- Modify: `frontend/packages/ui/src/styles/primitives.css`
- Modify: `frontend/packages/ui/src/aperture-lens.tsx`

- [ ] **Step 1: Add a global CSS guard**

Append to `primitives.css`:

```css
/* Users who ask for less motion get none of the ambient brand animation. */
@media (prefers-reduced-motion: reduce) {
  .lucent .brand .mark .spin,
  .btn-hero:hover {
    animation: none !important;
  }
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 2: Halt the ApertureLens rAF loop**

In `aperture-lens.tsx`, before starting the loop:

```ts
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (reduced) return; // render the static lens; skip the rAF loop entirely
```

- [ ] **Step 3: Verify**

In the browser pane, emulate reduced motion and confirm the logo stops spinning and the lens is static.

- [ ] **Step 4: Commit**

```bash
git add frontend/packages/ui/src/styles/primitives.css frontend/packages/ui/src/aperture-lens.tsx
git commit -m "a11y(fe): honour prefers-reduced-motion across brand animation"
```

---

### Task 1.4: Stop the analytics range chips lying

`app/company/analytics/page.tsx` renders 7d/30d/90d chips (`RANGES`, lines 21–26; `RangeChips`, lines 76–103) whose value never reaches the RPC — the code comment admits `getFunnelAnalytics` takes no window and always returns last-30-days.

**Files:**
- Modify: `frontend/apps/candidate/app/company/analytics/page.tsx`

- [ ] **Step 1: Remove the chips and the dead state**

Delete the `RANGES` const, the `RangeId` type, the `RangeChips` component, the `range` / `setRange` `useState`, and the `<RangeChips … />` usage in the header (line ~52).

- [ ] **Step 2: State the real window in the lead copy**

Change the page lead to name the actual window, e.g. `"Funnel and conversion across every published role — last 30 days."`

- [ ] **Step 3: Typecheck + commit**

```bash
cd frontend && npx pnpm@9.15.0 --filter @ip/candidate exec tsc --noEmit
git add frontend/apps/candidate/app/company/analytics/page.tsx
git commit -m "fix(fe): drop non-functional analytics range chips"
```

> Reinstate the chips in the same commit as the backend change that adds a `windowDays` argument — not before.

---

## Phase 2 — Delete the legacy company app

`apps/company` duplicates `company-shell.tsx`, `branding/`, `logo-upload.tsx`, and `lib/upload.ts`, all of which also live under `apps/candidate/app/company/*`. It already drifted (its icon assets were deleted upstream while candidate's were not). Only `frontend/README.md` references it.

### Task 2.1: Remove `apps/company`

**Files:**
- Delete: `frontend/apps/company/**`
- Modify: `frontend/README.md`, `.claude/launch.json`

- [ ] **Step 1: Prove nothing depends on it**

```bash
cd /Users/rugwedpatharkar/Projects/Project
grep -rn "@ip/company\|apps/company" --include="*.json" --include="*.ts" --include="*.tsx" --include="*.yml" --include="*.yaml" frontend backend .github 2>/dev/null | grep -v node_modules | grep -v "^frontend/apps/company/"
```
Expected: only `frontend/README.md` lines. Check `frontend/apps/company/vercel.json` (or the Vercel dashboard) for a live deployment — **if one exists, stop and confirm with the user before deleting.**

- [ ] **Step 2: Delete the app**

```bash
git rm -r frontend/apps/company
```

- [ ] **Step 3: Update the docs and launch config**

Remove the `apps/company` bullet and the two `@ip/company` command lines from `frontend/README.md`. Remove the `company` configuration object from `.claude/launch.json`.

- [ ] **Step 4: Verify the workspace still resolves**

```bash
cd frontend && npx pnpm@9.15.0 install && npx pnpm@9.15.0 --filter @ip/candidate exec tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add -u frontend/apps/company frontend/README.md
git add .claude/launch.json
git commit -m "chore(fe): delete legacy apps/company"
```

---

## Phase 3 — SEO foundation

Highest commercial ROI available. There is currently **no** JSON-LD, `sitemap.ts`, or `robots.ts`. `JobPosting` structured data is what makes listings eligible for Google Jobs.

### Task 3.1: `robots.ts` + `sitemap.ts`

**Files:**
- Create: `frontend/apps/candidate/app/robots.ts`, `frontend/apps/candidate/app/sitemap.ts`

- [ ] **Step 1: Add robots**

```ts
import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://aptura.ai";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Signed-in surfaces carry no SEO value and must not be crawled.
      { userAgent: "*", allow: "/", disallow: ["/company/", "/interview/", "/settings", "/api/"] },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
```

- [ ] **Step 2: Add a sitemap covering static routes + published jobs**

Start with static routes only; add job URLs once you confirm a public list RPC that does not require auth. Do **not** call an authed RPC from the sitemap.

- [ ] **Step 3: Verify** — load `/robots.txt` and `/sitemap.xml`, expect 200 and valid XML.

- [ ] **Step 4: Commit** — `feat(fe): add robots.txt and sitemap`

### Task 3.2: `JobPosting` JSON-LD on job detail

- [ ] **Step 1: Locate the public job detail route**

```bash
find frontend/apps/candidate/app -path "*jobs*" -name "page.tsx" | grep -v company
```

- [ ] **Step 2: Add a typed builder** in `frontend/apps/candidate/lib/structured-data.ts` mapping the job DTO to schema.org `JobPosting` (`title`, `description`, `datePosted`, `validThrough`, `employmentType`, `hiringOrganization`, `jobLocation`, `baseSalary`, `directApply: true`).

- [ ] **Step 3: Render it** as `<script type="application/ld+json" nonce={nonce}>` — it must carry the CSP nonce from Task 1.1.

- [ ] **Step 4: Validate** each URL against Google's Rich Results Test before committing.

- [ ] **Step 5: Commit** — `feat(fe): JobPosting structured data on job detail`

### Task 3.3: Per-route metadata + canonicals

- [ ] Add `metadataBase` and `alternates.canonical` in the root layout, and per-route `generateMetadata` for job detail (title/description from the job). Commit as `feat(fe): per-route metadata and canonical URLs`.

---

## Phase 4 — Landing performance

### Task 4.1: Give the homepage server-rendered content

**Worse than originally recorded.** The homepage does not merely ship as client JS — it
renders *nothing* server-side. `app/page.tsx` renders `HomeClient` (`app/page-client.tsx`),
which does:

```tsx
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);
if (!mounted) return null;              // ← server HTML is empty
if (token) return identity?.role === "candidate" ? <Dashboard /> : null;
return <ApplicantsLanding />;           // → LandingPage
```

Confirmed by fetching `/`: the served HTML carries the `<title>` and meta description but
no nav, no brand link, no hero markup — the body only exists after hydration. The mount
gate is deliberate (it avoids a hydration mismatch and a signed-out flash for logged-in
users), but it costs SSR for *every* visitor.

Consequences: crawlers that do not execute JS see an empty page, this partly undercuts the
sitemap added in Phase 3, and LCP suffers on the highest-traffic public page.

**Direction:** render the marketing landing server-side and swap to `Dashboard` on the
client only for signed-in users — accepting a brief landing flash for them, or steering it
with a cookie hint — rather than serving empty HTML to everyone. Only the audience switch,
mega-menu, and mobile menu genuinely need client state.

Note: since Phase 1 made every route dynamically rendered (nonce CSP), the goal here is
server-rendered *content* and a smaller client bundle — not static caching, which nonces
preclude.

- [ ] **Step 1: Map the boundary.** List every hook used in `landing-page.tsx`, `candidate-body.tsx`, `company-body.tsx`. Anything with no hooks and no handlers is a server-component candidate.
- [ ] **Step 2:** Keep `LandingPage` (audience state) client; extract the static hero copy, feature sections, and footer into server components imported as `children`.
- [ ] **Step 3:** Measure before/after with `next build` output — client bundle for `/` must shrink. Record both numbers in the commit body.
- [ ] **Step 4: Commit** — `perf(fe): render static landing sections on the server`

### Task 4.2: Cap the compositor cost — **measured, no action taken**

- [x] `ApertureLens` rAF gating — **already done.** `aperture-lens.tsx` gates on both
  `prefers-reduced-motion` and `IntersectionObserver`, so the loop stops off-screen.
- [x] `backdrop-filter` audit — **measured on the running landing** (1280×720, mock dev):

  | Audience | Elements with backdrop-filter | In viewport | Viewport coverage |
  |---|---|---|---|
  | Candidates | 50 | 6 | 20% |
  | Hiring | 43 | 6 | 20% |

  The nav resolves to `blur(16px) saturate(1.4)`. Six simultaneously composited blur
  layers covering a fifth of the viewport is moderate, not pathological — well short of
  the budget problem the audit assumed from counting 24 CSS declarations.

**Deliberately not changed.** Reducing blur would visibly alter the Lucent glass
aesthetic, and the measurement gives no evidence it is costing frames. The honest next
step is a real performance trace (DevTools/Lighthouse) on a mid-tier device to see
whether compositing actually drops frames; optimise only if it does. The 50-vs-6 gap
(most blurred elements are off-screen) is the number to watch during long scrolls.

---

## Phase 5 — Frontend CI and tests

Currently **7 test files** across the whole frontend and **no frontend CI** (`.github/workflows/` holds only `mongo-backup.yml`). Every gate is manual.

### Task 5.1: CI workflow

- [ ] Create `.github/workflows/frontend.yml` running, on PRs touching `frontend/**`: `pnpm install --frozen-lockfile`, then `tsc --noEmit` for `@ip/ui`, `@ip/candidate`, then `--filter @ip/candidate build`. Commit as `ci: typecheck and build the frontend on PRs`.

### Task 5.2: Playwright smoke E2E

- [ ] Add `frontend/playwright.config.ts` + `frontend/e2e/smoke.spec.ts` covering: landing renders and the audience switch swaps bodies; `/login` renders; `/jobs` renders. Run against `candidate-mock`. Wire into CI.

### Task 5.3: Visual regression on the design system

- [ ] Add screenshot tests for `Logo`/`LogoMark`, `Button` variants, `EmptyState`/`ErrorState`/`LoadingState`, and the sprite icon grid. **This is what would have caught the three-way logo drift automatically.** Commit as `test(ui): visual regression for design-system primitives`.

---

## Phase 6 — Design-system consolidation

Largest and riskiest — do last, one task per commit.

### Task 6.1: Collapse two icon systems — **premise corrected, direction reversed**

Inventory (2026-07-23):

| | Count |
|---|---|
| Unique lucide icons imported | **57** |
| Sprite symbols defined | 28 (now 24, see below) |
| `<ApIcon>` call sites | 60, across 14 distinct names |

**The stated premise was wrong.** The two systems do *not* visibly disagree: the sprite's
generic icons use `viewBox="0 0 24 24"` and `strokeWidth="2"` (24 of 27 declarations; three
outliers at 2.2/2.4), which is exactly lucide's default grid and weight. The stroke
mismatch recorded in the audit was the *logo mark* (2.1 vs 3/2.6) — fixed in Phase 1.
So this task buys maintainability (one system, not two), **not** visual consistency.

**Direction reversed: migrate sprite → lucide**, not lucide → sprite as originally planned.
Lucide already covers all 13 generic sprite names in use (`check`→`Check`,
`arrow`→`ArrowRight`, `shield-check`→`ShieldCheck`, `dl`→`Download`, `bolt`→`Zap`,
`cam`→`Video`, and so on), it is already a dependency, and `next.config.ts` already
tree-shakes it via `optimizePackageImports`. Going the other way would mean hand-drawing
30+ new symbols to reach parity with 57 icons — more work, and worse icons.

`mark` stays: it is the brand logo, has no lucide equivalent, and is single-sourced from
`aperture-mark-geometry.tsx`. Retire `ApIcon`/`ApIconName` last, once the other 13 names
are gone.

- [x] **Pruned dead symbols.** Removed `ap-eye`, `ap-briefcase`, `ap-grid`, `ap-spark` —
  the only four with no reference anywhere. The sprite renders in the root layout, so
  unused symbols ship on every page. 28 → 24.
- [ ] Migrate the 13 generic names to lucide in batches by route, typechecking per batch.
- [ ] Delete `ApIcon`/`ApIconName` and the generic symbols once call sites reach zero.

> **Trap for whoever executes this.** Icon names are not all in JSX. `company-body.tsx`
> passes them as *data* (`const GET: {icon: ApIconName}[]`, `const VERTICALS:
> [ApIconName, ...][]`), which a `<ApIcon name="…">` grep does not see. Ten names —
> `timer report chip dollar heart bag academy building users globe` — are used **only**
> that way. Grep for the `ApIconName` type, not just the component.

### Task 6.2: One Button — **do not do this. Closed 2026-07-23.**

There are **three** button tiers, not two (an earlier count of "12 CSS usages" was wrong —
`.btn-ghost` was matching `ap-btn-ghost` as a substring):

| Tier | Usages | Where |
|---|---|---|
| `<Button>` (CVA) | 53 | product screens |
| `.ap-btn-*` (CSS) | **103** | product screens — the dominant pattern |
| `.btn-*` (CSS) | 12 | Lucent landing only |

**The separation is deliberate and already documented in the code.** `packages/ui/src/button.tsx`
says so directly: the landing "deliberately keeps its own larger marketing button set …
with signature spectral-gradient + glass styles that don't belong on product screens; the
Aperture `.ap-btn-*` set is a third product-instrument tier. **These are intentional tiers,
not duplication to merge.**"

The audit recommended merging what the design system separates on purpose. Confirmed by
measurement: the landing uses `.btn` 12× and `<Button>` 0×, the product screens use
`.ap-btn`/`<Button>` and `.btn` 0×. There is no sprawl to clean up — converting the landing
CTAs would in fact make those files *less* internally consistent, since they are otherwise
built from CSS classes throughout (`.reveal` 68×, `.glass` 34×, `.ap-cell` 14×).

**What was real, and is fixed:** two elements stacked two tiers at once —
`cn(buttonVariants(), "ap-btn ap-btn-primary")`. Because `.ap-btn` lives in
`@layer components` and Tailwind utilities come later in the cascade, the CVA styling
silently won. In `jobs/[id]/apply-island.tsx` that was user-visible: "Sign in to apply"
(signed out) and "Apply now" (signed in) occupy the same slot but rendered as different
buttons — 40px/8px/14px vs 46px/12px/15.68px. Both now use one tier per element.

**Rule for the future:** pick one tier per element; never combine `buttonVariants()` with
`.ap-btn*`.

### Task 6.3: Typography + `SuccessState` primitives — **do not do this. Closed 2026-07-23.**

Both halves fail the same test 6.2 failed: they would add a parallel system beside one
that already exists and is used.

**Typography — already solved in CSS.** The claim was that headings are "ad-hoc utility
strings". They are not; there is a typography scale in `primitives.css` with **234**
usages:

| Class | Usages |
|---|---|
| `.ap-eyebrow` | 52 |
| `.ap-h3` | 47 |
| `.ap-h2` / `.ap-h4` / `.ap-lead` | 45 each |

Adding `Heading`/`Text` components would make a fourth parallel button-style split — the
exact mistake Task 6.2 documents. If the scale ever needs to become components, it is a
migration of 234 call sites, not an addition.

**`SuccessState` — nothing to consolidate.** Success is communicated by toast: **37**
`toast.success(...)` calls. The checkmark markup that a survey turns up is *inline
indicators*, structurally unlike a block state — a "Confirmed" badge in a schedule row
(`schedule/page.tsx:260`), a "Session captured" chip (`interview/.../done/page.tsx:67`), a
timeline step marker (`applications/[id]/page.tsx:260`), a checklist tick
(`candidate-checklist.tsx:168`). A `SuccessState` block would replace none of them and
would ship unused.

The trio is also complete by design, not by omission: `EmptyState` / `ErrorState` /
`LoadingState` are the three **data-fetch** states. Success is not a fetch state — a
successful fetch renders the data. There is no missing fourth.

### Task 6.4: Legacy token rename (**handle with care**)

`--teal` / `--coral` / `--gold` alias `--brand` across ~52 files. This is **not** a safe sed:

- `apps/candidate/app/settings/appearance-client.ts:160` writes `--teal` at runtime.
- Company branding persists `"teal" | "coral" | "gold"` as **server-side enum values** (`app/company/branding/*`).

- [ ] **Step 1:** Separate the two concerns — the *CSS variable* rename and the *persisted enum values*, which must keep their current strings or ship a backend data migration.
- [ ] **Step 2:** Rename CSS variables only, keeping `--teal` etc. as deprecated aliases for one release.
- [ ] **Step 3:** Migrate usages in batches, typechecking each.
- [ ] **Step 4:** Remove the aliases only after the usage count hits zero.

---

## Phase 7 — Auth hardening

### Server-side enforcement — **audited 2026-07-23, no gap found**

The open worry was that `decodeIdentity` (`packages/shared/src/auth.tsx:48`) reads
`sub`/`role`/`comp_id` from an **unverified** JWT, so if the backend trusted the client the
UI would be the only gate. It does not. Traced end to end:

| Layer | Evidence |
|---|---|
| Signature | `lib/lib/security/tokens.py:114` — `jwt.decode(token, self._secret, algorithms=[self._alg], audience=_AUDIENCE, issuer=_ISSUER)`. Explicit algorithm allowlist, so `alg: none` substitution is rejected. |
| Token type | `decode(..., expected_type="access")` rejects a reset/mfa/refresh token used as an access token. |
| Identity | `identity_from_token` (`services/admin/app/resources/auth.py:296`) derives role and comp_id from **verified claims**, never from request input. |
| Authorization | Resources check `if identity["role"] not in _MANAGER_ROLES: raise ForbiddenError` — e.g. `get_funnel_analytics`. Coverage in `job`/`decision`/`report`/`rubric` is ≥1 guard call per public function. |
| Tenant isolation | **14** resources scope queries by `identity["comp_id"]` (e.g. `applications.list_by_comp`). |
| Escape hatches | No `verify_signature=False` and no permissive `options={...}` anywhere in `services/` or `lib/`. |

A forged or role-tampered token therefore cannot escalate: the client cannot lie about its
role or company. **The frontend's `useRequireRole` is UX only, and that is correct.**

Note for whoever re-audits: `services/admin/app/resources/funnel.py` has no role check and
that is right — it is the RabbitMQ-driven application state machine, not an RPC. Judge
role coverage per user-facing route, not per file.

### Remaining, and genuinely cross-team

- **Tokens in `localStorage`.** Access *and* refresh are XSS-exfiltratable
  (`packages/shared/src/tokens.ts`). Given the enforcement above, the exposure is session
  hijack — not privilege escalation. The real fix is httpOnly cookies via a BFF/proxy,
  which changes the transport layer and needs the backend owner. Until then this is an
  accepted, documented risk, and the strict CSP from Phase 1 is what narrows it.
- **Session-hint cookie.** A non-sensitive `ip_has_session` cookie set at login would let
  the server render the dashboard shell directly and remove the one-paint landing flash
  introduced in Phase 4. Frontend-only, but it touches the login/logout flow, so it should
  land with the token-storage work rather than as a lone patch — and it must be cleared on
  logout or a stale cookie produces the reverse flash.

---

## Self-Review Notes

- **Fonts were dropped from this plan on purpose** — verified already self-hosted on `main` (see "Already Done").
- Tasks 1.1, 1.2, 1.4, 2.1 have exact verified paths and line numbers.
- Tasks 3.2, 4.1, 6.1 open with a **discovery step** because they span files not yet read; the discovery step is the deliverable of that step, not a placeholder.
- Phase 6 and Phase 7 are deliberately last: 6 is broad mechanical churn, 7 needs another team.
