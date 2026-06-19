# v2 — Unified AI Hiring Platform · Design & Implementation Docs

> **Entry point for v2.** Everything needed to implement v2 lives in this folder. Read in the order
> below. **Status: design complete, build pending** (a separately green-lit phase). **Local-only
> project — never run git/gh.**

## What v2 is
Turns the current closed, invite-only AI-screening funnel into a **unified job marketplace + AI
interview product**. Posture: **evolve** the existing 4-service backend + `@ip/ui` frontend; **demo-
first, compliance-ready** (full AI screening built; human-override/audit/consent kept); **excluded
entirely: ID verification, background checks, biometric proctoring.**

## Read order
1. **[Architecture overview](2026-06-19-v2-architecture-overview-design.md)** — the canonical map (modules, pillars, phasing, contracts).
2. **[Problems & differentiators](2026-06-19-problems-and-differentiators-design.md)** — *why* v2 wins: "doesn't ghost you, doesn't surveil you."
3. Then each pillar spec + plan below, in build order.

## Index (spec → plan, with coverage)

| Inc | Pillar | Spec | Plan | Coverage |
|----|--------|------|------|----------|
| 0 | Compliance-ready advisory gate | [spec](2026-06-19-compliance-advisory-gate-design.md) | [plan](2026-06-19-compliance-advisory-gate.md) | BE detailed · **FE gap** (recruiter gate-mode toggle + `assessment_review` queue) |
| 1 | Job marketplace & discovery | [spec](2026-06-19-job-marketplace-design.md) | [plan](2026-06-19-job-marketplace.md) | **BE + FE detailed** |
| 2 | Rich assessments | [spec](2026-06-19-rich-assessments-design.md) | [plan](2026-06-19-rich-assessments.md) | BE detailed · **FE gap** (candidate coding-test UI) |
| 2 | Code-execution sandbox | [spec](2026-06-19-code-execution-sandbox-design.md) | [plan](2026-06-19-code-execution-sandbox.md) | Infra only (no FE — correct) |
| 3 | Voice interview (frontend/E2E) | *(reuse)* | [../plans/2026-06-19-voice-interview.md](../plans/2026-06-19-voice-interview.md) | Backend built; FE/E2E in that plan (TIER D) |
| 4 | Messaging | [spec](2026-06-19-messaging-design.md) | [plan](2026-06-19-messaging.md) | **BE + FE detailed** |
| 4 | Notifications center | [spec](2026-06-19-notifications-center-design.md) | [plan](2026-06-19-notifications-center.md) | **BE + FE detailed** |
| 5 | Candidate growth (practice + skill-gap) | [spec](2026-06-19-candidate-growth-design.md) | [plan](2026-06-19-candidate-growth.md) | **BE + FE detailed** |
| 6 | Async video interview | [spec](2026-06-19-async-video-interview-design.md) | [plan](2026-06-19-async-video-interview.md) | **BE + FE detailed** |
| — | Integrity by design (non-surveillance) | [spec](2026-06-19-integrity-by-design-design.md) | [plan](2026-06-19-integrity-by-design.md) | BE detailed · FE light (recruiter advisory band) |

> **Frontend coverage note (honest):** backend is fully specified across all pillars. Frontend is
> fully specified for Inc 1/4/5/6; **thin or missing for Inc 0, Inc 2 (rich assessments), and
> integrity** — those need a detailed frontend pass before their build (tracked as a follow-up).

## Build sequence
`Inc 0` (compliance-ready toggle + erasure stubs — foundational) → `Inc 1` (marketplace) →
`Inc 2` (assessments + sandbox) → `Inc 3` (voice FE/E2E) → `Inc 4` (messaging + notifications) →
`Inc 5` (candidate growth) → `Inc 6` (async video) → analytics/polish. Behavioral proctoring stays
wired-but-dormant (not in the sequence).

## Cross-cutting contracts (every pillar respects these)
- **Funnel is the integration seam** — new stages via `ApplicationState`/`FunnelEvent` enums + `next_state`, never side-channels.
- **`aptitude.graded`** stays the gate event (new assessment kinds + advisory gate plug in here).
- **`CandidateEraser` cascade** — every new artifact collection joins it (Inc 0 stubs the points).

## Conventions
- TDD, task-by-task (`- [ ]`); backend gate `bash scripts/check.sh` (baseline **423 tests**) stays green; `scripts/smoke_login.py --selftest` after any transport touch.
- Frontend verified by `npx pnpm@9.15.0 --filter @ip/{candidate,company} build` + `--filter @ip/{ui,shared,api-client} typecheck` (never `next build` while `pnpm dev` is live).
- New offline-unsafe code (code sandbox, voice/video engines, Notifier, LLM) lives behind injected seams with fakes so the gate stays offline.

## Related (outside this folder)
- `../plans/ARCHITECTURE.md`, `../plans/HANDOFF.md` — pre-v2 current-state docs (now point here).
- `../plans/2026-06-19-voice-interview.md` — Pillar C voice (backend built; execute its FE/E2E).
- `../plans/2026-06-19-proctoring-integrity-mvp.md` — **superseded** by integrity-by-design (its non-surveillance content-integrity part survives).
- Approved planning artifact: `~/.claude/plans/yes-create-a-newly-snoopy-graham.md`.
