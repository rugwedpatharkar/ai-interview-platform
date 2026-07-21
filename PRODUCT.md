# Product

## Register

product

> The unified Aptura app is the product (34 authenticated screens; design serves the
> workflow). Marketing surfaces — the landing (`/`), `/hiring-teams`, `/trust`, etc. —
> are **brand-register** tasks within it. This file's default register is `product`;
> override to `brand` when working a marketing surface.

## Users

Two-sided, one platform.

- **Candidates / job-seekers.** Want a fair shot and to not be ghosted. They search and
  apply for jobs, take **one** rigorously proctored live AI interview (camera + mic
  required), get evidence-based feedback, and track application status. Context: often
  anxious, time-poor, on desktop **or** mobile; they need clarity, fairness, and a real
  answer every time.
- **Recruiters / hiring teams.** Drowning in unverifiable applications and AI-assisted
  cheating. They post jobs, review **evidence-based** interview reports with an integrity
  timeline, and decide (advisory gate — a human always decides). Context: professional,
  data-dense, desktop; they need results they can trust and defend.

## Product Purpose

A unified hiring marketplace **plus** a strict proctored AI-interview product. Candidates
discover jobs, apply, take one live proctored video+voice AI interview, and **always** hear
back ("no ghosting"). Companies get trustworthy, evidence-based screening + integrity
reports and make the final call. Success = candidates trust the fairness and always get an
answer; companies trust that a pass *means* something. Tagline: *"Get seen. Get interviewed.
Get hired."* (candidate) / *"Hire on proven merit."* (company). The mark is an **aperture /
lens** — the real candidate brought into sharp focus.

## Brand Personality

Voice: **confident, clear, human, honest.** Plain over jargon; optimistic without hype.
Candidates are people — never "resources" or "headcount." Upfront about proctoring: the
interview is monitored and recorded, and we say so plainly — rigor you can *see*, applied
equally to everyone, never hidden. No dark patterns. Short sentences.

Three words: **Precise · Human · Trustworthy.** Emotional goals: candidate feels a *fair
shot* (confidence, relief from ghosting); company feels *justified trust* (defensible
results); everyone feels *calm clarity*, not anxiety or AI hype.

## Anti-references

- **The AI-default violet/blue gradient hero.** The #1 fingerprint of generic AI design;
  the previous Aptura UI was recognizably this. Never again.
- **Cold dark-cyber "AI tool" sameness** — all-violet/cyan, menacing, surveillance-coded.
  Proctoring must read as *dignified fairness*, never Big-Brother or dystopian.
- **Blue/green job-board monoculture** — LinkedIn/Indeed corporate trust-blue; Glassdoor/
  ZipRecruiter go-green. We are none of these.
- **Editorial-magazine-by-default** (display serif + tracked mono eyebrows + ruled columns
  on every section). Allowed as *one* deliberate direction; never the house reflex.
- **Cramped, timid typography.** The current UI's type is too small; premium means a
  confident, larger, deliberate scale.
- Reflex fonts (Inter, Fraunces-except-deliberately, DM Sans, Space Grotesk, Plus Jakarta,
  Outfit) chosen by reflex rather than voice.

## Design Principles

1. **Rigor you can see.** The proctoring / merit / no-ghosting promise appears *on the
   screen* (integrity cues, "answered — always", evidence quotes), not just in marketing.
   The brand's credibility **is** the product's promise.
2. **Never ghost, never black-box.** Every state is answered; every decision is explainable
   (evidence-based, human decides). No dead ends, no unexplained verdicts.
3. **Dignified, not dystopian.** Proctoring is fairness applied equally — calm, secure,
   human. Lens/focus/verified imagery is on-thesis; never menacing.
4. **Real content, never lorem.** Demo-grade: real names, roles, scores, skills; every
   state designed (loading / empty / error / success), not just the happy path.
5. **Premium, not generic-AI.** Top-tier international-SaaS caliber (Linear, Stripe, Vercel,
   Ramp, Ashby). Distinctive enough that a visitor asks "how was this made?", never "which
   AI made this?"

## Accessibility & Inclusion

- **WCAG 2.1 AA.** Contrast ≥4.5:1 body / ≥3:1 large text and UI; visible `:focus-visible`;
  full keyboard operability; associated labels; `aria-live` on async updates (scoring,
  status, interview state).
- **Reduced motion is not optional** — every animation has a `prefers-reduced-motion`
  crossfade/instant alternative, including the AI "thinking" pulse.
- **Light mode only — no dark mode** (decided 2026-07-10). The product ships a single light
  theme: professional and fresh for a B2B (company) + job-seeker (experienced + fresher)
  audience. No dark theme and no theme toggle anywhere. (Revisit dark mode only if explicitly
  requested later.)
- **Color is never the only signal** — status carries text/icon too (colorblind-safe).
- **≥44px touch targets**; every screen reflows to mobile (candidate mobile gets a bottom
  tab bar).
- **Data-scope discipline:** general recruiting profile only (resume, education, name,
  location, preferences, email). No sensitive/official documents; no PII beyond that.
