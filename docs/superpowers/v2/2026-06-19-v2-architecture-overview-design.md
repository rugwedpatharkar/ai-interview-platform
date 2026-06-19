# Aptura v2 — Architecture Overview (Unified AI Hiring Platform)

> **Canonical v2 design.** Read this first; then the per-pillar specs it links in §9. This
> supersedes `ARCHITECTURE.md` for v2 scope (which it points at). The approved planning artifact
> is `~/.claude/plans/yes-create-a-newly-snoopy-graham.md`.
>
> **Status:** design, awaiting review. No production code yet — the v2 build is a later,
> separately green-lit phase. **Local-only project; never run git/gh.**

---

## 1. Vision & thesis

The market offers **job portals** (LinkedIn, Indeed, Naukri…) *or* **AI interview/screening tools**
(HireVue, Karat, Metaview, Mercor…), rarely both well-integrated. Our thesis: **unify a job
marketplace with an AI-driven screening/interview engine** — plus the supporting facilities a
modern product needs — in one two-sided, multi-tenant platform.

**The gap v2 closes.** Today the product is a **closed, invite-driven AI-screening funnel**: a
candidate can only apply to a job whose id they already hold (via the AI recommendation widget or a
shared link). There is **no search, browse, or discovery** — a candidate with no invite literally
cannot find a job. v2 adds the marketplace half and rounds the product into a feature-rich whole,
while keeping the AI screening engine (the differentiator) intact.

**Why it wins — the problem-driven thesis: _the job platform that doesn't ghost you — and gives a
result employers can trust._** v2 is built to fix the two best-documented failures of the categories
it unifies — application silence/ghosting (55% never hear back) and AI-interview results that can be
gamed (cheating doubled to 35%, 48% in tech) — and the unification is what makes the fixes possible.
A pass means something because the interview is **rigorously proctored** and no one can game it. Full
analysis:
[`2026-06-19-problems-and-differentiators-design.md`](2026-06-19-problems-and-differentiators-design.md);
integrity is enforced by strict, fully-proctored interviews:
[`2026-06-20-proctored-integrity.md`](2026-06-20-proctored-integrity.md) (supersedes the old
integrity-by-design pillar).

> **Pivot (2026-06-20):** repositioned from "no surveillance" to **rigorous proctored integrity** —
> the AI interview is camera+mic-required, no-mute, fullscreen-locked, all 40 proctoring signals
> live, hard auto-gate on HIGH-severity cheating, with the full integrity timeline + score surfaced
> to recruiters. Canonical: `2026-06-20-proctored-integrity.md`.

---

## 2. v2 posture & locked decisions

- **Evolve the foundation.** Keep the proven 4-service event-driven backend, the MCP split, the
  `lib` shared package, the `@ip/ui` design system, and the gRPC-web transport. No re-architecture —
  v2 is additive layers + targeted evolutions on a working base.
- **Demo-first, compliance-ready.** Build the FULL feature set (incl. all AI screening: auto-grade,
  scoring, ranking) for the demo/dev phase. Keep the human-override, audit, and consent hooks (all
  already present) so commercializing later is a config flip, not a rebuild. See §6.
- **Excluded entirely** (create standalone legal regimes + need paid third-party vendors for ~zero
  demo value): **ID/identity verification, background/reference checks, biometric *identity* matching
  (face/voice → a named person).** Behavioral/AV **proctoring is in scope and live** (2026-06-20
  pivot — all 40 signals, hard auto-gate; `2026-06-20-proctored-integrity.md`), no longer dormant.
- **v2 core scope = four pillars:** A) Job Marketplace, B) Richer Assessments, C) Live Video + Voice
  Interview, D) Comms & Candidate Growth.
- **Working name: Aptura** — a working title used while building. Collision-noted (an *Aptura AI*
  software company already exists), so trademark clearance + the final brand happen at launch; the
  architecture is name-agnostic, making the eventual swap trivial.

---

## 3. System at a glance (v2)

```
   Anonymous web ─┐                         ┌───────────────────────────────┐
   (SEO / browse) │   SSR fetch (no auth)   │           ADMIN               │  owns MongoDB
                  └────────────────────────►│  • gRPC-web (authed actions)  │  (source of truth)
   Candidate app ─┐   gRPC-web (authed)     │  • /public/* REST (read-only) │  ← NEW read surface
   (Next.js)      ├────────────────────────►│  • /auth/oauth/* (SSO)        │     for SEO pages
   Company app ───┘                         │  funnel state machine + CAS   │
                                            └───────┬───────────────┬───────┘
                                       RabbitMQ events │             │ HTTP RPC (interview turns,
                                       {domain}.{action}│            │ chat SSE, jd, rtc-token)
                                                       ▼             ▼
                                            ┌───────────────────────────────┐
                                            │          AI-AGENTS             │  LangGraph + Gemini
                                            │  agents · interview (live      │  (stateless compute)
                                            │  video+voice✓) · evaluator ·   │
                                            │  matcher · assistant · NEW:    │
                                            │  practice · run_code grader    │
                                            └───────┬───────────────┬───────┘
                                              MCP   │               │  MCP
                                                    ▼               ▼
                                          ┌────────────┐   ┌──────────────────┐
                                          │  mcp-data  │   │  mcp-capability  │
                                          │ (Mongo —   │   │ parse · embed ·  │
                                          │  sole DB   │   │ kb_search · NEW: │
                                          │  gateway)  │   │ run_code sandbox │
                                          └─────┬──────┘   └───────┬──────────┘
                                                ▼                  ▼
                                            MongoDB         Qdrant · Redis · MinIO(S3)
                                                            · LiveKit (voice)

  Shared infra: MongoDB · Redis · RabbitMQ · MinIO/S3 · Qdrant · LiveKit
  NEW in v2 are marked ✓/NEW; everything else exists today.
```

The one structural addition is the **`/public/*` read-only REST surface** on admin (mounted via the
existing `_oauth_dispatcher` pattern, served by the same uvicorn process), consumed by Next.js SSR
so the job/company catalog is crawlable and reachable without a token. Everything else is new
*capabilities* on the existing services, not new services.

---

## 4. Module map

Tags: **[built]** exists + works · **[evolve]** exists, extend · **[new]** does not exist.

| # | Module | Tag | v2 scope |
|---|--------|-----|----------|
| 1 | Identity & Access | [built] | Auth/SSO, JWT, roles, multi-tenant `comp_id` |
| 2 | Candidate Profile | [built] | Résumé → `profile_parser` → structured profile |
| 3 | **Job Marketplace / Discovery** | **[new]** | Public search/browse/facets, job + company pages, saved jobs, alerts, recs feed — **Pillar A** |
| 4 | Applications & Funnel | [evolve] | CAS machine; add `assessment_review` + advisory gate |
| 5 | **Assessments** | [evolve] | MCQ today; add coding + skills kinds + grader registry — **Pillar B** |
| 6 | **AI Interview — live video + voice** | [evolve] | One live real-time room (camera + mic) reusing the built voice pipeline + the interviewer/evaluator brain; text interview + async video removed — **Pillar C** |
| 7 | Scoring & Reports | [built] | Evaluator (temp-0, evidence) → report-writer → xlsx |
| 8 | Matching & Recommendations | [built] | Embedding matcher; powers the discovery feed |
| 9 | Recruiter Workspace | [evolve] | Jobs/applicants/rubrics/talent/decisions; + sourcing + inbox |
| 10 | Conversational Assistant | [built] | Scoped chat router, SSE, RAG-grounded |
| 11 | **Messaging** | **[new]** | Candidate↔recruiter threads tied to an application — **Pillar D** |
| 12 | Notifications Center | [evolve] | Persisted in-app feed + email on `TransitionNotifier` — **Pillar D** |
| 13 | **Candidate Growth** | **[new]** | Practice interview + skill-gap feedback — **Pillar D** |
| 14 | Analytics | [built] | Funnel + score-distribution; + assessment/messaging dims |
| 15 | Trust / Operational | [evolve] | Audit, consent, erasure, override — kept as mitigations |
| 16 | Platform / Admin | [built] | Config, index authority, schedulers, MCP topology |
| 17 | Design System | [built] | `@ip/ui` + `@ip/shared` + `@ip/api-client` |
| 18 | **Settings & Security** | **[new]** | Notification prefs, 2FA, password/email change, sessions — `settings-and-security` |
| 19 | **Team & Permissions** | **[new]** | Seats, RBAC matrix, member mgmt — `team-and-permissions` |
| 20 | **Interview Scheduling** | **[new]** | Book the live interview after the AI screen passes — `interview-scheduling` |
| 21 | **Onboarding** | **[new]** | Candidate + employer first-run + empty states — `onboarding` |
| 22 | **Platform Hardening** | [evolve] | Rate-limits · observability/health · retention · index-migration · tests — `platform-hardening` |

---

> **v2 complete (2026-06-19):** modules 18–22 + the Part-A "should-have" additions close the
> completeness audit (`2026-06-19-v2-completeness-audit.md`). v2 scope = the original 4 pillars +
> these modules + the per-pillar Part-B fixes; the *later* tier (billing, i18n, a11y audit,
> API/webhooks, data export) is a tracked backlog, not in the launch cut.

## 5. The four pillars (summaries — each has its own spec, §9)

### Pillar A — Job Marketplace & Discovery  *(the headline new subsystem)*
Turns the closed funnel into a true two-sided portal. **Discovery flow:** anonymous browse/search →
public job/company page → **Apply triggers sign-in + consent** (unchanged). **Search:** MongoDB
`$text` + compound/`$facet` for v2.0 (no new infra; Mongo is community 7, no Atlas Search), with a
Qdrant semantic `best_match` re-rank in v2.1 (reuse the matcher's JD embeddings). **Public pages:**
a `/public/*` Starlette read app on admin + Next.js SSR. **New data:** extend `jobs` (location,
remote_mode, employment_type, salary, skills, posted_at) + `company_profiles`, `saved_jobs`,
`job_alerts`. **New gRPC services:** Discovery, SavedJobs, JobAlerts, CompanyProfile + employer
`SearchCandidates`. → `…-job-marketplace-design.md`

### Pillar B — Richer Assessments
Generalize the MCQ-only aptitude engine into a **typed, multi-kind assessment engine** (mcq / coding
/ free_text) with a **grader registry**, emitting the *same* `aptitude.graded` event (funnel
untouched). The one new infra piece is a **`run_code` sandbox** in mcp-capability behind a
`CodeRunner` Protocol — ephemeral per-submission Docker container, network-off, resource-capped,
non-root, always `finally`-killed. → `…-rich-assessments-design.md`, `…-code-execution-sandbox-design.md`

### Pillar C — Live Video + Voice Interview
> **Modality decision (2026-06-20, locked):** the AI interview is **one live, real-time video +
> voice session** — the candidate joins a LiveKit room with **camera + mic** and converses with the
> adaptive interviewer aloud and on camera; real-time STT yields the transcript the brain scores
> **unchanged**. The typed **text interview** (legacy core) and the **async recorded-video** increment
> are **removed**; there is exactly one interview modality.

The interviewer/evaluator **brain is reused unchanged** (identical transcript shape → funnel/scoring
untouched). **Voice backend is already built** (`resources/voice/*`, `infra/voice/*`,
`voice_worker.py`, `rtc_token`, `silero_vad.onnx`); the live room **adds a video track** to that
existing voice pipeline — mostly frontend + LiveKit config. v2 builds the **candidate UI**
(`voice-room.tsx`, `@ip/shared/voice.ts`) + finishes E2E (execute the existing
`../plans/2026-06-19-voice-interview.md` TIER D — don't rewrite). **Strict proctoring:** camera + mic
are **required** (no mute), the room is **fullscreen-locked**, and **all 40 proctoring signals** run
live (face/gaze/head-move/second-face/phone/second-voice/tab/copy-paste/devtools/screen-share/
virtual-cam…), server-scored by severity. Enforcement = mandatory capture + a **hard auto-gate on
HIGH-severity cheating** (second face, phone, screen-share, virtual cam, synthetic audio →
auto-terminate/flag) + the **full integrity timeline + score surfaced to recruiters**, who judge the
rest — so a pass is a result employers can trust. → `2026-06-20-proctored-integrity.md`

### Pillar D — Comms & Candidate Growth
- **Messaging:** candidate↔recruiter threads (one per application, `comp_id`-scoped). **gRPC-web
  send + SSE/poll receive** (reuse the existing chat SSE pattern; no new websocket infra).
- **Notifications Center:** persist a `notifications` store for an in-app feed; `TransitionNotifier`
  writes a row **and** emails. Bell/feed in both apps; email via the injected `Notifier` seam.
- **Practice Mode:** candidate-initiated self-serve interview reusing `interview_host` +
  `interviewer` + `evaluator` over the **same live video+voice modality**, **detached from any
  application** (no `comp_id`, no funnel event, no recruiter visibility) — sidesteps the AI-screening
  risk surface.
- **Skill-Gap Feedback:** render the evaluator's per-competency output as candidate growth feedback;
  shown only for practice or post-decision. → `…-messaging-design.md`, `…-notifications-center-design.md`,
  `…-candidate-growth-design.md`

---

## 6. Compliance-ready model

The hooks already exist; v2 mostly **flips defaults to human-first** and wires them into the UI.

- **Advisory-ready gate (keep auto-grade).** Add `gate_mode: "auto" | "advisory"` to
  `AptitudeConfig` (`model/job.py`). Branch `funnel.next_state` on `aptitude.graded`: `auto` (demo
  default) keeps `pass→interview_pending / else→gated_out`; `advisory` routes **both** outcomes to a
  new `assessment_review` state where the recruiter decides — never auto-rejecting a human out of
  the funnel. `gate.override` already exists; every transition already writes an `AuditLog`.
- **Keep as mitigations:** audit log, consent ledger (`automated_evaluation`), erasure cascade.
  **Extend `CandidateEraser`** to every new artifact (assessment attempts, code submissions,
  messages, practice sessions) — the single most important compliance follow-through.
- **Cut permanently:** ID verification, background checks, biometric **identity** matching (face/voice
  → a named person).
- **Now in scope (2026-06-20 pivot):** behavioral/AV **proctoring** (gaze/audio/device/screen + all 40
  signals) is **live and enforced**, not dormant — see `2026-06-20-proctored-integrity.md`. Treated as
  biometric/sensitive data; consent + retention + jurisdiction review required before commercial launch.
- **Recommended production default:** `advisory` (even though `auto` is the demo default).

> Why this matters: AI scoring/ranking/interview tools are exactly what NYC Local Law 144 / EU AI
> Act regulate (Automated Employment Decision Tools). Keeping a human as the decider (advisory) keeps
> the regulatory risk on the *decision* low while preserving the full feature set for demos.
>
> **Pivot note (2026-06-20):** v2 now **does proctor** — strict camera/mic-required interviews with
> all 40 signals (`2026-06-20-proctored-integrity.md`). Face/gaze/recording = **biometric/sensitive
> data**: a knowing demo-time trade. Launch needs consent/retention/jurisdiction review (BIPA, GDPR
> Art. 9, EU AI Act) before this ships commercially.

---

## 7. Data ownership & event topology

- **admin owns MongoDB** (single source of truth); **ai-agents is stateless**, reaching data only
  via `mcp-data` and capabilities via `mcp-capability`. Unchanged in v2.
- **New collections:** `company_profiles`, `saved_jobs`, `job_alerts`, `message_threads` +
  `messages`, `notifications`, `practice_sessions`, `code_submissions`; Qdrant
  `jobs:catalog` (v2.1 semantic rerank). All tenant docs carry `comp_id` where applicable; all
  indexes declared in `admin/infra/db.py` (the single index authority).
- **Extended:** `jobs` (filter fields + `posted_at`), `AptitudeConfig.gate_mode`, `AptitudeAttempt`
  (per-section + kind).
- **New funnel state:** `assessment_review` (advisory mode). **New events:** messaging
  (`message.sent`), notification fan-out, assessment-ready — all `{domain}.{action}` on the existing
  topic exchange. The **funnel remains the integration seam**: new stages are added via the
  `ApplicationState`/`FunnelEvent` enums + `next_state`, never side-channels (preserves CAS, audit,
  idempotency).

---

## 8. Build phasing (later phase — for context)

| Inc | Name | Why this order |
|-----|------|----------------|
| **0** | Compliance-ready toggle (gate modes + `assessment_review` + erasure-cascade stubs) | Tiny; touches the funnel seam everything extends; makes new artifacts erasable from day one |
| **1** | Marketplace / discovery (Pillar A) | The front door; read-side, no AI risk; gives the demo its two-sided shape |
| **2** | Richer assessments + code sandbox (Pillar B) | Biggest differentiator + only new infra; reuses `aptitude.graded` |
| **3** | Live video + voice interview — frontend + E2E (Pillar C) | Backend already built (add a video track to the voice pipeline); the sole interview modality; execute the existing voice plan |
| **4** | Messaging + notifications center (Pillar D) | Closes the loop both sides; reuses SSE/chat-window/notifier |
| **5** | Candidate growth: practice + skill-gap (Pillar D) | Lowest-risk AI surface; retention; reuses interview+eval |
| **7** | Analytics + recruiter compare polish | Add assessment/messaging dimensions once data exists |

Proctoring is **live and enforced** in Inc 3 (2026-06-20 pivot — all 40 signals + hard auto-gate on
HIGH-severity cheating; `2026-06-20-proctored-integrity.md`), no longer wired-but-dormant.

---

## 9. Spec & plan index

Each pillar gets a **design spec** (`docs/superpowers/specs/`) + a **TDD implementation plan**
(`docs/superpowers/plans/`). Status updated as authored.

| Area | Spec | Plan | Status |
|---|---|---|---|
| Architecture overview | `2026-06-19-v2-architecture-overview-design.md` | — | ✅ this doc |
| Problems & differentiators | `2026-06-19-problems-and-differentiators-design.md` | — | ✅ authored |
| ~~Integrity by design (non-surveillance)~~ | `2026-06-19-integrity-by-design-design.md` | `2026-06-19-integrity-by-design.md` | ⚠️ **SUPERSEDED** by proctored integrity (2026-06-20) |
| **Proctored integrity (strict, cheat-proof)** | `2026-06-20-proctored-integrity.md` | — | ✅ canonical (supersedes integrity-by-design) |
| Inc 0 — Compliance-ready gate | `…-compliance-advisory-gate-design.md` | `…-compliance-advisory-gate.md` | ✅ authored |
| Inc 1 — Job marketplace | `…-job-marketplace-design.md` | `…-job-marketplace.md` | ✅ authored |
| Inc 2 — Rich assessments | `…-rich-assessments-design.md` | `…-rich-assessments.md` | ✅ authored |
| Inc 2 — Code sandbox | `…-code-execution-sandbox-design.md` | `…-code-execution-sandbox.md` | ✅ authored |
| Inc 3 — Live video + voice frontend/E2E | (reuse) | `../plans/2026-06-19-voice-interview.md` (execute) | ✅ plan exists |
| Inc 4 — Messaging | `…-messaging-design.md` | `…-messaging.md` | ✅ authored |
| Inc 4 — Notifications center | `…-notifications-center-design.md` | `…-notifications-center.md` | ✅ authored |
| Inc 5 — Candidate growth | `…-candidate-growth-design.md` | `…-candidate-growth.md` | ✅ authored |

(All `…` files are dated `2026-06-19-`.)

---

## 10. Open items
- **Brand name** — **Aptura** (working title; trademark-clear + finalize at launch). Does not block design or build.
- **v2 code build** — a later, separately green-lit phase. Each pillar's plan is reviewed before its
  build; `bash scripts/check.sh` (baseline 423 tests) stays green; new offline code lives behind
  injected seams (CodeRunner, voice/video engines, Notifier) with fakes so the gate stays offline.
