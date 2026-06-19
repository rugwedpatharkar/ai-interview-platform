# Aptura — Design System (finalized, with competitive rationale)

> The finalized **color + visual language**, grounded in a scan of the category. Supplements
> `aptura-visual-identity.md` (logo/type) and reuses the `@ip/ui` tokens (`frontend/apps/*/app/globals.css`).
> **Repositioned 2026-06-20** (see `../superpowers/v2/2026-06-20-proctored-integrity.md`): differentiator is
> **no-ghosting + cheat-proof/trusted results**; "no-surveillance" framing dropped, verification cues now on-thesis.

## What the category does (analysis)
- **Job portals — a sea of blue + green.** LinkedIn (`#0a66c2`), Indeed, Naukri lead with corporate
  **trust-blue**; Glassdoor (`#0caa41`) & ZipRecruiter use **green** (go / growth / money). Crowded,
  generic — blue says "we're a serious job site."
- **AI interview / HR-AI tools — violet + dark + gradient.** The newer AI tools trend to
  **violet/purple** (the emerging "AI" signal), **dark-first** UIs, and cinematic gradients. Risk:
  purple is becoming the AI default — a *new* sameness.
- **2026 web trends:** electric violet, cinematic/structural gradients (the named tech gradient is
  **`#8B5CF6` → cyan**, i.e. our violet-500 → cyan), dark "mood mode," "computational" iridescent
  palettes.

## Aptura's position (the decision): anchor on violet, win on warmth + clarity
1. **Primary — Violet** `#7c3aed` (light) / `#8b5cf6` (dark). Steps cleanly out of the blue/green
   job-board sea **and** rides the AI-modern trend (the 2026 tech gradient centers on our violet-500).
   **Validated — keep.**
2. **Differentiate from the AI-violet crowd by being warmer + cleaner + dual-mode** (not colder/darker):
   - **Light AND dark are both first-class** — deliberately *not* dark-cyber-only. Light mode = human,
     trustworthy, accessible — on-brand (rigor you can see, merit, "everyone is heard, on a level field").
     A conscious counter-position to the dark-AI trend.
   - **Warm accent — amber/gold `#f59e0b`**, used **sparingly** for optimistic highlights,
     "answered"/success moments, merit cues. The human warmth that sets us apart from the cold
     all-violet/cyan AI tools.
   - **Flat, clean product UI** (clarity + accessibility) with generous whitespace.
3. **Signature gradient — brand/hero ONLY (never product UI):** violet → indigo
   (`#8b5cf6 → #6366f1`), soft and refined — *not* cyber-cyan, *not* neon. For marketing heroes, the
   logo-lockup background, social cards. Product surfaces stay flat for legibility + a11y.
4. **Neutrals — zinc** (warm-gray): modern, calm, dual-mode.
5. **Status — emerald / amber / rose / sky** (existing tokens); amber doubles as the brand warm accent.

## Differentiation, in one line
Versus the **blue/green job boards** → we're **violet** (modern, distinct). Versus the **cold
dark-cyber AI tools** → we're **warmer, cleaner, light-and-dark** (human, trustworthy). *Violet for
intelligence; amber + light mode for humanity.*

## Tokens (reuse @ip/ui — single source of truth)
| Role | Light | Dark |
|---|---|---|
| Brand primary | `#7c3aed` (violet-600) | `#8b5cf6` (violet-500) |
| Warm accent | `#f59e0b` (amber-500) | `#f59e0b` |
| Background | `#fafafa` | `#09090b` |
| Surface | `#ffffff` | `#18181b` |
| Text | `#18181b` | `#fafafa` |
| Muted text | `#71717a` | `#a1a1aa` |
| Signature gradient | `linear-gradient(#8b5cf6 → #6366f1)` — brand/hero only | same |
| Status | emerald `#059669` · amber `#f59e0b` · rose `#e11d48` · sky `#0284c7` | existing dark tokens |

## Design language
Flat surfaces, generous whitespace, **light + dark both first-class**, the **aperture** motif, lucide
outline icons, subtle motion (+ an AI "thinking" pulse), `prefers-reduced-motion` honored. **Human,
diverse, optimistic imagery**; verification / focus / proctoring cues (lens, focus ring, verified check)
are on-thesis — dignified and human, **never menacing or dystopian.**

## Sources
- [2026 web design color trends — Lounge Lizard](https://www.loungelizard.com/blog/web-design-color-trends/)
- [UI color trends 2026 — Recursion](https://recursion.software/blog/ui-color-trends-2026)
- [Tech/SaaS & AI startup palettes — I Love Hue](https://ilovehue.co/blog/tech-saas-color-palettes/)
- [SaaS website design trends 2026 — Eloqwnt](https://www.eloqwnt.com/blog/saas-website-design-trends)
