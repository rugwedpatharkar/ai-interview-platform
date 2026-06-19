# Aptura v2 — Unified AI Hiring Platform · Design & Implementation Docs

> **Entry point for v2.** Everything needed to implement v2 lives in this folder. Read in the order
> below. **Status: design complete, build pending** (a separately green-lit phase). **Local-only
> project — never run git/gh.**

## What v2 is
Turns the current closed, invite-only AI-screening funnel into a **unified job marketplace + AI
interview product**. Posture: **evolve** the existing 4-service backend + `@ip/ui` frontend; **demo-
first, compliance-ready** (full AI screening built; human-override/audit/consent kept); **excluded
entirely: ID verification, background checks, biometric *identity* matching.** **Behavioral/AV
proctoring is in scope and live** (2026-06-20 pivot — strict, cheat-proof interview; see
[proctored integrity](2026-06-20-proctored-integrity.md)).

## Read order
1. **[Architecture overview](2026-06-19-v2-architecture-overview-design.md)** — the canonical map (modules, pillars, phasing, contracts).
2. **[Problems & differentiators](2026-06-19-problems-and-differentiators-design.md)** — *why* v2 wins: "doesn't ghost you, and gives a result you can trust."
3. Then each pillar spec + plan below, in build order.
4. **[Screens frontend build plan](2026-06-19-screens-frontend-build-plan.md)** — the screen-by-screen UI build map (pairs with the `docs/brand/` mockups + UI/UX standard). The visual layer over the pillar FE tiers.
5. **[Backend build plan](2026-06-20-backend-build-plan.md)** — the service-by-service backend build map (collections/indexes/RPCs/endpoints/events/agents/seams per feature, grounded in code). The backend counterpart to #4; the connective tissue over the pillar BE tiers.

## Index (spec → plan, with coverage)

| Inc | Pillar | Spec | Plan | Coverage |
|----|--------|------|------|----------|
| 0 | Compliance-ready advisory gate | [spec](2026-06-19-compliance-advisory-gate-design.md) | [plan](2026-06-19-compliance-advisory-gate.md) | **BE + FE detailed** |
| 1 | Job marketplace & discovery | [spec](2026-06-19-job-marketplace-design.md) | [plan](2026-06-19-job-marketplace.md) | **BE + FE detailed** |
| 2 | Rich assessments | [spec](2026-06-19-rich-assessments-design.md) | [plan](2026-06-19-rich-assessments.md) | **BE + FE detailed** (candidate coding-test UI) |
| 2 | Code-execution sandbox | [spec](2026-06-19-code-execution-sandbox-design.md) | [plan](2026-06-19-code-execution-sandbox.md) | Infra only (no FE — correct) |
| 3 | **Live video + voice interview** (frontend/E2E) | *(reuse)* | [../plans/2026-06-19-voice-interview.md](../plans/2026-06-19-voice-interview.md) | Backend built; FE/E2E in that plan (TIER D) |
| 4 | Messaging | [spec](2026-06-19-messaging-design.md) | [plan](2026-06-19-messaging.md) | **BE + FE detailed** |
| 4 | Notifications center | [spec](2026-06-19-notifications-center-design.md) | [plan](2026-06-19-notifications-center.md) | **BE + FE detailed** |
| 5 | Candidate growth (practice + skill-gap) | [spec](2026-06-19-candidate-growth-design.md) | [plan](2026-06-19-candidate-growth.md) | **BE + FE detailed** |
| — | ~~Integrity by design (non-surveillance)~~ | [spec](2026-06-19-integrity-by-design-design.md) | [plan](2026-06-19-integrity-by-design.md) | ⚠️ **SUPERSEDED** (2026-06-20) by proctored integrity |
| — | **Proctored integrity (strict, cheat-proof)** | [spec](2026-06-20-proctored-integrity.md) | — | Canonical: camera+mic required, all 40 signals, hard auto-gate, integrity timeline surfaced |

> **Frontend coverage (updated 2026-06-19):** **every pillar now carries a detailed frontend tier**
> (routes, `@ip/ui` components, TanStack Query, api-client wiring, forms, loading/empty/error/
> responsive/dark/a11y, build+typecheck steps). Code-execution-sandbox is infra-only (no FE, by design).

## Design, screens & completeness docs
- **[Landing / main page design](2026-06-20-landing-page-design.md)** — the marketing front door (candidate-app `/`): competitor analysis (13 sites) + section-by-section spec + build notes. Differentiator-led (no-ghosting · proctored-integrity/cheat-proof · merit); role-forked, search-first hero. Pairs with the `aptura_landing_page` mockup. *(Mockup's no-surveillance copy is superseded by the 2026-06-20 proctored-integrity pivot.)*
- **[Screens frontend build plan](2026-06-19-screens-frontend-build-plan.md)** — screen-by-screen UI build map (pairs with the mockups + brand).
- **[Backend build plan](2026-06-20-backend-build-plan.md)** — service-by-service backend build map (feature → collections/indexes/RPCs/endpoints/events/agents/seams), grounded in code; consolidates the pillar BE tiers + the 5 new modules.
- **[▶ v2 build program (execution)](../plans/2026-06-20-v2-build-program.md)** + **[24 per-screen plans](../plans/v2-screens/)** — the implementation layer (planning done 2026-06-20, **code green-lit next**): each screen = a **BE-requirement contract** (a backend session implements standalone) + a **bite-sized TDD frontend plan**; build FE against a typed mock while BE lands in parallel, integrate at `pnpm gen`. Grounded in the real `frontend/` + backend code.
- **[Implementation gap register](2026-06-19-implementation-gap-register.md)** — mockups vs. what's actually built (what's *not* implemented yet).
- **[v2 completeness audit](2026-06-19-v2-completeness-audit.md)** — fitting additions + plan gaps to make v2 "provide everything."
- **Brand & design** (`../../brand/`): [positioning](../../brand/aptura-positioning.md) · [visual identity](../../brand/aptura-visual-identity.md) · [design system](../../brand/aptura-design-system.md) · [UI/UX standard](../../brand/aptura-ui-ux.md).
- **New completeness modules** (spec + plan each, from the audit): [settings & security](2026-06-19-settings-and-security-design.md) · [team & permissions](2026-06-19-team-and-permissions-design.md) · [interview scheduling](2026-06-19-interview-scheduling-design.md) · [onboarding](2026-06-19-onboarding-design.md) · [platform hardening](2026-06-19-platform-hardening-design.md).

## Build sequence
`Inc 0` (compliance-ready toggle + erasure stubs — foundational) → `Inc 1` (marketplace) →
`Inc 2` (assessments + sandbox) → `Inc 3` (video + voice FE/E2E — the sole interview modality) →
`Inc 4` (messaging + notifications) → `Inc 5` (candidate growth) → analytics/polish. **Proctoring is
live in Inc 3** (2026-06-20 pivot — all 40 signals + hard auto-gate; `2026-06-20-proctored-integrity.md`),
no longer wired-but-dormant.

> **Interview-modality decision (2026-06-20, locked):** the AI interview is **one live, real-time
> video + voice room** (camera + mic). The typed **text interview**, the **async recorded-video**
> increment, and the standalone **voice-only room** are all **removed** — there is exactly one
> interview modality.

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
- `../plans/2026-06-19-proctoring-integrity-mvp.md` — **superseded** by [proctored integrity](2026-06-20-proctored-integrity.md) (2026-06-20 pivot); content-integrity signals (rotation/watermark/probing) survive and now sit alongside the full 40-signal proctoring suite.
- `2026-06-19-integrity-by-design-design.md` / `2026-06-19-integrity-by-design.md` — **superseded** (2026-06-20) by [proctored integrity](2026-06-20-proctored-integrity.md); the "non-surveillance" stance is reversed.
- Approved planning artifact: `~/.claude/plans/yes-create-a-newly-snoopy-graham.md`.
