# Frontend — Landing / marketing (`/` signed-out) · Midnight redesign

> **Screen & goal.** The public, crawlable, SSR marketing front door. Reskin the existing v2 marketing
> tree into the Midnight Intelligence scheme: deep-indigo base, electric-cyan accent, Fraunces display.
> **Zero behavior change** — same sections, same hero search → `/jobs`, same role fork, same copy.
> **Route(s) + role.** `/` (signed-out branch of `app/page.tsx`) · **public** (token-free, crawlable).
> **Mockup.** ✓ `docs/brand/redesign-v2/landing.html` (hero · stats · diffs · steps · merit · features · trust).
> **Existing code it reskins (exact paths):**
> - `frontend/apps/candidate/app/page.tsx` (the signed-out `<MarketingLanding/>` branch — unchanged logic)
> - `frontend/apps/candidate/app/(marketing)/marketing-landing.tsx` (section spine)
> - `frontend/apps/candidate/app/(marketing)/content.ts` (static copy — **do not touch** the strings; the copy-guard test locks them)
> - `frontend/apps/candidate/components/marketing/{marketing-nav,hero,role-fork,stat-strip,diff-strip,how-it-works,merit-flow,feature-columns,value-pills,testimonial,final-cta,marketing-footer}.tsx`

---

## Layout & components

This is the **one marketing surface** — it does **not** use the `.app` sidebar/topbar shell. It is a vertical
section stack on `var(--bg)` with two brand-gradient bands (hero + final CTA). Map mockup → `@ip/ui`/tokens:

| Region (mockup) | Component | Midnight classes / tokens |
|---|---|---|
| Top nav | `MarketingNav` | sticky bar; `border-b border-[var(--line)]`, `bg-[color-mix(in_oklch,var(--bg)_82%,transparent)] backdrop-blur`; `Logo`, `ThemeToggle`, `buttonVariants` (cyan `--accent` primary) |
| Hero band | `Hero` + `RoleFork` (client) | gradient band → cyan glow on indigo (`--accent`/`--accent-strong`), not the old violet `#7c3aed→#4f46e5`; `aperture`/`glow` decorative divs (`aria-hidden`); `h1` in `--font-display` Fraunces; search `Input`s + `Button` |
| Stat strip | `StatStrip` | `border-y border-[var(--line)] bg-[var(--surface)]`; the number in `--font-display`, `text-[var(--accent)]`, `.tnum` for figures; labels `--ink-2` |
| Why / diffs | `DiffStrip` | 3 `Card`s; icon chip on `--accent-soft`/`--accent-ink`; `eyebrow` in `--font-mono` uppercase `--ink-3` |
| How it works | `HowItWorks` (`id="how-it-works"`) | 4 numbered steps; accent number circles |
| Merit flow | `MeritFlow` | horizontal node flow with arrows; nodes on `--surface-2`, accent edges |
| Two-sided | `FeatureColumns` | twin `Card`s (candidates / companies) with `CheckCircle2` checklists + CTA |
| Trust pills | `ValuePills` | `Badge` (outline) pills; "Proctored integrity" included |
| Testimonials | `Testimonial` | two quotes; amber star row allowed **only** here |
| Final CTA | `FinalCta` | second gradient band; dual buttons → `/jobs` + `COMPANY_HIRE_HREF` |
| Footer | `MarketingFooter` | `LogoMark` + 3 link columns + `FOOTER_TAGLINE` |

**New vs reused.** No new components — every primitive already exists from v2. The redesign is markup/class swaps
only. Reuse `@ip/ui`: `Logo`, `LogoMark`, `Button`/`buttonVariants`, `Card`, `Badge`, `Input`, `ThemeToggle`, `cn`.

## Data wiring / seam

- **No data fetch, no query keys.** The only interactive seam is the hero's `router.push("/jobs?q=…&location=…")`
  (kept byte-for-byte) and the `RoleFork` seeker/hirer toggle. Stats are static constants in `content.ts`.
- Fields consumed: the static content models `HERO · STATS · DIFFERENTIATORS · STEPS · MERIT_FLOW · FEATURES ·
  VALUE_PILLS · TESTIMONIALS · COMPANY_HIRE_HREF · FOOTER_TAGLINE` — **identical to today**.
- Backend: none. See `backend_landing.md` (the hero search rides marketplace's live `discovery.searchJobs` /
  `/public/jobs` on the **next** page, not here).

## Tasks (Task 0 skipped — mockup ✓)

> Reskin only. Keep every handler, route push, and the content strings identical; change markup + classes to match
> `landing.html`. Per task: build + browser-verify on the `:4173` preview + explicit-path commit.

- **Task 1 — Nav + Footer bookends.** Reskin `marketing-nav.tsx` + `marketing-footer.tsx` to the Midnight bar/footer
  (token borders, cyan primary CTA, `ThemeToggle`). Verify: `--filter @ip/candidate typecheck`. Commit
  `frontend/apps/candidate/components/marketing/marketing-nav.tsx marketing-footer.tsx`.
- **Task 2 — Hero band.** Swap the violet gradient for the cyan-on-indigo hero (glow + aperture decorative divs,
  Fraunces `h1`), keep `RoleFork`, the search `<form>` + `router.push`, the "Post a job" hirer branch, and the
  `HERO.micro` pill row **unchanged**. Browser-verify search routes to `/jobs?q=…`. Commit the two files.
- **Task 3 — Mid bands.** Reskin `stat-strip` (accent figures, `.tnum`), `diff-strip` (accent icon chips),
  `how-it-works`, `merit-flow` to match the mockup's `sec`/`stats`/`diffs`/`steps` blocks. Commit.
- **Task 4 — Two-sided + trust + final CTA.** Reskin `feature-columns`, `value-pills`, `testimonial`, `final-cta`
  (second gradient band). Commit.
- **Task 5 — Verify whole page.** `--filter @ip/candidate build` clean (stop `pnpm dev` first); preview `/` signed
  out: full page renders, hero search routes, role fork swaps to "Post a job", dark+light both correct, mobile
  stacks. Screenshot. Confirm a signed-in candidate still lands on `<Dashboard/>` (marketing tree not shown). Commit.

## States & a11y

- **States.** Static surface — **no loading/empty/error data states**. Interactive: `RoleFork` (seeker/hirer) +
  hero search `<form>` (navigates). SSR renders immediately.
- **Responsive.** Hero search stacks (row → column); 4-up stat grid → 2-up; feature twin columns → single;
  merit flow → vertical with down-arrows; nav collapses secondary links.
- **Dark + light.** Tokens only between bands → automatic via `--bg`/`--surface`/`--accent`. The two gradient bands
  stay cyan-on-indigo (white text) in both themes. No hardcoded hex except the intentional gradient band stops.
- **A11y.** `RoleFork` is `role="tablist"` + `aria-selected`; hero search is a labelled `<form>`; decorative
  glow/aperture are `aria-hidden`; one `<h1>`; section landmarks; `:focus-visible` cyan ring; contrast ≥4.5:1.

## Acceptance

- Matches `redesign-v2/landing.html` (11 sections, cyan/indigo Midnight, Fraunces display).
- `--filter @ip/candidate build` + `typecheck` green.
- **Zero functional diff** — same sections, same `router.push("/jobs?…")`, same role fork, same `content.ts`
  strings (copy-guard test still passes); mock→real path unchanged (there is none here).
