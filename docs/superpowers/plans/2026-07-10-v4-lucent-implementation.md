# Aptura v4 "Lucent" — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved **D5 "Lucent"** design language (light-only, glass + a live 3D aperture-lens, vibrant-but-minimal spectral aurora, Clash Display / General Sans type, spectral-gradient CTAs) to the real Aptura frontend — **look only**, keeping all content, data, and behavior on both the candidate and `/company/*` recruiter sides exactly as-is.

**Architecture:** The candidate app is the single unified app (Next.js 15 App Router, React 19, Tailwind v4). All palette/type lives in `app/globals.css` as semantic tokens that `@theme inline` maps to Tailwind utilities and that the hand-written `.ap-*` component layer + the token-agnostic `@ip/ui` primitives consume. **Strategy: keep the token NAMES, swap their VALUES to Lucent, add new tokens for glass/aurora/spectral, remove the dark layer.** That reskins the entire app from one file; per-screen work then rebuilds the high-touch surfaces (landing first) to match the D5 mockup 1:1 and applies glass/3D/effect primitives where they belong.

**Tech Stack:** Next.js 15.5 · React 19 · Tailwind v4 (CSS-first `@theme`, no config file) · TanStack Query · Connect/gRPC (frozen) · fonts via Fontshare (`Clash Display`, `General Sans`) + Google (`Geist Mono`) · zero-dependency CSS/SVG 3D (optional lazy `react-three-fiber` hero model, separate task). Reference mockup: `docs/brand/redesign-v4/D5-lucent.html`.

## Global Constraints

Every task implicitly includes these. Values copied verbatim from the v4 brief + PRODUCT.md + this repo's CLAUDE.md.

- **Backend is out of bounds.** No changes under `backend/`, no `*.proto`, no `pnpm gen`, no `frontend/packages/api-client/src/gen/*`.
- **Content / data / behavior FROZEN** on candidate **and** `/company/*` sides. Same copy, same queries, same handlers, same `NEXT_PUBLIC_MOCK` mock/real seams, same routes' behavior, same proctored-interview invariants (camera+mic required, no mute, no camera-off, fullscreen-locked, HIGH-severity auto-gate). **Look, layout, type, motion only.**
- **Light mode only — no dark mode, no theme toggle anywhere** (product decision 2026-07-10). Remove the dark token layer + the appearance/theme system.
- **WCAG 2.1 AA:** body/UI contrast ≥4.5:1, large ≥3:1; visible `:focus-visible`; keyboard operable; labels; `aria-live` on async; **every animation has a `@media (prefers-reduced-motion: reduce)` alternative**; ≥44px touch targets.
- **Never break the build.** Verify each task: `cd frontend && npx pnpm@9.15.0 --filter @ip/candidate exec tsc --noEmit` (0 errors) and, when a task is a natural checkpoint, `--filter @ip/candidate build` (green). **Never run `next build` while a dev server is live on :3000.**
- **Commit per task with explicit paths** (`git add <files>`, never `-A`/`.`). Conventional Commits; include the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.
- **Browser-verified fidelity:** every visible task ends with a `preview_*` screenshot compared side-by-side against `docs/brand/redesign-v4/D5-lucent.html` served on `:4174`. Reproduce, do not reinterpret.

**Verification note:** this is a visual reskin, so a task's "test" is the trio **typecheck green · build green (at checkpoints) · browser screenshot matches the mockup + contrast/overflow measured in-page**, not unit tests. Where genuinely testable logic changes (it mostly shouldn't — behavior is frozen), add/keep the existing test.

---

## File Structure

**Foundation (Task 1–3) — modify:**
- `frontend/apps/candidate/app/globals.css` — swap `:root` values to Lucent; add glass/aurora/spectral/3D tokens + utility classes; **delete** the `.dark {…}` block + `@custom-variant dark`.
- `frontend/apps/candidate/app/layout.tsx` — load Clash Display + General Sans; drop the `appearanceScript` + dark `colorScheme`.
- `frontend/apps/candidate/app/settings/appearance-client.ts`, `app/settings/appearance-tab`… → **remove dark/mode** parts, keep any non-theme settings.
- `frontend/apps/candidate/components/appearance-toggle.tsx` — remove (and its two shell usages).
- `frontend/apps/candidate/components/candidate-shell.tsx`, `components/company-shell.tsx` — remove `AppearanceToggle`; apply Lucent glass chrome.
- **Create:** `DESIGN.md` (root) — the locked Lucent visual system (impeccable format).

**Landing pilot (Task 4–6) — modify:**
- `frontend/packages/ui/src/aperture-chrome.tsx` (`MegaNav`/`MegaFooter`/`MarketingShell`) — Lucent glass nav/footer (content unchanged).
- `frontend/apps/candidate/app/(marketing)/applicants-landing.tsx` + `components/marketing/{applicants-hero,applicant-journey,no-ghosting-promise,practice-spotlight,privacy-panel,sample-report-card,applicants-faq,applicant-final-cta,accommodations}.tsx` — rebuild to match D5 sections 1:1, content verbatim.
- **Create:** `frontend/packages/ui/src/aperture-lens.tsx` — the reusable zero-dep CSS/SVG 3D live aperture-lens (extracted from D5), exported from `@ip/ui`.

**Rollout (Task 7+) — the other 33 screens, applied via the now-global tokens + primitives; per-wave detail plan authored after the pilot locks the pattern.**

---

## Task 1: Lucent token layer + fonts (the reskin foundation)

**Files:**
- Modify: `frontend/apps/candidate/app/globals.css` (`:root` values `16-98`; delete `.dark` `100-156`; delete `@custom-variant dark` line `8`; keep the `@theme inline` names)
- Modify: `frontend/apps/candidate/app/layout.tsx` (font imports + `<html>`/appearance wiring)

**Interfaces:**
- Produces: the same semantic token NAMES (`--bg --surface --surface-2 --ink-deep --ink --ink-2 --ink-3 --line --line-2 --primary --primary-hover --primary-foreground --ring --good --warn --danger`) now holding **Lucent light values**, plus NEW tokens (`--surface-glass --surface-glass-2 --line-glass --hair --lume --focus --irid --irid-soft --irid-conic --lens-core --lens-glow-1 --lens-glow-2 --shadow-sm --shadow-lift --sheen`) and CSS vars for fonts (`--font-display`=Clash Display, `--font-sans`=General Sans, `--font-mono`=Geist Mono). Everything downstream (`.ap-*`, `@ip/ui`) inherits.

- [ ] **Step 1: Load the Lucent fonts.** In `app/layout.tsx`, remove the `Hanken_Grotesk, Schibsted_Grotesk` imports; keep `Geist_Mono`. Add Fontshare via a stylesheet link in `<head>` (Fontshare has no `next/font` loader):

```tsx
// in <head> (or a top-level layout <link>), before <body>:
<link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
<link
  href="https://api.fontshare.com/v2/css?f[]=clash-display@500,600,700&f[]=general-sans@400,500,600&display=swap"
  rel="stylesheet"
/>
```

Set the CSS vars the app already keys on: keep `Geist_Mono` bound to `--font-mono`; in `globals.css` set `--font-display: 'Clash Display', var(--font-sans), sans-serif;` and `--font-sans: 'General Sans', ui-sans-serif, system-ui, sans-serif;` (the `@theme` block already forwards these).

- [ ] **Step 2: Swap `:root` to the Lucent light palette.** Replace the values in `globals.css:16-98` (keep the names). Core set (from `docs/brand/redesign-v4/D5-lucent.html`, verbatim OKLCH):

```css
:root{
  color-scheme: light;                 /* light only */
  --bg:        oklch(0.985 0.004 265);
  --bg-2:      oklch(0.955 0.006 265);
  --surface:   oklch(1 0 0);
  --surface-2: oklch(0.965 0.006 265);
  --surface-glass:   rgba(255,255,255,0.62);
  --surface-glass-2: rgba(255,255,255,0.80);
  --ink-deep:  oklch(0.16 0.012 265);
  --ink:       oklch(0.20 0.012 265);
  --ink-2:     oklch(0.42 0.014 265);
  --ink-3:     oklch(0.56 0.014 265);
  --line:      oklch(0.90 0.006 265);
  --line-2:    oklch(0.83 0.008 265);
  --line-glass: rgba(22,24,40,0.10);
  --hair:      rgba(22,24,40,0.06);
  --focus:     oklch(0.55 0.15 258);
  /* brand accent = the deep spectral used on CTAs (white-legible: measured 5.5–8.5:1) */
  --primary:            oklch(0.53 0.25 300);
  --primary-hover:      oklch(0.49 0.26 300);
  --primary-foreground: #ffffff;
  --ring: var(--focus);
  /* spectral system (vibrant, minimal) */
  --irid: linear-gradient(115deg, oklch(0.70 0.19 250), oklch(0.64 0.24 292), oklch(0.68 0.23 335), oklch(0.80 0.16 40));
  --grad-cta: linear-gradient(120deg, oklch(0.56 0.20 258), oklch(0.53 0.25 300), oklch(0.58 0.23 340));
  --lens-core:   oklch(0.60 0.22 262);
  --lens-glow-1: oklch(0.70 0.20 262 / 0.55);
  --lens-glow-2: oklch(0.68 0.22 330 / 0.44);
  --shadow-sm:   0 1px 2px rgba(38,44,76,0.05), 0 4px 12px -5px rgba(38,44,76,0.10);
  --shadow-lift: 0 2px 6px -2px rgba(38,44,76,0.07), 0 16px 34px -14px rgba(38,44,76,0.13), 0 42px 80px -52px rgba(38,44,76,0.22);
  --sheen: rgba(255,255,255,0.92);
  --good:   oklch(0.62 0.13 150);
  --warn:   oklch(0.70 0.14 70);
  --danger: oklch(0.58 0.20 25);
  /* keep the existing --step-*, --display, --maxw type scale (already "larger, confident") */
}
```

Remap the teal/coral/gold aliases so `.ap-*` primitives that reference them stay coherent: `--teal: var(--primary); --teal-strong: var(--primary-hover); --teal-ink: #fff; --coral: oklch(0.68 0.20 25); --gold: oklch(0.74 0.14 75);` (keep the `--*-soft/-glow/-ink` derivations pointing at these).

- [ ] **Step 3: Delete the dark layer.** Remove `globals.css` line 8 (`@custom-variant dark …`) and the entire `.dark { … }` block (`100-156`). Remove any `dark:` utilities that now dangle (grep `dark:` under `app/` + `components/`; there should be none in the reskinned surfaces — fix as found).

- [ ] **Step 4: De-dark the root.** In `app/layout.tsx`: set `viewport.colorScheme` to `"light"`, drop the `(prefers-color-scheme: dark)` theme-color entry, and **remove** `import { appearanceScript }` + the `<script dangerouslySetInnerHTML={{__html: appearanceScript}} />`. Leave `ApertureSprite`, providers, `Toaster` untouched.

- [ ] **Step 5: Typecheck.**

Run: `cd frontend && npx pnpm@9.15.0 --filter @ip/candidate exec tsc --noEmit`
Expected: 0 errors. (Fix any import left dangling by the removed appearance script — Task 2 fully removes the appearance module.)

- [ ] **Step 6: Commit.**

```bash
git add frontend/apps/candidate/app/globals.css frontend/apps/candidate/app/layout.tsx
git commit -m "feat(fe): Lucent light-only token layer + Clash Display/General Sans fonts"
```

---

## Task 2: Remove the dark-mode / appearance system

**Files:**
- Modify: `frontend/apps/candidate/components/candidate-shell.tsx`, `components/company-shell.tsx` (remove `<AppearanceToggle/>`)
- Delete: `frontend/apps/candidate/components/appearance-toggle.tsx`
- Modify: `frontend/apps/candidate/app/settings/appearance-client.ts`, `components/settings/appearance-tab.tsx`, `app/settings/page.tsx`, `app/settings/types.ts`, `app/settings/settings-client.ts` (strip the mode/theme portion; keep any non-theme preference the tab also holds — verify against the file before deleting whole modules)
- Modify: `app/company/settings/page.tsx` (drop the appearance section)

**Interfaces:**
- Consumes: Task 1's light-only tokens.
- Produces: no `.dark` class is ever set; no theme UI exists; Settings → Appearance either removed or reduced to non-theme prefs only.

- [ ] **Step 1:** Read each file above; identify the exact theme/mode symbols (`appearanceScript`, `useAppearance`, `mode`, `setMode`, `AppearanceToggle`, `.dark` writes). Preserve any co-located non-theme preference; only excise theme/mode.
- [ ] **Step 2:** Remove `AppearanceToggle` usages from both shells; delete `appearance-toggle.tsx`.
- [ ] **Step 3:** Remove the Appearance theme UI from the Settings tab + pages; if the tab was theme-only, remove the tab and its nav entry (this is a **look/route-content** removal explicitly requested — not a behavior/data change to the product flows).
- [ ] **Step 4: Typecheck + build checkpoint.**

Run: `cd frontend && npx pnpm@9.15.0 --filter @ip/candidate exec tsc --noEmit` → 0 errors.
Run (dev server stopped): `cd frontend && npx pnpm@9.15.0 --filter @ip/candidate build` → green.

- [ ] **Step 5: Commit.**

```bash
git add frontend/apps/candidate/components/candidate-shell.tsx frontend/apps/candidate/components/company-shell.tsx frontend/apps/candidate/app/settings frontend/apps/candidate/components/settings frontend/apps/candidate/app/company/settings/page.tsx
git rm frontend/apps/candidate/components/appearance-toggle.tsx
git commit -m "refactor(fe): remove dark mode + appearance/theme system (light-only)"
```

---

## Task 3: Glass / aurora / 3D primitives + DESIGN.md

**Files:**
- Modify: `frontend/apps/candidate/app/globals.css` (`@layer components`: add Lucent utility classes)
- Create: `frontend/packages/ui/src/aperture-lens.tsx` + export from `frontend/packages/ui/src/index.ts`
- Create: `DESIGN.md` (repo root)

**Interfaces:**
- Produces: `.glass`, `.glass-2`, `.irid-edge`, `.btn-primary` (spectral `--grad-cta`, animated, `@keyframes ctaflow`), `.bg-field` (fixed aurora mesh + hairline grid), `.grain`; a React `<ApertureLens live pointerParallax />` component (zero-dep CSS/SVG 3D, reduced-motion-safe) usable on any screen.

- [ ] **Step 1:** Port the D5 glass + aurora + button + grain CSS (from `docs/brand/redesign-v4/D5-lucent.html`, `.glass`, `.bg-field*`, `.grain`, `.btn`, `.btn-primary` + `@keyframes ctaflow`) into `globals.css` `@layer components`, referencing the Task-1 tokens. Guard all animation under the existing `@media (prefers-reduced-motion: reduce)` reset.
- [ ] **Step 2:** Extract the D5 aperture-lens (concentric rings + 6 iris blades + reticle + `--lens-glow`, `perspective` + `translateZ` layers + pointer-parallax rAF + idle spin) into `aperture-lens.tsx` as a client component; **add continuous live auto-rotation** (slow `rimspin`/`irisspin`, already present) so it moves without pointer input; static fallback under reduced-motion + SSR. No lucide value-imports (inline SVG only — @ip/ui rule).
- [ ] **Step 3:** Write `DESIGN.md` (impeccable format) capturing the locked Lucent system: palette (tokens above), type (Clash Display/General Sans/Geist Mono + scale), glass/shadow/radius, spectral/aurora usage rules ("vibrant but minimal — colour lives in aurora + lens + CTAs + small accents; surfaces stay clean glass"), motion tokens, the 3D lens, and the light-only + AA rules.
- [ ] **Step 4:** Typecheck (`--filter @ip/ui exec tsc --noEmit` + `--filter @ip/candidate exec tsc --noEmit`) → 0.
- [ ] **Step 5: Commit** (`feat(@ip/ui): ApertureLens + Lucent glass/aurora primitives + DESIGN.md`, explicit paths).

---

## Task 4: Lucent chrome — MegaNav / MegaFooter

**Files:** Modify `frontend/packages/ui/src/aperture-chrome.tsx` (structure/links/content unchanged; restyle to Lucent floating glass nav + footer; primary CTA → `.btn-primary` spectral). Remove any dark-mode branches.

- [ ] Restyle to match D5's nav (rounded floating glass bar, blur, hairline, spectral "Get started"); keep all `MegaNav` audience-aware logic + links verbatim. Footer → Lucent.
- [ ] Typecheck `@ip/ui` + `@ip/candidate` → 0.
- [ ] Browser: `preview_start candidate-mock`, screenshot nav on `:3000`, compare to D5 nav on `:4174`. Iterate to match.
- [ ] Commit (`feat(@ip/ui): Lucent glass MegaNav/MegaFooter`).

---

## Task 5: Landing hero (3D lens + aurora + role fork + search) — 1:1

**Files:** Modify `frontend/apps/candidate/components/marketing/applicants-hero.tsx` (+ `app/(marketing)/applicants-landing.tsx` wrapper for `.bg-field`/`.grain`). Mount `<ApertureLens/>`. **Content verbatim** (headline, lede, role fork, search, trust pills already exist — reuse the real data/handlers; do not change what Search or the fork DO).

- [ ] Rebuild the hero to match D5's hero section 1:1 (centered lens behind the headline, aurora field, glass eyebrow/fork/search, floating glass stat chips, spectral Search CTA). Wire the existing role-fork + search handlers unchanged.
- [ ] Browser fidelity loop: screenshot `:3000` hero vs `:4174` D5 hero; measure no-horizontal-overflow + CTA/placeholder contrast in-page (as done in design). Iterate until it matches.
- [ ] Commit (`feat(candidate/landing): Lucent hero — 3D lens, aurora, glass`).

---

## Task 6: Landing sections — 1:1 (stats · why · how · merit · audiences · trust · CTA)

**Files:** Modify the remaining `components/marketing/*` sections to match D5's Stats band, "Why Aptura", "How it works" (spectral step badges — white on `--grad-cta`), "Merit, made visible" flow, the two distinct audience cards, Trust band, final CTA. **All copy/data verbatim from the current components** (the real landing already carries the richer product copy — keep it; only restyle).

- [ ] Restyle each section to Lucent (glass cards, spectral accents used minimally, scroll focus-pull reveals with reduced-motion + JS-off fallbacks). One section per commit.
- [ ] Per section: screenshot `:3000` vs the matching D5 block on `:4174`; verify contrast + overflow; commit.
- [ ] Checkpoint after the last section: `--filter @ip/candidate build` green (dev stopped); full-page `:3000` landing screenshot vs D5.

---

## Task 7+: Rollout to the remaining 33 screens (procedure — detailed per-wave plan authored after the pilot)

The pilot (Tasks 1–6) locks the token layer, primitives, `<ApertureLens/>`, glass, motion, and the fidelity loop. Every other screen already inherits the Lucent palette/type from Task 1; rollout is **apply the primitives + verify**, wave by wave, mirroring the original build waves. **Per-screen procedure (repeat, one commit each):**

1. Serve the screen on `:3000` (mock mode) for its role; screenshot the current state.
2. Apply Lucent: swap ad-hoc styling to the `.ap-*`/`.glass`/`.btn-primary` primitives; add glass/lens/aurora only where it earns its place (product screens stay calmer than the landing); ensure the screen's existing data hooks, queries, and mock/real seams are untouched.
3. Verify: `tsc --noEmit` 0 · contrast ≥AA · no overflow · reduced-motion ok · **behavior unchanged** (same queries fire, same handlers) · screenshot signed-in for the role.
4. Commit with explicit paths.

**Waves (screen inventory — from `docs/superpowers/plans/v3-screens/_index.md`):**
- **W1 Auth + entry:** `/login /register /forgot /reset /verify /onboarding /company/register /company/onboarding`
- **W2 Candidate core:** `/` (dashboard) `/jobs /jobs/[id] /saved /alerts /applications/[id] (+/outcome) /companies/[id] /profile`
- **W3 Interview + assessment (⚠ proctored invariants frozen; interview room may keep a deliberate dark focus-surface exception — confirm with user):** `/interview/[id] (+/lobby +/done) /aptitude/[id] /practice`
- **W4 Feedback + comms:** `/feedback/[id] /sample-report /messages (+/[id]) /notifications /schedule /settings`
- **W5 Recruiter `/company/*`:** `/company (dashboard) /company/jobs (+/new +/[id] +/edit) /company/jobs/[id]/applicants/[appId] (+/schedule) /company/talent /company/analytics /company/rubrics /company/team /company/branding /company/audit /company/billing /company/settings`
- **W6 Marketing/info:** `/hiring-teams /trust /ai-explainability /what-we-dont-do /accessibility /pilot /waitlist /status` + `(legal)` pages
- **Checkpoint each wave:** `--filter @ip/candidate build` green + a role-based screenshot set.

**Deferred / optional (separate task, only if requested):** a lazy-loaded `react-three-fiber` low-poly hero model (code-split, static fallback, reduced-motion-safe) as a heavier "real 3D" upgrade over the zero-dep `<ApertureLens/>` on the landing hero only.

---

## Self-Review

- **Spec coverage:** ✅ light-only (T1–T2), Lucent tokens/type (T1), glass/3D/effects (T3), landing 1:1 (T4–T6), all 33 other screens (T7 waves), 3D lightweight default + optional r3f (T3 + deferred), frozen content/behavior both sides (Global Constraints + every task), backend untouched (Global Constraints).
- **Placeholder scan:** token values, file paths, removal targets, and verification commands are concrete. The rollout (T7) is intentionally a **procedure + inventory**, not 33 pre-written screen diffs — its per-wave detail is authored after the pilot, because the pilot defines the exact primitive set each screen reuses (writing 33 screens of diffs now would be premature guesswork, i.e. real placeholders).
- **Consistency:** token names preserved from the existing `@theme`; new names (`--grad-cta`, `--irid`, `--surface-glass`, `<ApertureLens/>`, `.glass`, `.btn-primary`) are defined in T1/T3 and reused verbatim in T4–T7.
- **Open item flagged:** interview room dark-surface exception (W3) — confirm with the user during the pilot.
