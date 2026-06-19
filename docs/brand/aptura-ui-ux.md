# Aptura — UI/UX Standard & Demo Screen Set

> The **demo-grade quality bar** + the flagship screen designs. Builds on `aptura-design-system.md`
> (color/competitive rationale) and `aptura-visual-identity.md` (logo/type). These mockups are the
> **visual contract** for the v2 frontend tiers in `docs/superpowers/v2/*`. Design phase — no code yet.
> **Repositioned 2026-06-20** (see `../superpowers/v2/2026-06-20-proctored-integrity.md`): the interview is a
> **proctored, locked-down surface** (camera required, no mute, fullscreen-locked); recruiter report gains an integrity band. "Not-recorded / no-surveillance" UX dropped.

## The demo-grade bar (every screen hits this)
- **Real content, never lorem** — real names, roles, scores, skills. Placeholder text kills demos.
- **One focal point per screen** — usually the violet metric (match score / KPI). Everything supports it.
- **Brand applied** — aperture mark + Sora wordmark in the bar; violet primary; **amber used once,
  sparingly**; Sora for numerals & headings, Inter for body.
- **Calm hierarchy** — generous whitespace, 0.5px borders, `radius-lg` cards, clear sections.
- **Every state designed** — loading (skeleton), empty (helpful + CTA), error (message + retry),
  success (toast). Not just the happy path.
- **Light + dark both first-class** — dark-safe color usage (surfaces/text via tokens; violet/amber
  as brand accents that work in both).
- **Accessibility** — contrast, labels, keyboard, `aria-live` on async updates.
- **Subtle motion** — fade/slide tokens; an AI "thinking" pulse for interview/scoring; honor
  `prefers-reduced-motion`.
- **Trust cues baked into the UI** — "every applicant answered", "proctored · recorded for integrity",
  "advisory — you decide", "fairness view". The brand promise shows up on the screen, not just in marketing.
- **The interview is a proctored, locked-down, serious surface** — camera **required**, **no mute / no
  camera-off**, **fullscreen-locked**, with **live proctoring status** (One face · Eyes on screen ·
  Fullscreen) + flag banners. The recruiter **report carries an integrity band** (timeline + integrity
  score + an "auto-terminated for cheating" state). Rigor you can see, applied equally to everyone.

## Pattern library (reuse @ip/ui)
| Pattern | Spec |
|---|---|
| App shell | Top bar: aperture mark + "Aptura" (Sora 600) · nav · avatar (violet for recruiter, violet-tint for candidate) |
| Cards | `radius-lg`, 0.5px border, surface bg |
| Status pills | emerald = scored/passed/clean · sky = interviewing · violet = scored/awaiting · amber = needs attention/posted · zinc = neutral/not-selected |
| Match / score | violet number in **Sora** + thin violet progress bar |
| KPI metric cards | muted 12px label + 22–24px Sora number; accent the meaningful one (violet or emerald) |
| Evidence quote | violet left-border, italic, muted — the explainability device on the AI report |
| Funnel bars | violet shades by stage (600→300), count right-aligned |
| Score distribution | IQR band + median marker; **never** protected attributes |
| Buttons | violet primary · outline secondary; lucide/Tabler **outline** icons only |
| Interviewer avatar | the aperture mark inside a ring (the AI = a lens, not an eye) |

## Flagship demo screen set (designed this session)
**Candidate**
1. **Landing page** — hero ("Get seen. Get interviewed. Get hired."), job search, how-it-works, the 3 differentiators.
2. **Job marketplace** — search/browse, match %, "actively reviewing · responds in ~2 days" trust badges.
3. **Job detail + apply** — JD + the **proctored-interview** heads-up (camera + mic required, recorded for integrity).
4. **AI interview** — live **proctored** video + voice, the **adaptive follow-up** probe, live status chips
   (One face · Eyes on screen · Fullscreen); no mute / no camera-off, fullscreen-locked.
5. **Dashboard / tracker** — per-application funnel progress ("no black holes"); even a rejection links to feedback.
6. **Skill-gap feedback** — per-competency strengths + grow-areas; "for growth, not pass/fail".

**Recruiter**
7. **Ranked applicants** — AI-ranked by fit, match scores, "every applicant answered".
8. **Recruiter dashboard** — KPIs incl. **avg. response time** (no-ghosting as a metric), jobs list.
9. **Post a job** — AI JD assist (suggestions) + the **advisory-gate** control (AI recommends, human decides).
10. **AI candidate report** — **evidence-quote-backed** competency scores, advisory recommendation,
    an **integrity band** (proctoring timeline + score + auto-terminate state), human decision controls.
11. **Analytics & fairness** — funnel + **outcome rate 100%** + a score-distribution **fairness view**.

## Suggested demo flow
Landing → (candidate) marketplace → job detail → AI interview → dashboard → feedback → (switch to
recruiter) dashboard → post a job → ranked applicants → AI report → analytics. **The story:** for
candidates, *"find a job, get a fair interview, always hear back"*; for the buyer, *"screen the flood
on merit — and never ghost anyone."*

## When the build is green-lit
Implement these with `@ip/ui` to match, per the v2 FE tiers (`docs/superpowers/v2/*`). Each screen
ships responsive + light/dark + all states. The rendered mockups are the reference; this doc is the
standard they must meet.

## Enhanced treatments (the elevated bar)
- **Signature gradient** (violet→indigo) on *hero moments only* — the landing hero, step icons, the
  AI-recommendation strip. Never in dense product UI (which stays flat for legibility).
- **Circular score rings** for the headline number (the match score on the AI report); thin violet
  bars for secondary/competency scores.
- **Dual-mode, both first-class** — light is the default (human, accessible); dark is fully designed
  (see the dark AI-interview). Surfaces/text via tokens; brand violet shifts to `#8b5cf6` in dark.
- **Responsive / mobile** — every screen reflows to a phone; mobile gets a bottom tab bar
  (Jobs · Saved · Applications · Profile).
- **Flat depth** — layering via borders + surface tints, not shadows (one soft elevation allowed
  under the landing hero's search bar).

## Added screens (deepened set)
- **Candidate profile** — résumé → AI-parsed → review/edit; completeness meter; the onboarding magic.
- **Recruiter talent pool** — search your *own* applicants by skill; "strong / good fit"; the
  no-scraping, no-harvesting note.
- *(Remaining to add at the same bar: messaging, notifications center, auth / sign-in.)*
