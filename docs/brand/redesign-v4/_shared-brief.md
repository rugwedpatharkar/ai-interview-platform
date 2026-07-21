# Aptura v4 — shared landing brief (all 3 directions build this exact content)

You are building **one self-contained landing-page mockup** for **Aptura**, an AI-driven
hiring + **proctored** live-interview platform. This file is the shared spec: the same
content, copy, structure, and quality rules for **every** direction. Your direction-specific
brief (tokens, fonts, mood, layout treatment) is provided separately by the caller. Where
they differ, the direction brief wins on *look*; this file wins on *content + rules*.

Goal: **top-tier international SaaS quality** (Linear / Stripe / Vercel / Ramp / Ashby
caliber) — premium, confident, trustworthy, AI-forward, informative. Not a template.

## Output contract
- **One** self-contained `.html` file. All CSS in a single inline `<style>`. Google Fonts via
  `<link>` in `<head>` (allowed). No build step; opens directly in a browser.
- **Light mode ONLY — no dark mode** (product decision 2026-07-10; a single professional,
  fresh light theme for a B2B + job-seeker audience). Do **not** build a dark theme or any
  theme toggle. Use `data-theme="light"` (or no theme attribute) — one bright, professional
  light palette only.
- **Responsive**, no horizontal scroll at any width. Breakpoints ~980px and ~600px. Test the
  headline at mobile — it must never overflow its container.
- `<title>Aptura — Get seen. Get interviewed. Get hired.</title>`

## Non-negotiable quality rules
- **Contrast:** body ≥4.5:1, large/UI ≥3:1, placeholders ≥4.5:1. No light-gray body text on
  tinted near-white. When close, bump toward ink.
- **Type:** larger, confident scale (body ~17–18px; fluid `clamp()` headings, ≥1.25 step
  ratio). Display letter-spacing ≥ -0.04em. `text-wrap: balance` on h1–h3, `pretty` on prose.
  Cap prose line length 65–75ch.
- **Motion:** intentional, ease-out **expo/quart** curves, **no bounce/elastic**. A crafted
  hero load + subtle per-section scroll reveals that **enhance an already-visible default**
  (never gate content visibility on a JS class — it must render fully with JS off). Every
  animation needs a `@media (prefers-reduced-motion: reduce)` alternative.
- **A11y:** visible `:focus-visible` ring; keyboard-operable fork/search; labels on inputs;
  semantic landmarks (`nav`/`header`/`main`/`footer`); ≥44px targets.
- **Bans (rewrite if you reach for these):** side-stripe (`border-left`) accents; gradient
  **text** (`background-clip:text`); glassmorphism-as-default; the big-number-hero-metric
  cliché template; endless identical icon+title+text card grids; a tiny uppercase tracked
  eyebrow above *every* section (one, deliberate, max); `01/02/03` numbered markers on every
  section (numbers only where the content is a real sequence — the 4-step flow qualifies);
  any text overflowing its container.
- **Visuals:** ship real visual craft, not colored placeholder blocks. Prefer premium
  **SVG/CSS** (the aperture motif, a score ring, a merit-flow diagram, an abstract proctored-
  interview device frame, subtle data viz). Do **not** hotlink photos you can't verify —
  broken images are worse than none. Self-contained is the priority.

## Brand mark (inline SVG, uses `currentColor` so it themes)
```svg
<svg width="30" height="30" viewBox="0 0 64 64" role="img" aria-label="Aptura">
  <circle cx="32" cy="32" r="27" fill="none" stroke="currentColor" stroke-width="3"/>
  <g stroke="currentColor" stroke-width="2.6" stroke-linecap="round">
    <line x1="43" y1="32" x2="55.4" y2="45.5"/><line x1="37.5" y1="41.5" x2="32" y2="59"/>
    <line x1="26.5" y1="41.5" x2="8.6" y2="45.5"/><line x1="21" y1="32" x2="8.6" y2="18.5"/>
    <line x1="26.5" y1="22.5" x2="32" y2="5"/><line x1="37.5" y1="22.5" x2="55.4" y2="18.5"/>
  </g>
</svg>
```
Wordmark: **Aptura**. The aperture = "the real candidate in sharp focus → verified truth."

## Exact content & copy (use verbatim; real content, never lorem)

**Top nav:** mark + `Aptura` · links: `For companies`, `How it works`, `Sign in` · primary CTA `Get started` · (demo theme toggle).

**Hero**
- Eyebrow (mono/label, ONE only): `Unified hiring platform`
- H1: `Get seen. Get interviewed. Get hired.`
- Lede: `One place to apply, interview, and hear back — on a result you can trust.`
- Role fork (tabs, keyboard-operable): `I'm looking for a job` / `I'm hiring`
- Search row: input `Job title or skill` · input `Location` · button `Search`
- Trust pills: `Free for candidates` · `Proctored & fair — same rules for everyone` · `Every application gets an answer`
- Hero visual: your direction's signature (aperture ring / instrument panel / warm merit motif).

**Stats band** (4): `100%` — of applications answered · `12,400+` — interviews completed · `1` — fair interview, live video + voice · `3-day` — average feedback.

**Why Aptura** — H2: `The hiring platform that doesn't ghost you — and gives a result you can trust.` Three points:
1. `Answered, always` — `Every application gets a real response — no ghosting, ever.`
2. `Cheat-proof` — `A rigorously proctored interview — same rules for everyone — so a pass means something.`
3. `On merit` — `Judged on evidence from the interview, not pedigree or who you know.`

**How it works** — H2: `From "apply" to "you're hired" — in four steps.` (a real ordered sequence — numbering OK here)
1. `Search & apply` — `Find roles that fit and apply in a click.`
2. `Take your live interview` — `A single proctored live video + voice interview — same for everyone.`
3. `Get evidence-based feedback` — `See how you did, grounded in what you actually said.`
4. `Hear back, always` — `A real answer on every application.`

**Merit, made visible** — H2: `A fair shot you can actually see.` Sub: `No black-box verdicts — here is exactly how a decision gets made.` Flow (4 nodes, arrowed): `Evidence captured` → `AI structures it` → `A human decides` → `You're notified`.

**Two audiences** (two cards; make them feel distinct, not twins):
- **For candidates:** `Live video + voice interview` · `Private practice runs` · `Skill-gap feedback` · `Real-time application status`. CTA: `Find your next job →`
- **For companies:** `Merit-based screening` · `Advisory gate — you decide` · `Evidence-based reports` · `No-ghosting analytics`. CTA: `Start hiring on merit →`

**Trust band** — H2: `Built to be trusted.` Badges: `SOC 2` · `GDPR-ready` · `EEOC-aligned` · `Bias-tested` · `Proctored integrity`.

**Footer:** `Get seen. Get interviewed. Get hired.` · `© Aptura`.

## Definition of done
Premium, cohesive, on-brand, responsive, light mode excellent (no dark mode), all states legible,
zero console errors, no horizontal scroll, headline safe at every width. Don't hold back —
this is the brand surface where design *is* the product.
