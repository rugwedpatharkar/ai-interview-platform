# Aptura v3 — Frontend Polish Checklist

> Polish pass over the Midnight v3 reskin. Goal: extremely attractive, robust, snappy (no lag), with
> minimal/optimal/beautiful micro-interactions. Run through the **impeccable** audit framework + the
> **product register** (design serves the task: one tuned sans, fixed rem scale, skeletons, state-rich,
> motion conveys state). Implement ALL items; mark `[x]` on completion. Frontend-only; behavior preserved.

**Health baseline:** ~15/20 (Good). Anti-pattern verdict: clean palette, one register mismatch (serif-on-data).

---

## Wave A — Foundation + P1 fixes ("feels pro / no lag" core)

- [x] A1. **Register fix — pull serif off product data.** Keep Fraunces (`font-display`) on the marketing
  landing + page-level titles/greetings ONLY. Revert `font-display` on KPI numbers, table data, badges,
  small labels, section sub-headings → Geist (sans) + `tabular-nums` for figures. (~80 usages audited.)
- [x] A2. **Fixed rem type scale for product UI** _(verified: app uses fixed Tailwind text-* scale; no clamp() in app components)_ (no fluid `clamp()` in app screens; clamp stays on the
  landing only). Verify/normalize heading sizes to a fixed Tailwind scale.
- [x] A3. **Skeletons, not spinners/blank** — add skeleton loaders to: candidate dashboard, recruiter
  dashboard, applicants table, talent, marketplace results, applicant report, messages, notifications.
- [x] A4. **Light-mode contrast** — bump `--muted-foreground` (and verify accent-on-white) to ≥4.5:1.
- [x] A5. **Browser-verify the authed sidebar shells** structurally (no backend here → verify render/overflow
  with a forced session or shell-only render; flag anything off).

## Wave B — Micro-interactions (minimal · optimal · beautiful; mostly CSS)

- [x] B1. **Card press** state on clickable cards (`active:scale-[0.99]`) — JobCard, ApplicationCard via Card.
- [x] B2. **Nav-item** hover/press polish; unify candidate↔company active state (left cyan accent + transition).
- [x] B3. **List stagger on mount** (job cards, applicants, notifications, messages) — reuse `slide-up`
  keyframe + capped `animationDelay` (≤6 items, total <250ms).
- [x] B4. **Tab indicator slide** (animated active indicator instead of snap).
- [x] B5. **KPI count-up** on dashboard stats (rAF hook + `matchMedia` reduced-motion guard + `tabular-nums`).
- [x] B6. **Fix existing motion** — `competency-card` linear → `ease-out`; trim `score-ring` 500ms→350ms.
- [x] B7. **Origin-aware dropdown zoom** (`scale-in` keyframe + Radix transform-origin).
- [x] B8. **Route cross-fade** via `template.tsx` (CSS opacity, not framer).
- [x] B9. **Checkbox/radio check-pop** (short scale+fade on the indicator).
- [x] B10. **Skeleton shimmer** upgrade (directional sweep; pulse as reduced-motion fallback).

## Wave C — Simplifications (DRY; less code, fewer bugs)

- [x] C1. **Shared `AppShell` sidebar** in `@ip/ui` — collapse candidate-shell (243) + company-shell (224)
  (~80% identical) into one config-driven shell. Preserve per-role nav + gates.
- [x] C2. **Lift `auth-split-panel`, `credentials-form`, `sso-buttons` into `@ip/ui`** (duplicated across apps).
- [x] C3. **Shared status-pill helper** (the `PILL`/`jobStatus`/`STATUS_*` map redefined in 3 files).
- [x] C4. **Shared `PageHeader`/section primitive** (serif page-head boilerplate copy-pasted per page).

## Wave D — Optimizations + remaining fidelity/enhancements

- [x] D1. **Memoize** derived values + heavy maps (dashboard KPIs, funnel data, table row maps; stabilize
  callbacks) — zero memoization today.
- [x] D2. **List windowing** where a list can exceed ~50 rows (applicants, talent, notifications, messages)
  — add `@tanstack/react-virtual` OR a pragmatic cap/"show more" if a dep is unwarranted.
- [x] D3. **Code-split** heavy/below-fold via `next/dynamic` (assistant chat, future editor/LiveKit/MediaPipe
  stubs, charts).
- [x] D4. **Onboarding fidelity** — `candidate-checklist`, `employer-firstrun`: remove raw `brand-*`, lay out
  to the card rhythm.
- [x] D5. **Lightly-reskinned pages → mockup rhythm** (marketplace grid + any page that only got a page-head).
- [x] D6. **Drop the landing "eyebrow" trope** ("UNIFIED HIRING PLATFORM" tracked-uppercase kicker) — replace
  cadence or make it a single deliberate brand element.
- [x] D7. **Empty/error states on-brand** — verify icon + teaching copy (not bare "nothing here").

## Verification gate (per wave)
- `npx pnpm@9.15.0 --filter @ip/{candidate,company} exec tsc --noEmit` clean.
- Final: production `build` both apps green; browser-verify landing + a couple screens; reduced-motion respected.
- Behavior preserved (queries/handlers/seams unchanged); no hardcoded color; commit per wave (explicit paths).
