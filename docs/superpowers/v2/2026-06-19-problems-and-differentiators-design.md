# Problems & Differentiators — Why v2 Wins

> **Canonical "why" doc.** The product thesis that guides every v2 pillar. Read alongside the
> `2026-06-19-v2-architecture-overview-design.md`. This is not a buildable feature spec — it's the
> problem-driven north star each pillar is measured against.

## Thesis

**The job platform that doesn't ghost you — and whose results you can trust.**

> **Pivot (2026-06-20):** repositioned from "doesn't surveil you" to **trusted, cheat-proof results
> via rigorous proctoring**. The AI interview is strict, fully-proctored (camera+mic required,
> no-mute, fullscreen-locked, all 40 signals, hard auto-gate on HIGH-severity cheating, integrity
> timeline + score surfaced to recruiters). Canonical: `2026-06-20-proctored-integrity.md`. The
> no-ghosting half is unchanged.

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
  catch it. **The result is the casualty: a pass no longer means anything** — employers can't trust
  scores from interviews that are trivially gamed.
- **Half-measures don't hold the line** — light-touch "integrity score" tools (gaze/tab hints only)
  miss second-face, phone, screen-share, virtual-cam, and synthetic-audio attacks, and surface no
  hard evidence; recruiters are left guessing whether a strong score is real.
- **Bias & inconsistency** — the same candidate scored differently by different interviewers; accent/
  appearance bias; opaque black-box scores.

## The core insight

**Ghosting and applicant-overload are the same problem.** Employers can't reply to 180 people, so
candidates get silence. A pure job portal can't fix this (no capacity to respond); a pure AI-interview
tool isn't where people apply. **A unified marketplace + AI screening engine can give *every*
applicant a real interaction, a definite outcome, and feedback — automatically.** That is the moat,
and only the unified product has it.

And on integrity, the wedge is **trust through rigor**: because the interview is strictly proctored
(camera+mic required, no-mute, fullscreen-locked, all 40 signals, hard auto-gate on HIGH-severity
cheating) and the **full integrity timeline + score are surfaced to recruiters**, a pass *means*
something — no one can game it. That is the differentiator competitors whose results can be gamed
can't match. (See `2026-06-20-proctored-integrity.md`. Compliance: face/gaze/recording =
biometric/sensitive data — a knowing demo-time trade; launch needs consent/retention/jurisdiction
review.)

## Problems → v2 response → differentiator

| Problem (sourced) | v2 response | Differentiator | Owned by |
|---|---|---|---|
| Ghosting / black hole (55% no reply) | AI screens every applicant; funnel + notifications + tracker guarantee a status | **No-ghosting by design** | Notifications · Funnel |
| Employer overload (180/hire) | AI screening + ranked candidates absorb volume; humans review only screened, scored people | Volume handled *and* everyone replied | Assessments · Matching |
| Ghost / stale jobs (67%) | Funnel = ground truth on activity → auto-expire stale jobs, "actively reviewing" + responsiveness signals | **A marketplace that proves jobs are real** | Marketplace (Pillar A) |
| AI-interview cheating (35% / 48% tech) | Strict, fully-proctored live interview: camera+mic required, no-mute, fullscreen-locked, all 40 signals server-scored, **hard auto-gate on HIGH-severity cheating** (second face, phone, screen-share, virtual cam, synthetic audio) + adaptive probing + content rotation/watermark | **Cheat-proof — a result employers can trust** | Proctored integrity |
| Scores you can't trust | Full **integrity timeline + score surfaced to recruiters**, who judge the rest; nothing hidden, nothing gameable | A pass *means* something | Proctored integrity |
| Bias / inconsistent scoring | One rubric for all, temp-0, evidence-cited, human-decides (advisory), text-first/multi-modal | **Consistent · explainable · accessible** | Scoring · Compliance gate |
| No feedback | Candidate-growth skill-gap feedback at close + practice mode | Everyone learns something | Candidate growth |
| Effort asymmetry (re-entering data) | One AI-parsed profile → apply anywhere, AI pre-fill | Apply once, reuse everywhere | Profile · Marketplace |

## Already covered vs. net-new

**Already in the v2 design** (these problems are largely solved by existing pillars): overload
(assessments + ranked matching), bias/inconsistency (temp-0 evidence-cited evaluator + advisory gate),
no-feedback (candidate growth), effort asymmetry (résumé parse + apply-with-profile), multi-modal
accessibility (text/voice/video choice — Pillar C).

**Net-new in this differentiation layer** (designed now):
1. **Proctored integrity (strict, cheat-proof)** — `2026-06-20-proctored-integrity.md`. The AI
   interview is fully proctored (camera+mic required, no-mute, fullscreen-locked, all 40 signals,
   hard auto-gate on HIGH-severity cheating, integrity timeline + score surfaced to recruiters).
   **Supersedes** the prior `2026-06-19-integrity-by-design-design.md` (non-surveillance) pillar; the
   content-integrity signals (rotation/watermark/probing) survive inside the proctoring suite.
2. **No-ghosting guarantee** — woven into `2026-06-19-notifications-center-design.md` + the funnel:
   every applicant reaches a definite, notified outcome (no silent drop) + a feedback offer.
3. **Marketplace trust & freshness** — woven into `2026-06-19-job-marketplace-design.md`: job
   auto-expiry, "actively reviewing", and per-employer responsiveness signals derived from real
   funnel data.

## What we DO and don't (2026-06-20 pivot)

We **do proctor, rigorously**: the live interview requires camera + mic (no mute), is
fullscreen-locked, and runs **all 40 signals** (face/gaze/head-move/second-face/phone/second-voice/
tab/copy-paste/devtools/screen-share/virtual-cam…) server-scored by severity, with a **hard auto-gate
on HIGH-severity cheating** and the **full integrity timeline + score surfaced to recruiters**. That
rigor is what makes a pass trustworthy — it's the differentiator, not a compromise.
See `2026-06-20-proctored-integrity.md`.

We still deliberately **do not**: verify identity (KYC), run background/reference checks, or do
biometric **identity** matching (face/voice → a named person) — cut for legal reasons (BIPA, FCRA,
EU AI Act) at ~zero demo value.

> **Compliance note:** proctoring face/gaze/recording = biometric/sensitive data — a **knowing
> demo-time trade**. Commercial launch needs consent + retention + jurisdiction review (BIPA, GDPR
> Art. 9, EU AI Act) before this ships.

## Sources
- [iHire — 53% of job seekers ghosted](https://www.ihire.com/resourcecenter/employer/pages/53-percent-of-job-seekers-have-been-ghosted-by-a-potential-employer)
- [FastApply — ATS filters & employer ghosting 2026](https://blog.fastapply.co/why-am-i-not-hearing-back-from-jobs-2026)
- [CPA Practice Advisor — ghost jobs haunt 67%](https://www.cpapracticeadvisor.com/2026/04/30/ghost-jobs-still-haunting-67-of-job-seekers-report-finds/182536/)
- [HR Brew — more applications, fewer quality candidates](https://www.hr-brew.com/stories/2025/10/27/recruiters-more-applications-candidate-quality-struggles)
- [Fabric — State of AI interview cheating 2026 (19,368 interviews)](https://fabrichq.ai/blogs/state-of-ai-interview-cheating-in-2026-insights-from-19-368-interviews)
- [Humanly — AI interview anti-cheating / integrity layers 2026](https://www.humanly.io/blog/ai-interview-anti-cheating-protocol-2026)
