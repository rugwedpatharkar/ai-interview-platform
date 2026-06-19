# Aptura — Visual Identity Direction

> Pairs with `aptura-positioning.md`. Builds on the existing `@ip/ui` design system
> (`frontend/apps/*/app/globals.css` tokens) — formalize it, don't reinvent.
> **Repositioned 2026-06-20** (see `../superpowers/v2/2026-06-20-proctored-integrity.md`): the aperture now
> means **the real candidate in sharp focus → verified truth**; lens/camera imagery is on-thesis (was anti-surveillance).

## Logo — the aperture mark
**Concept:** a camera-lens **aperture / iris.** It plays on the name (*Apt·ura* ≈ *aperture*) and the
brand idea — **bringing the real candidate into sharp focus:** precision, clarity, rigor, verified truth.
A ring with six pinwheel blades forming an open iris: modern, geometric, distinctive, and quietly
"intelligent." The lens *fits* a proctored product — it stands for a result you can trust.

**Lockup:** the aperture mark + the **Aptura** wordmark (Sora, 600). Mark-only works as app
icon / favicon / avatar. In the full lockup the tagline ("Get seen. Get interviewed. Get hired.")
sits beneath.

**Reference SVG (the mark):**
```svg
<svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="Aptura">
  <circle cx="32" cy="32" r="27" fill="none" stroke="#7c3aed" stroke-width="3"/>
  <g stroke="#7c3aed" stroke-width="2.6" stroke-linecap="round">
    <line x1="43" y1="32" x2="55.4" y2="45.5"/>
    <line x1="37.5" y1="41.5" x2="32" y2="59"/>
    <line x1="26.5" y1="41.5" x2="8.6" y2="45.5"/>
    <line x1="21" y1="32" x2="8.6" y2="18.5"/>
    <line x1="26.5" y1="22.5" x2="32" y2="5"/>
    <line x1="37.5" y1="22.5" x2="55.4" y2="18.5"/>
  </g>
</svg>
```
Violet `#7c3aed` reads on both light and dark, so the mark is **one color in both themes.**

**Clearspace:** padding ≥ the mark's ring radius around the lockup. **Min size:** mark ≥ 24px;
wordmark legible ≥ 16px. **Don'ts:** no recolor outside the violet ramp; no gradient/shadow; no
stretch.

## Color (reuse the @ip/ui tokens — single source of truth)
- **Brand:** violet-600 `#7c3aed` (light primary) · violet-500 `#8b5cf6` (dark primary).
- **Neutrals (zinc):** background `#fafafa`/`#09090b` · surface `#fff`/`#18181b` · text
  `#18181b`/`#fafafa` · muted `#71717a`/`#a1a1aa`.
- **Status:** success emerald, warning amber, danger rose, info sky (existing tokens).
- Dark-mode-first; every color works in both.

## Typography
- **Sora** — display, wordmark, headings (600 / 700).
- **Inter** — body, UI (400 / 500).
- Both already wired via `next/font` in the apps.

## Iconography
lucide **outline** icons, ~1.5–2px stroke, geometric, consistent (already used across `@ip/ui`).

## Motion
Reuse the existing motion tokens (fade / zoom / slide). Add a subtle "thinking" pulse for AI-in-
progress moments (interview, scoring). Always respect `prefers-reduced-motion` (already honored).

## Imagery & illustration
Human, warm, diverse, optimistic — people and clarity. Verification / focus / proctoring imagery is
**on-thesis** now: a lens, a focus ring, a verified check, a calm secure interview — framed as
**rigor + fairness + trust applied equally to everyone.** Keep it dignified and human; never
menacing or dystopian. The point is a result you can trust, applied the same way to all.

## Usage
- Primary lockup (mark + wordmark) for headers / marketing; mark-only for icon / favicon / avatar.
- Light + dark variants from the single violet mark.
- Wordmark always Sora 600 — never substitute another face.
