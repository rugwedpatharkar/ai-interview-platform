# Aptura — Implementation Gap Register (mockups vs. built)

> Code-verified gap analysis (2026-06-19): what the **demo mockups** show vs. what's **actually
> implemented** in the codebase today. A feature "works in the demo" only if **both backend and
> frontend** are built. Each gap links the v2 plan that closes it. Verified by reading
> `src/*` and `frontend/*`, not from docs.

## TL;DR
The app today implements the **core closed funnel** (auth → profile → apply → aptitude → text
interview → AI report → decide) plus matching, JD-assist, AI-assistant chat, and analytics. **Most
of the v2 vision in the mockups is not built yet** — the entire **job-marketplace/discovery** half,
**messaging**, **notifications center**, **voice/video interview UI**, **coding assessments**,
**practice mode**, **skill-gap feedback**, and the **advisory-gate / proctored-integrity** surfaces.

## ❌ Not built (mockup-only — these are the real gaps)
| Feature (in the mockups) | Where shown | BE | FE | v2 plan |
|---|---|---|---|---|
| **Job marketplace — search/browse/discover** jobs (no `/jobs` index; can only apply by known id) | Marketplace, mobile | ❌ | ❌ | `job-marketplace.md` |
| Job **filters / sort / facets** (location, remote, salary, skills) | Marketplace | ❌ | ❌ | `job-marketplace.md` |
| **Saved jobs** | Marketplace, dashboard | ❌ | ❌ | `job-marketplace.md` |
| **Job alerts** (saved searches → notify) | Notifications | ❌ | ❌ | `job-marketplace.md` |
| **Company profile / branding pages** (+ "actively reviewing", responds-in-X, freshness) | Marketplace, job detail | ❌ | ❌ | `job-marketplace.md` |
| **Messaging** — recruiter ↔ candidate chat ("chat with candidate") | Messaging | ❌ | ❌ | `messaging.md` |
| **Notifications center** — persisted feed + bell (only transient emails today) | Notifications, shells | ❌ | ❌ | `notifications-center.md` |
| **Proctored video + voice interview UI** (voice pipeline built; camera + the visual/audio proctoring detectors + the proctored room UI are not) | AI interview | 🟡 BE | ❌ | `2026-06-20-proctored-integrity.md` |
| ~~Async video interview~~ — **CUT** (live proctored video+voice is the sole modality) | — | — | — | — |
| **Practice mode** (self-serve interview) | (planned) | ❌ | ❌ | `candidate-growth.md` |
| **Skill-gap feedback** (candidate-facing growth) | Skill-gap feedback | ❌ | ❌ | `candidate-growth.md` |
| **Coding assessments + `run_code` sandbox** | (rich assessments) | ❌ | ❌ | `rich-assessments.md` + `code-execution-sandbox.md` |
| **Proctored integrity** (strict live proctoring: face/gaze/movement/second-face/phone/audio + device; integrity timeline + HIGH-severity auto-gate) | AI interview, AI report | 🟡 40-signal model + `/proctor` + `proctoring_events` built; **visual/audio detectors stubbed, optional consent, unsurfaced** | ❌ | `2026-06-20-proctored-integrity.md` |
| **Advisory gate** — `gate_mode` (auto/advisory) + `assessment_review` state + recruiter toggle | Post-a-job, applicants | ❌ | ❌ | `compliance-advisory-gate.md` |
| **No-ghosting KPIs** (outcome-rate, avg response time) | Recruiter dashboard, analytics | ❌ | ❌ | `notifications-center.md` / analytics |
| **Rich marketing landing** (hero/search/how-it-works) — a basic home page exists | Landing | 🟡 basic | 🟡 basic | §A of `screens-frontend-build-plan.md` |

## 🟡 Partial (one side built, or only a basic version)
| Feature | Status | Gap |
|---|---|---|
| **Public job detail** | FE page exists but **authed**, not public/SSR | make it the public `/public/jobs/{id}` SSR page (`job-marketplace.md`) |
| **Post-a-job form** | title + JD + "Improve with AI" built; **salary/skills/remote/type fields not captured** | extend the form (`job-marketplace.md`) |
| **Talent pool** | lists applicants; **no search by skill** | `SearchCandidates` (`job-marketplace.md`) |
| **Proctored interview** | text interview + 40-signal proctoring model built; **not strict** (camera/mic detectors stubbed, mute/camera-off exist, optional consent, no auto-gate) — needs the strict proctored video+voice room | `2026-06-20-proctored-integrity.md` |
| **AI candidate report** | overall score + highlights/risks + decision built; **no score-ring, per-competency evidence quotes, or proctoring integrity band** (mockup enhancements) | report polish + `2026-06-20-proctored-integrity.md` |
| **Responsive / mobile** | some `sm:` patterns; **not comprehensively designed for mobile** | per-screen mobile pass (build plan) |
| **SSO / Google** | code built (OAuth client + buttons); **not live-configured** (was behind a fake) | set a real Google OAuth app + credentials in config |

## ✅ Built (works end-to-end today)
Auth (register/login/verify/forgot/reset) · **SSO code** (needs Google creds) · candidate profile
(résumé upload → AI parse → edit) · basic landing/home · apply + consent · **aptitude MCQ**
(AI-generated, timed, auto-grade, gate) · **AI text interview** + evaluator scoring · **AI report**
(overall score, highlights/risks, recommendation, decision controls) · **AI match** (candidate recs +
ranked applicants) · **AI JD assist** (`/jd/improve`) · **AI assistant chat** (`/chat/turn`, RAG-cited)
· recruiter dashboard / jobs · **analytics** (funnel + score distribution) · talent pool (list) · dark
mode · decision/gate-override · **voice interview backend** (no UI) · proctoring backend (partial).

## How to read this for the build
The v2 increments (`v2/README.md` build order) close these gaps in priority order: **Inc 1
(marketplace)** is the single biggest chunk of red above; **Inc 4 (messaging + notifications)** closes
the two engagement gaps; **Inc 2 (assessments)**, **Inc 3 (voice UI)**, **Inc 5 (growth)**, **Inc 6
(video)** close the rest. The mockups are the visual target; the `screens-frontend-build-plan.md` maps
each to its components.
