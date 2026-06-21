# Aptura v3 — Design Language (Direction D · "Aperture Pro")

> **Single source of truth for every per-screen plan in this folder.** Every `frontend_<slug>.md`
> links here for tokens, fonts, type scale, components, motion, anti-slop bans, and the mandatory
> revamp rule. Do not duplicate any of this content per-screen — link it.

## 🚨 Mandatory revamp rule — applies to EVERY screen

This is a **complete, ground-up rebuild** of the Aptura frontend, not a reskin in place.

1. **You are NOT modifying the existing UI.** You are **rebuilding** each screen from scratch so that it
   matches Direction D — *Aperture Pro* — exactly. The previous component markup, the previous Tailwind
   classes, the previous layouts: **assume they will be deleted.** Do not "tweak" — replace.
2. **Each screen must look 1:1 like the approved Aperture Pro design language**, applied to that screen
   with the data and states it owns. The landing page **demo** below is the worked example; every other
   screen is built using the same tokens, type scale, components, motion, and rhythm.
3. **Backend contracts are FROZEN** (separate session owns `src/`, `*.proto`, `packages/api-client/src/gen/*`).
   Reuse every existing data hook / mock seam exactly. Behavior must be unchanged; **only the UI is new.**
4. **Fidelity is non-negotiable.** Implementation must match the per-screen mockup (or this design language
   when there is no per-screen mockup yet). Verify with screenshots before declaring a screen done.
5. **Strict proctored-interview invariants are part of the design language too** — camera + mic required,
   NO mute, NO camera-off, fullscreen-locked, on-device detectors, HIGH-severity auto-end is
   server-authoritative. The UI must not introduce any control that violates these rules.

## The approved direction — Aperture Pro

- **Live demo:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
  — viewable in the launch-preview panel, fully responsive, dark + light.
- **Screenshots:** see [`docs/brand/redesign-v3/directions/screenshots/`](../../../brand/redesign-v3/directions/screenshots/)
  for `D-aperture-pro-light-full.jpeg`, `D-aperture-pro-light-hero.jpeg`, `D-aperture-pro-dark-full.jpeg`,
  `D-aperture-pro-dark-hero.jpeg`.

The landing-page demo embodies the full system at one altitude. App screens use a subset — the same
tokens, same type scale, same components, same motion vocabulary — applied with the layout grammar
their data calls for.

## Anti-fiction rule (read before you write copy or visuals)

Aptura is **pre-launch**. The demo strips every fabricated claim — no fake customer logos, no
unearned outcomes, no certifications we haven't earned. Apply the same rule on every screen:

- **No fake customer names, logos, testimonials, outcomes, percentages, or ratings.** If a screen
  needs example data (e.g., empty-state previews, sample reports), label it explicitly as
  "Sample" / "Example" and use generic names ("Sample candidate", "Candidate A").
- **No claimed certifications we haven't earned** (SOC 2 Type II, ISO 27001, AEDT-144 audited,
  Holistic AI). Use the truthful framing: "design-aligned", "on the roadmap", "scheduled
  pre-launch", "target".
- **No claimed integrations we haven't built.** Greenhouse / Lever / Workday / Ashby etc. are
  **roadmap**, not "native". The product runs standalone today with email + CSV handoff.
- **What we CAN claim** (architectural truths the product enforces today):
  - one strictly proctored AI interview per role; no second takes
  - camera + mic required; no mute; no camera-off; fullscreen-locked
  - 40+ on-device proctoring signals; only typed events leave the browser
  - HIGH-severity events trigger server-authoritative auto-end
  - evidence-based competency report with integrity timeline
  - advisory by design — a human signs every outcome
  - every applicant gets an answer + reason (no ghosting)

## Tokens — OKLCH (light is default)

### Light (`:root`)

```css
--bg:        oklch(0.985 0.003 215);
--surface:   oklch(1 0 0);
--surface-2: oklch(0.965 0.005 215);
--surface-3: oklch(0.94 0.008 215);
--ink-deep:  oklch(0.15 0.022 230);   /* h1, strong */
--ink:       oklch(0.22 0.022 230);   /* body */
--ink-2:     oklch(0.46 0.02 228);    /* secondary text — ≥4.5:1 on --bg */
--ink-3:     oklch(0.60 0.018 228);   /* tertiary, meta */
--line:      oklch(0.915 0.006 215);
--line-2:    oklch(0.85 0.008 215);
--line-3:    oklch(0.78 0.01 215);

--teal:        oklch(0.52 0.10 195);  /* primary — CTAs, score ring, links */
--teal-strong: oklch(0.46 0.10 198);
--teal-soft:   oklch(0.52 0.10 195 / 0.10);
--teal-glow:   oklch(0.62 0.10 195 / 0.16);
--teal-ink:    oklch(0.99 0.01 200);

--coral:      oklch(0.66 0.17 32);    /* "answered/human" accent — sparingly */
--coral-soft: oklch(0.66 0.17 32 / 0.12);
--coral-ink:  oklch(0.99 0.01 60);

--gold:      oklch(0.72 0.13 78);     /* integrity-instrument surfaces only */
--gold-soft: oklch(0.72 0.13 78 / 0.16);

--good:    oklch(0.62 0.13 155);
--warn:    oklch(0.74 0.16 75);
--danger:  oklch(0.60 0.22 25);
```

### Dark (`.dark`)

```css
--bg:        oklch(0.165 0.018 225);
--surface:   oklch(0.215 0.022 225);
--surface-2: oklch(0.27 0.024 225);
--surface-3: oklch(0.32 0.026 225);
--ink-deep:  oklch(0.98 0.006 210);
--ink:       oklch(0.96 0.008 210);
--ink-2:     oklch(0.77 0.015 212);
--ink-3:     oklch(0.62 0.015 212);
--line:      oklch(0.325 0.022 225);
--line-2:    oklch(0.40 0.022 225);
--line-3:    oklch(0.48 0.022 225);

--teal:        oklch(0.80 0.12 192);
--teal-strong: oklch(0.84 0.11 190);
--teal-soft:   oklch(0.80 0.12 192 / 0.16);
--teal-glow:   oklch(0.80 0.12 192 / 0.26);
--teal-ink:    oklch(0.18 0.04 220);

--coral:      oklch(0.74 0.15 33);
--coral-soft: oklch(0.74 0.15 33 / 0.18);
--coral-ink:  oklch(0.20 0.04 30);

--gold:      oklch(0.84 0.12 86);
--gold-soft: oklch(0.84 0.12 86 / 0.20);

--good:    oklch(0.78 0.14 156);
--warn:    oklch(0.82 0.14 78);
--danger:  oklch(0.70 0.18 28);
```

### Per-user Appearance — accent + base

The Appearance feature (Settings → Appearance) maps the locked Aptura defaults to a per-user choice:

- `mode` ∈ `system|light|dark` — default `system`
- `base` ∈ `aperture|azure|mint|slate` — default `aperture` (the tokens above)
- `accent` ∈ `cyan|teal|lime|emerald|amber|coral|azure|custom` — default `teal`
- `accentHue` 0–359 (custom only) — clamped to a fixed OKLCH L/C ramp so AA contrast is guaranteed

All screens read `--teal` (the resolved accent) and the resolved base palette — never hard-code a hue.

## Typography

- **Display / headings:** `Schibsted Grotesk` (wght 400–800). Loaded via Google Fonts in the root layout.
- **Body / UI:** `Hanken Grotesk` (wght 400–700).
- **Data / mono labels:** `Geist Mono` (wght 400–600) — used only for keys, timestamps, integrity
  labels, code excerpts, status labels.
- **Italic is reserved.** Use the `<em>` token (rendered as teal medium-weight non-italic) for
  semantic emphasis in body copy. Don't import italic faces; don't fake-italicize headlines.

### Type scale — bigger by design

```css
--step--2: 0.75rem;     /* 12px micro mono */
--step--1: 0.84rem;     /* 13.5px small labels */
--step-0:  1.0625rem;   /* 17px body — primary */
--step-1:  1.21rem;     /* 19.4px lead */
--step-2:  clamp(1.4rem, 1.05rem + 1.2vw, 1.75rem);   /* h3 22.4–28 */
--step-3:  clamp(1.85rem, 1.35rem + 2.1vw, 2.55rem);  /* h2 30–41 */
--step-4:  clamp(2.4rem, 1.75rem + 3vw, 3.5rem);      /* sub-display 38–56 */
--display: clamp(2.9rem, 1.6rem + 5.4vw, 5.25rem);    /* h1 46–84 */
```

- `text-wrap: balance` on h1–h3. Display letter-spacing floor `-0.04em` (never tighter).
- Body line length capped 65–75ch. Body color is `--ink-2` on `--bg` (≥4.5:1 contrast).
- Headings (`h1/h2/h3`) carry `class="display"` or use the Schibsted Grotesk family directly.
- Mono labels are ONLY for data — never for body copy and never as decorative "kicker eyebrows".

## Components & primitives (reuse, don't reinvent)

Move these into `@ip/ui` so every screen pulls from one source. Names below match the demo file.

### Shell
- **Top utility rule** — pre-launch announcement band; coral pill + meta + right-aligned link.
- **Sticky mega-nav** — backdrop-blurred, brand mark + 6 nav links (one mega-menu trigger), audience
  switch (`For Companies` / `For Candidates`), `Sign in`, primary CTA.
- **Mega-panel** — 3-column dropdown with categorized items (icon + title + one-line subtitle).
- **App shell** — `.app` sidebar + topbar layout for authenticated screens; same tokens, same nav.
- **Auth split-panel** — two-column auth screens; the form lives on the right, brand imagery on the left.

### Buttons
- `.btn` base · `.btn-primary` (teal) · `.btn-ghost` (outlined) · `.btn-coral` (candidate CTAs) · `.btn-sm` · `.btn-lg`
- 12px radius, 46px default height, 6–8px inner gap, subtle shadow on primary, translateY(1px) on active.

### Surfaces & cards
- `.cell` — bento cell (22px radius, 1px border, 1.4rem padding); supports `tag` micro-label top-right.
- `.cell.anchor` — large anchor cell (≥4 columns wide, gradient-tinted teal-soft background).
- `.itl` — Integrity Timeline container (24px radius, 1.6rem padding, white surface).
- `.def-panel` — defense/privacy panel (22px radius, tinted gradient backgrounds, themed icon).
- `.trust-band` — wide trust/compliance container, 24px radius, internal 4-col grid + badge row.
- `.finalcta` — wide dual-audience CTA card (28px radius, teal+coral gradient).
- Never nest cards inside cards.

### Pills, badges, status
- `.status` — pill with leading dot; `.status.live` pulses (reduced-motion-safe).
- `.pill` · `.pill-good` · `.pill-warn` · `.pill-danger` · `.pill-teal` · `.pill-coral`.
- `.badge` — compliance/identifier chip; small mono+text combo.

### Data UI primitives
- `.stats-grid` + `.stat` — 4-column stats band; large display number + 1-line description; mono unit.
- `.ring` — score ring (conic-gradient donut on `--surface-3`); fill is `--teal`. Use for any 0–100 score.
- `.bar` (+ `.bar > .t > i`) — competency / progress bar; 5px height, 999px radius; mono value to the right.
- `.bars` — grid container for bars.
- Match cards (`.match > .card`) — avatar + name + role + percent; for ranked-list UI.

### Hero / live HUD (interview surface)
- `.hud` — fullscreen-locked interview frame; 24px radius, soft shadow, topbar + stage + integrity strip.
- `.hud-stage` — 16:9 dark-gradient video tile with `interviewer-name`, `timer`, `self`, `hud-caption`.
- `.hud-strip` — 4-column status chips (`Face / Gaze / Mic / Integrity`); `.hud-chip.good`.
- `.hud-toast` — floating "Evidence captured" toast anchored to the HUD.

### Integrity timeline
- `.itl-track` — scrubber track (80px tall, gradient surface) with severity pips and a coral scrubber.
- `.itl-pip.l/.m/.h` — Low/Medium/High pips with shadow halo per severity.
- `.itl-events` — 3-column event-card row below the track; `.event.expanded` highlights the active pip;
  `.event .clip` shows the evidence excerpt and the auto-action reason.

### Walkthrough (Linear-style acts)
- `.acts > .act` — 3-column row: number column (`.act-num` with mono step label), copy column, visual column.
- Per-act mini visuals — `.mini-identity`, `.mini-room`, `.mini-timeline`, `.mini-rubric`, `.mini-decision`.

### Compare / FAQ / tables
- `.compare-table` — 4-column comparison; `.us-col` tints the Aptura column; `.yes` / `.no` / `.mid`.
- `<details>` accordion — Schibsted summary; `[+]→[×]` rotate-on-open marker; audience pill.

### Footer
- `.bigfoot` — 6-column sitemap (brand + 5 link columns); badges row inside the brand column;
  `.foot-bottom` with copyright + legal + direction marker.

## Iconography

- Lucide-style outline icons, 1.5–2px stroke. The aperture mark is the brand; reuse the `<symbol
  id="mark">` from the demo SVG sprite.
- Icons that already live in the demo sprite: `mark · check · x · shield · shield-check · eye · lock ·
  cam · mic · bolt · user · users · briefcase · grid · report · timer · bell · globe · spark · dl ·
  arrow · building · heart · academy · dollar · bag · chip`. Add more by extending the sprite — do
  not import icon images per page.

## Motion vocabulary

- Tokens (light + dark identical):
  - `--ease-out: cubic-bezier(.16, 1, .3, 1)` — premium ease, used for almost everything
  - `--dur-fast: 150ms` · `--dur-mid: 240ms` · `--dur-slow: 700ms`
- Reveal / entrance: `.rise` (translateY(14px) → 0 + opacity), staggered with `.d1`…`.d6` delay classes.
- Status pulse: `.status.live .dot` — radial shadow pulse, paused under `prefers-reduced-motion`.
- Hover: 18ms transition on background, border, transform; never animate layout properties.
- Reveals must enhance content that is already visible — never gate visibility on a scroll trigger
  (HMR / SSR / reduced-motion safety).
- Every animation MUST have a `@media (prefers-reduced-motion: reduce)` no-op.

## Layout grammar

- Container: `width: min(100% - 2.5rem, 1240px)` centered. Use `.wrap` everywhere.
- Section rhythm: `padding: clamp(4rem, 7vh, 6rem) 0`. Vary internal padding for emphasis.
- Section heads: `.section-head` (one column) or `.section-head.two-col` (title + lead lead-in).
- Always use **Flexbox for 1D**, **Grid for 2D**. Don't default to grid where `flex-wrap` is simpler.
- Responsive grids without breakpoints: `grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))`.
- Two-column at `>= 1100px`, stack at `<= 760px`. Hide nav links at `<= 760px`; show audience-switch
  only at `>= 760px`.
- z-index scale (semantic, never arbitrary): `dropdown < sticky < modal-backdrop < modal < toast < tooltip`.

## Responsive — works on every device, every aspect ratio

This section is a hard requirement. Every screen must render correctly and feel native on
the device matrix below, in both orientations. **No horizontal scrolling at any viewport
width ≥ 320 px.** Every frontend plan inherits this section by reference and adds a
"Responsive verification" sub-task to its final task.

### Target device matrix (must render correctly)

**Mobile portrait:**
- iPhone SE / 13 mini — **375 × 667**
- iPhone 16 — **393 × 852**
- iPhone 16 Pro Max — **430 × 932**
- Android phones (Pixel / Samsung) — **360 × 800**, **412 × 915**

**Mobile landscape:** all of the above rotated; no broken layouts.

**Tablet portrait + landscape:**
- iPad mini — **744 × 1133** / **1133 × 744**
- iPad (10th gen) — **820 × 1180** / **1180 × 820**
- iPad Pro 11" — **834 × 1194** / **1194 × 834**
- iPad Pro 12.9" — **1024 × 1366** / **1366 × 1024**
- Surface Duo split — **540 × 720**

**Desktop / laptop:**
- **1280 × 800** · **1440 × 900** · **1680 × 1050** · **1920 × 1080**

**Large screens:**
- **2560 × 1440** (QHD) · **3840 × 2160** (4K) — content stays readable, not stretched.

### Breakpoint map (Tailwind v4 / CSS)

| Token | Width | Maps to |
|---|---|---|
| `xs` | ≤ 380 px | compact mobile portrait |
| `sm` | ≤ 540 px | mobile landscape / small phone |
| `md` | ≤ 768 px | small tablet portrait |
| `lg` | ≤ 1024 px | tablet portrait → small laptop |
| `xl` | ≤ 1280 px | laptop |
| `2xl` | > 1280 px | desktop / large |

### Mobile pattern conversions (the explicit rules)

| Component | ≥ 1100 px | ≤ 1100 px | ≤ 900 px | ≤ 760 px | ≤ 540 px |
|---|---|---|---|---|---|
| **Mega-nav** | full nav links visible | links hidden | hamburger reveals full-height sheet | mega-menu becomes accordion inside sheet | — |
| **App sidebar** | always visible | always visible | slide-out drawer from topbar | drawer with overlay | — |
| **Hero (split)** | side-by-side | side-by-side | stacks (visual on top) | stacks; CTAs full-width | — |
| **Bento grid** | 6 cols | 4 cols | 2 cols | 2 cols | 1 col |
| **Stats grid** | 4 cols | 2 cols | 2 cols | 1 col | 1 col |
| **Table data** | full table | full table | scrollable horizontal | **converts to card stack** (each row → self-contained card with label : value pairs) | card stack |
| **Modal / dialog** | centered card | centered card | centered card | **bottom sheet** with drag-handle | full-screen sheet |
| **Master / detail** | side-by-side | side-by-side | **stacks** with back-button to return | stacks | stacks |
| **Pickers** (date / time / colour) | popover | popover | popover | **full-screen** | full-screen |
| **Forms** | multi-column | multi-column | single-column | labels above inputs | labels above inputs, sticky footer CTAs |
| **Walkthrough acts** | 3-col (num · copy · visual) | 3-col | 2-col (num+copy / visual) | 1-col | 1-col |
| **Defence split** | 2 panels side-by-side | 2 panels | stacked | stacked | stacked |
| **Compare table** | 4-col | 4-col | 2-col with role swap | single column per competitor | single column per competitor |
| **Footer sitemap** | 6 cols | 3 cols + 1 brand | 3 cols | 2 cols | 1 col |
| **Live HUD (interview)** | full HUD + integrity strip below | same | captions reposition; control bar anchored to safe-area-bottom | same | self-tile shrinks; control bar full-width |

### Touch + input rules

- **Touch targets ≥ 44 × 44 px** (Apple HIG). Material targets ≥ 48 × 48 — enforce on
  every interactive element including buttons, links, checkboxes, accordion summaries,
  pill chips, and timeline pips. Add invisible padding where the visible target is small.
- **Hover-only states MUST have a tap equivalent.** Never put information in a tooltip
  alone; never gate functionality on hover.
- **iOS safe-area insets:** all fixed bottom bars use
  `padding-bottom: max(env(safe-area-inset-bottom), 12px)`. The mobile control bar in the
  proctored-interview HUD uses `bottom: env(safe-area-inset-bottom)`.
- **Sticky elements** account for the URL bar disappearing/reappearing on mobile Safari
  (use `100dvh` not `100vh` for full-height layouts).
- **No `position: fixed`** for non-essential decoration on mobile — it causes scroll bugs
  on iOS Safari with the keyboard open.
- **iOS auto-zoom suppression:** every `<input>`, `<select>`, `<textarea>` has
  `font-size ≥ 16px`. Otherwise iOS auto-zooms on focus.
- **Drag handles:** bottom-sheet modals get a visible drag-handle (≥ 32 × 4 px) and
  swipe-down to dismiss.
- **Keyboard never covers form inputs** — use `scrollIntoView({block: "center"})` on
  focus when the input is in the lower half of the viewport.

### Performance for mobile

- **Images** use responsive `srcset` + `loading="lazy"` by default. Hero images use
  `priority` + LQIP.
- **Decorative SVGs** (large background art, the integrity-timeline scrubber glow) are
  hidden at ≤ 540 px via `display: none` or CSS-only.
- **Reduced motion** AND **slow-network** are respected:
  `@media (prefers-reduced-motion: reduce), (prefers-reduced-data: reduce)`.
- **FCP target on 3G < 1.5 s.** Critical CSS inlined, fonts preconnected, no blocking
  third-party scripts above the fold.
- **No layout thrashing** — never animate width/height/top/left; use transform/opacity.

### Mandatory verification (every frontend plan must include this as its final task)

Every `frontend_<slug>.md`'s final task includes a **"Responsive verification"** sub-task
with these exact steps:

1. **Screenshot at all 7 reference sizes:** 375 × 667 · 430 × 932 · 768 × 1024 portrait ·
   820 × 1180 portrait · 1024 × 1366 portrait · 1366 × 1024 landscape · 1440 × 900 ·
   1920 × 1080.
2. **No horizontal scroll** at any width ≥ 320 px (test with `document.documentElement.scrollWidth`).
3. **Every interactive element ≥ 44 × 44 px** when measured at the smallest breakpoint.
4. **Keyboard does not cover form inputs** on iOS Safari (manual test or
   `visualViewport.height` check).
5. **Orientation change** (portrait ↔ landscape) on iPad sizes — layout adapts gracefully,
   no clipped content.
6. **`prefers-reduced-motion`** — every animation no-ops (test by enabling reduce-motion
   in DevTools).
7. **Cross-browser:** iOS Safari, Chrome Android, Samsung Internet, desktop Safari /
   Chrome / Firefox / Edge — at minimum Safari + Chrome on every OS.
8. **Save side-by-side proof** to
   `docs/brand/redesign-v3/verify/<slug>-{mobile,tablet,desktop}.jpeg`.

A screen is NOT complete until all 8 verification steps pass. Acceptance criteria of every
plan inherit this rule.

## Anti-slop bans (enforced on every screen)

If you're about to write any of these, rewrite the element with different structure:

- **Side-stripe borders** — `border-left` > 1px as accent on cards/callouts. Use full borders, tinted
  backgrounds, leading icons/numbers, or nothing.
- **Gradient text** (`background-clip: text` over a gradient). Solid color, emphasis via weight/size.
- **Glassmorphism as default.** Rare and purposeful, or nothing.
- **Hero-metric template** (giant number, tiny label, gradient accent). SaaS cliché.
- **Identical card grids** (3 or 4 same-sized icon+heading+text cards repeated). Use the bento
  language: one anchor cell + supporting cells with rotated purposes.
- **Tiny uppercase tracked eyebrow above every section.** A single coral / teal "eyebrow" word per
  section is fine; do NOT all-caps + tracked it. Mono labels are for data, not decorative kickers.
- **Numbered section markers (01 · 02 · 03) on every section.** Use them only when the sequence
  IS information — e.g., the 5-act "How an interview happens" walkthrough.
- **Italic display fonts / fake-italic headings.** Schibsted Grotesk has no italic; use `<em>` for
  semantic emphasis (teal, medium-weight, non-italic).
- **Cream / sand / parchment body backgrounds** (the 2026 AI-warm-neutral default). Body is a cool
  near-white tinted toward the brand hue.
- **Text overflow at any breakpoint.** Test display headlines at narrow widths; rewrite copy or lower
  the clamp max.
- **Fake content of any kind** — see the Anti-fiction rule above.

## Accessibility & a11y

- Body text ≥4.5:1 contrast; large text (≥18px or bold ≥14px) ≥3:1. Placeholder ≥4.5:1.
- All interactive elements have a visible focus ring (uses `--teal` at 2px outline / 4px halo).
- Semantic HTML: `<header><nav><main><section><article><footer>`; `<details>/<summary>` for accordions.
- Touch targets ≥ 44×44 px.
- Captions, screen-reader paths, extended-time accommodations on the proctored interview are
  first-class (not a checkbox) — see the interview screen plan.
- ARIA labels on the audience switch, the integrity timeline track, the mega-menu trigger.

## Implementation notes (for FE engineers)

- Tokens live in `@ip/ui/src/tokens.css` (light) + the `.dark` block. Map onto Tailwind v4 utilities
  in `app/globals.css` via `@theme inline`. App screens use Tailwind utilities; the
  primitives above are exposed via classed components in `@ip/ui` and via raw class names where
  needed (e.g., `.cell`, `.hud`, `.itl-track`).
- Schibsted Grotesk + Hanken Grotesk + Geist Mono loaded via `next/font/google` in the root layout.
- Pre-paint script for `data-theme` / `data-base` / `data-accent` on `<html>` before React hydrates
  (the existing `appearanceScript` shape) — same approach across all screens.
- Build the screen against the typed mock client (`NEXT_PUBLIC_MOCK=1`) first; flip to real with
  the existing 1-line client swap when the backend is ready. **Do not change the data seam.**
- Verify each screen with a side-by-side screenshot against its mockup (or this design language)
  before declaring the screen done. The fidelity loop is non-negotiable.

## Per-screen plan template

Each `frontend_<slug>.md` MUST start with this exact header block (verbatim, no edits):

```markdown
# <Screen name> — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.
```

Then follow with: **Goal · Route + Role · Mockup (if any) · Layout & components · Data wiring · Tasks
(Task 0 = mockup, Task 1..N = build) · States & a11y · Acceptance.**

Each `backend_<slug>.md` keeps the existing structure (Functionalities · Service & RPCs · Request /
Response · Data required · Errors). Backend is **frozen** — the file documents what the UI consumes,
nothing more.
