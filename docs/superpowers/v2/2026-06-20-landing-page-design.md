# Aptura — Landing / Main Page Design

> The marketing front door for the unified platform. Pairs with the high-fidelity mockup (`aptura_landing_page`),
> the [brand docs](../../brand/), and [§A of the screens build plan](2026-06-19-screens-frontend-build-plan.md).
> Grounded in a competitor landing-page analysis (13 sites) + Aptura's positioning. **Design only — no code.**
>
> **Pivot (2026-06-20):** repositioned from "no surveillance" to **proctored & fair / cheat-proof**
> (rigorous proctoring → a result you can trust). The mockup's no-surveillance copy is **superseded** —
> see `2026-06-20-proctored-integrity.md`. Copy below is updated; regenerate the mockup to match.

## What it is & where it lives
The candidate-app **home route (`/`)**, server-rendered (SSR) and crawlable, doubling as the product's
marketing page. It leads with Aptura's three differentiators, then gives **each audience its native front
door** via a role fork. It reuses the existing public read surface — **no new backend** (search hero → the
`/public/jobs` endpoint from [job-marketplace](2026-06-19-job-marketplace.md); stats → analytics KPIs).

---

## 1. Competitor analysis (synthesis of 13 landing pages)

**Studied:** job portals — LinkedIn, Indeed, Naukri, ZipRecruiter, Wellfound, Glassdoor · AI-interview —
HireVue, Karat, Mercor, Metaview, micro1/Zara, Hireflix, Willo.

### Canonical section anatomy (the order the best ones share)
`nav → hero → trust strip → how-it-works → features → social proof → [security] → final CTA → footer`.
The **trust strip sitting immediately below the hero** is near-unanimous. A dedicated **security/governance
section** is the enterprise tell (HireVue, Metaview, Willo) — and exactly the slot Aptura repurposes for its
differentiators.

### Two muscle groups a *unified* product must carry
| | Job portals do | AI-interview tools do |
|---|---|---|
| Hero | **search bar / browse** — utility-first, self-serve | **demo-led** dual CTA + product visual; sales-first |
| Audience | lead with **job-seeker**; employer = a nav link | lead with **employer**; candidate often invisible |
| Trust | **scale stats** (70M users) + ratings | **outcome stats** (90% faster) + **compliance badges** |
| Fairness | absent | **central axis** — integrity/anti-cheat vs gameable results |

Aptura needs **both**: a portal-style search hero *and* outcome stats + a compliance/how-the-AI-works strip.
The bridge neither side has — a **dual-audience hero** — exists only in **Wellfound's twin columns** and
**Willo's role selector**; Aptura adopts the role fork.

### The wedge (why this matters)
- **No competitor sells a *trustworthy result*.** micro1 ships a light "Integrity Score" (gaze/tab hints);
  Willo/Karat gesture at transparency. None enforce a **strict, fully-proctored** interview with a hard
  auto-gate on serious cheating *and* the full integrity timeline shown to the recruiter. Aptura's claim —
  **a pass you can trust because it can't be gamed** — is the empty lane Aptura owns.
- **ZipRecruiter names the ghosting wound** (*"Applying is easy. Hearing back isn't."*) but doesn't cure it.
  Aptura's no-ghosting guarantee **closes the loop they opened** — the category's most-felt pain, unclaimed.

### Opportunities applied (and anti-patterns avoided)
1. Make **no-ghosting the hero**, not a footnote. 2. A **signature outcome stat** ("100% answered") no
competitor can copy without rebuilding. 3. Own the **empty "cheat-proof / trustworthy result" lane** explicitly. 4. Show
**human-in-the-loop as a diagram**, not a disclaimer. 5. **Role fork** for two-sided, not a buried nav link.
6. Candidate hero = **search**; employer hero = **outcome + demo**. 7. **Compliance strip reframed as values**.
8. **Warm violet**, not navy-corporate or cold frontier-AI dark.
**Avoided:** candidate-invisible homepage, demo-wall-only, zero on-page trust,
black-box AI, inconsistent stats, LinkedIn-length unfocused scroll. *(Frame proctoring as fairness/anti-cheat — same rules for everyone — not as scrutiny of the individual.)*

---

## 2. The Aptura landing page — section by section

Eleven sections over the canonical spine. Each notes the **intent** and the **differentiator/opportunity** it serves.

| # | Section | Content | Serves |
|---|---|---|---|
| 0 | **Nav** | Aperture mark + `Aptura` (Sora 600) · For companies · How it works · Sign in (ghost) · Get started (violet) | Two-sided signal up top |
| 1 | **Hero** (violet band) | Eyebrow "Unified hiring platform" · H1 = the tagline **"Get seen. Get interviewed. Get hired."** · subhead = the one-liner · **role fork** (*I'm looking for a job* / *I'm hiring*) · candidate **search bar** (title/skill + location) · trust microcopy "Free for candidates · Proctored & fair — same rules for everyone · Every application gets an answer" · faint aperture motif | Opp 1, 5, 6 |
| 2 | **Trust strip** | 4 stats — **100% answered · 12,400+ interviews · 1 fair interview (live video + voice) · 3-day avg feedback** | Opp 2 (outcome-stat, not scale-stat) |
| 3 | **Differentiator** | "The hiring platform that doesn't ghost you — and gives a result you can trust." → 3 cards: **Answered, always · Cheat-proof** (rigorous proctoring → a result you can trust) · **On merit** | The wedge — pillars 1–3 |
| 4 | **How it works** (candidate, surface band) | 4 steps: Search & apply → **Take your live video + voice interview** → Evidence-based feedback → **Hear back, always** | Candidate journey = the tagline |
| 5 | **Merit / human-in-loop** | "A fair shot you can actually see." → flow **Evidence captured → AI structures it → A human decides → You're notified** | Opp 4 (explainability as a diagram) |
| 6 | **Two-sided features** | Twin cards — **For candidates** (live video + voice interview, practice, skill-gap, real-time status) · **For companies** (merit screening, advisory gate, evidence-based reports, no-ghosting analytics) | Opp 5 (Wellfound twin-column) |
| 7 | **Values strip** | "Built to be trusted." → pills: SOC 2 · GDPR-ready · EEOC-aligned · Bias-tested · **Proctored integrity** · Human-in-the-loop · Audit trail | Opp 7 (compliance reframed as values) |
| 8 | **Testimonials** | Candidate quote (hired, fast feedback) + recruiter quote (volume on merit, rating climbed) — representative/demo, canonical numbers | Social proof |
| 9 | **Final CTA** (violet band) | "Ready when you are." → dual: **Find your next job** + **Start hiring on merit** | Dual conversion |
| 10 | **Footer** | Mark + wordmark + tagline · Candidates / Companies / Company columns · "© 2026 Aptura · Proctored. No ghosting. On merit." · social | Close |

**Copy principles** (from [positioning](../../brand/aptura-positioning.md)): candidates are people, never
"resources"; plain over jargon; **frame proctoring as fairness — "same rules for everyone," not fear or
scrutiny of the individual**; short sentences; the brand's credibility *is* the product's promise.

---

## 3. Visual & brand

- **Brand band pattern:** the hero and final-CTA bands are solid **violet `#7c3aed`** with white text (brand
  surfaces — violet in both light/dark). Everything between uses theme-adaptive tokens
  (`--color-background-primary/-secondary`, `--color-text-primary/-secondary`, `--color-border-tertiary`) so
  **dark mode is automatic**. *(The mockup uses flat violet to avoid streaming flash; production may apply the
  brand's signature violet→indigo gradient in the hero only.)*
- **Type:** Sora 600 for the wordmark + headings, Inter 400/500 for body (both already wired via `next/font`).
- **Aperture mark** inline (nav, hero motif, footer) — violet `#7c3aed`, one color in both themes; white at low
  opacity as the hero motif. Lead with **fairness, not scrutiny** — the aperture reads as focus/clarity, not a
  watching eye; avoid menacing camera/eye/lockdown imagery even though the interview is proctored.
- **Icons:** lucide/Tabler **outline** only. **Imagery:** human, warm, diverse; trust, not scrutiny.
- **Accent:** amber `#f59e0b` for the testimonial star rating only.

---

## 4. Build notes (when the FE phase is green-lit)

- **Route:** `apps/candidate/app/page.tsx` (the home `/`), **SSR** so it's crawlable + token-free; add
  `sitemap.ts`/`robots.ts` (already planned in §A of the screens build plan).
- **Components (`@ip/ui`):** reuse `button`, `card`, `badge/pill`, `input`; new marketing primitives —
  `<Hero>`, `<RoleFork>`, `<StatStrip>`, `<StepRow>`, `<MeritFlow>`, `<FeatureColumn>`, `<ValuePills>`,
  `<Testimonial>`, `<MarketingFooter>` (presentational, no auth).
- **Data:** the hero search posts to **`/public/jobs`** (job-marketplace `DiscoveryService` read surface — no
  new backend); the role fork swaps the hero panel client-side; stats can hydrate from the analytics KPIs
  (no-ghosting outcome-rate / avg response time) or ship as static demo values first.
- **Two-sided routing:** *I'm looking for a job* → search → `/jobs`; *I'm hiring* / Post a job → the company app
  (`/company` onboarding / post-a-job). Footer columns deep-link both surfaces.
- **No new backend, no new collections, no new events** — the landing page is a read/marketing surface over
  existing v2 plans (marketplace `/public/*`, analytics). It rides Inc 1.
- **Verify:** `npx pnpm@9.15.0 --filter @ip/candidate build` + `--filter @ip/ui typecheck`; Lighthouse SEO/perf
  pass; never `next build` while `pnpm dev` is live.

---

## 5. How it pairs
- **Mockup:** the `aptura_landing_page` visual comp (this session) is the visual target — **note its
  no-surveillance copy is superseded** by the 2026-06-20 proctored-integrity pivot; regenerate to match.
- **Screens build plan §A** ("Rich marketing landing") — this doc is its detailed spec; update §A to point here.
- **Gap register:** closes the "Rich marketing landing (hero/search/how-it-works)" 🟡-basic row.
- **Differentiators:** the on-page expression of [problems-and-differentiators](2026-06-19-problems-and-differentiators-design.md)
  (no-ghosting + proctored-integrity/cheat-proof + merit) and [proctored integrity](2026-06-20-proctored-integrity.md)
  (supersedes integrity-by-design).
