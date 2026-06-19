# Problems & Differentiators — Why v2 Wins

> **Canonical "why" doc.** The product thesis that guides every v2 pillar. Read alongside the
> `2026-06-19-v2-architecture-overview-design.md`. This is not a buildable feature spec — it's the
> problem-driven north star each pillar is measured against.

## Thesis

**The job platform that doesn't ghost you and doesn't surveil you.**

v2 isn't feature-parity with job portals plus an AI interviewer bolted on. It exists to fix the two
most damaging, well-documented failures of the two categories it unifies — and the unification is
precisely what makes the fixes possible.

## The validated problems (2026 sources)

**Candidate side of job portals:**
- **Silence is the #1 pain — worse than rejection.** 55% of applicants never get a reply; 44% hear
  nothing even after interviewing; 53% report being ghosted in the last year. Silence creates false
  hope and is the most emotionally damaging part of the search.
- **The application black hole** — keyword ATS screens, plus ~**180 applicants per hire**, mean most
  résumés never reach a human.
- **Ghost / stale jobs** — 67% of seekers hit postings that are filled or fake.
- **No feedback** — rejected candidates never learn why.

**Employer side of job portals:**
- **Applicant overload** — a deluge of mostly-unqualified applicants; "lack of qualified candidates"
  is recruiters' top stressor despite higher volume.
- **Cost & manual screening** — résumé review is slow; spend is spread thin with poor ROI.
- **Communication is unmanageable** — too many applicants to respond to → the silence above.

**AI interview platforms:**
- **Cheating exploded** — AI-assisted cheating doubled 15%→35% in H2 2025, **48% in technical roles**;
  real-time, near-invisible overlay/transcription tools feed candidates answers; live coding doesn't
  catch it.
- **Surveillance backfires** — eye-tracking, keystroke monitoring, and browser lockdowns "destroy
  candidate trust," are "easily bypassed by secondary devices," and make candidates "feel like
  criminals" so talented people avoid applying.
- **Bias & inconsistency** — the same candidate scored differently by different interviewers; accent/
  appearance bias; opaque black-box scores.

## The core insight

**Ghosting and applicant-overload are the same problem.** Employers can't reply to 180 people, so
candidates get silence. A pure job portal can't fix this (no capacity to respond); a pure AI-interview
tool isn't where people apply. **A unified marketplace + AI screening engine can give *every*
applicant a real interaction, a definite outcome, and feedback — automatically.** That is the moat,
and only the unified product has it.

And the surveillance finding is a gift: cutting biometric/surveillance proctoring (already decided for
legal reasons) turns out to be the *better product*, not a compromise. Trust is the differentiator.

## Problems → v2 response → differentiator

| Problem (sourced) | v2 response | Differentiator | Owned by |
|---|---|---|---|
| Ghosting / black hole (55% no reply) | AI screens every applicant; funnel + notifications + tracker guarantee a status | **No-ghosting by design** | Notifications · Funnel |
| Employer overload (180/hire) | AI screening + ranked candidates absorb volume; humans review only screened, scored people | Volume handled *and* everyone replied | Assessments · Matching |
| Ghost / stale jobs (67%) | Funnel = ground truth on activity → auto-expire stale jobs, "actively reviewing" + responsiveness signals | **A marketplace that proves jobs are real** | Marketplace (Pillar A) |
| AI-interview cheating (35% / 48% tech) | Adaptive probing + reasoning/defend prompts + per-candidate content rotation/watermark + voice option + advisory consistency flags | **Integrity by design, not surveillance** | Integrity-by-design |
| Surveillance kills trust | We cut it; integrity comes from interview *design* | Candidates aren't treated as suspects | Integrity-by-design |
| Bias / inconsistent scoring | One rubric for all, temp-0, evidence-cited, human-decides (advisory), text-first/multi-modal | **Consistent · explainable · accessible** | Scoring · Compliance gate |
| No feedback | Candidate-growth skill-gap feedback at close + practice mode | Everyone learns something | Candidate growth |
| Effort asymmetry (re-entering data) | One AI-parsed profile → apply anywhere, AI pre-fill | Apply once, reuse everywhere | Profile · Marketplace |

## Already covered vs. net-new

**Already in the v2 design** (these problems are largely solved by existing pillars): overload
(assessments + ranked matching), bias/inconsistency (temp-0 evidence-cited evaluator + advisory gate),
no-feedback (candidate growth), effort asymmetry (résumé parse + apply-with-profile), multi-modal
accessibility (text/voice/video choice — Pillar C).

**Net-new in this differentiation layer** (designed now):
1. **Integrity-by-design (non-surveillance)** — `2026-06-19-integrity-by-design-design.md` (+ plan).
   Supersedes the surveillance approach in the old `../plans/2026-06-19-proctoring-integrity-mvp.md`; its
   non-surveillance content-integrity ("E") part survives.
2. **No-ghosting guarantee** — woven into `2026-06-19-notifications-center-design.md` + the funnel:
   every applicant reaches a definite, notified outcome (no silent drop) + a feedback offer.
3. **Marketplace trust & freshness** — woven into `2026-06-19-job-marketplace-design.md`: job
   auto-expiry, "actively reviewing", and per-employer responsiveness signals derived from real
   funnel data.

## Non-goals (and why they're a strength)

We deliberately **do not**: surveil candidates (camera/mic/gaze/keystroke/lockdown), verify identity
(KYC), run background/reference checks, or build biometric proctoring. These are cut for legal reasons
(BIPA, FCRA, EU AI Act) **and** because the research shows surveillance destroys trust while being
trivially bypassed. Not having them is a feature.

## Sources
- [iHire — 53% of job seekers ghosted](https://www.ihire.com/resourcecenter/employer/pages/53-percent-of-job-seekers-have-been-ghosted-by-a-potential-employer)
- [FastApply — ATS filters & employer ghosting 2026](https://blog.fastapply.co/why-am-i-not-hearing-back-from-jobs-2026)
- [CPA Practice Advisor — ghost jobs haunt 67%](https://www.cpapracticeadvisor.com/2026/04/30/ghost-jobs-still-haunting-67-of-job-seekers-report-finds/182536/)
- [HR Brew — more applications, fewer quality candidates](https://www.hr-brew.com/stories/2025/10/27/recruiters-more-applications-candidate-quality-struggles)
- [Fabric — State of AI interview cheating 2026 (19,368 interviews)](https://fabrichq.ai/blogs/state-of-ai-interview-cheating-in-2026-insights-from-19-368-interviews)
- [Humanly — AI interview anti-cheating / integrity layers 2026](https://www.humanly.io/blog/ai-interview-anti-cheating-protocol-2026)
