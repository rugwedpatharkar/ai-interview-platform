# Log — Frontend

Append-only. Newest at bottom. See `../README.md` for entry format.

Individual dated sections below carry the FE session history through
2026-07-28 (audit + fixes + BE handoff) and 2026-07-29 (modernization
audit + six implementation waves). Format within a section: `## YYYY-MM-DD
HH:MM — <route or component>` heading, 1–2 line "what changed", commit
sha, optional "open questions".

---

## 2026-07-28 — session start

- Branch: `claude/candidate-frontend-audit-1ae381` (isolated worktree)
- Scope: 58 pages under `frontend/apps/candidate/app/**`, plus `@ip/ui` and `@ip/shared`.
- Layout: single Next.js 15 app (`@ip/candidate`), light-only, Aperture design system,
  React Query + AuthProvider + ObservabilityBoundary at the root.
- Marketing landing is server-rendered as `children`; dashboard swap happens post-mount
  once the localStorage token resolves.
- Kicking off route-group audit sweep next (see `docs/coordination/frontend/audit/`).

## 2026-07-28 — audit sweep complete (105 findings)

- 8 route-group agents (workflow `candidate-fe-audit-sweep`) walked every page under
  `app/**`, cross-referenced against `@ip/ui` + `@ip/shared`, and returned structured
  findings: 4 P0, 35 P1, 40 P2, 26 P3.
- Full report: `docs/coordination/frontend/audit/2026-07-28-full-audit.md`.
- 9 of the P0/P1s require BE work — bundled into a single BE handoff.

## 2026-07-28 — FE-only fixes landed (12 commits)

Every commit stays in one pattern category (project rule). Ordered:

- `ba76c3c` root-shell error surfaces + HomeClient flash
- `256f86b` SSO callback: scrub token from URL, real timeout, surface OAuth error
- `1479435` `?redirect=` round-tripped through login + guards
- `7eb1c96` marketplace filter/sort/page URL sync (share + refresh + back all work)
- `e8b4f18` three job-discovery lies (Similar roles, See all roles, "Apply" label)
- `9a63bc0` MegaNav Privacy link, skip-to-content, dead `/company/messages` sidebar link
- `4c1c4fb` outcome page: MAX_POLLS cap, gated_out CTA, real clipboard fail toast
- `b196ed1` interview self-view srcObject, countdown drift, aptitude beforeunload
- `d49396b` pilot / waitlist / status / practice / legal-TOC copy honesty
- `775d7f3` multi-line message composer, settings tab URL sync, guard forbidden-vs-login
- `7568b32` recruiter: post-job full payload, advance RPC swap, reason dialog,
             pipeline stretched-link, uncapped integrity flags
- `b0359eb` BE handoff doc

## 2026-07-28 — verification

- `npx pnpm@9.15.0 --filter @ip/shared --filter @ip/ui --filter @ip/candidate run typecheck` — clean
- `npx pnpm@9.15.0 --filter @ip/candidate build` — clean, all 58 routes compile
- Preview-based browser smoke: partial — `preview_start candidate` resolved the
  workspace to the primary working tree (not this worktree), so the visible
  /status still showed pre-fix copy. Typecheck + build ran against the worktree
  code and both passed, which is the authoritative gate here. A worktree-scoped
  dev command would land in a follow-up preview setup.

## 2026-07-28 — outbound handoffs

- `→ BE`: `docs/coordination/handoffs/2026-07-28-fe-to-be-audit-blockers.md`
  (9 P0/P1 backend-required items + 5 P2 non-blocking)
- `→ Manager`: `docs/coordination/handoffs/2026-07-28-fe-audit-complete.md`
  (this session's summary)

## 2026-07-29 — modernization workflow + implementation waves

Second pass — 8-dimension modernization audit via workflow
`candidate-fe-audit-sweep` (109 findings, 14 deliverables under
`docs/coordination/frontend/modernization/`). Then 6 implementation
waves against the FE-only quick-wins:

- `07fd159` Wave 1: candidate + a11y foundation (aptitude localStorage,
   timer ARIA, auth Field aria-invalid, redirect wiring, marketplace
   startTransition, dashboard dynamic import, QueryClient tuning,
   widened optimizePackageImports).
- `8514428` Wave 2: surface dark AI plumbing (dashboard recommendation
   hydration, recruiter pipeline getJobRankedCandidates ranking, JD
   skill-gap island, marketplace match-score chip).
- `98bc85e` Wave 3: recruiter productivity P1s (advance-decision reason
   dialog, talent debounced search, analytics no-ghosting KPIs band,
   post-a-job draft persistence hook, JD-improve revert, jobs list
   search + sort).
- `47f276b` Wave 4: infra (RSC split of aperture chrome →
   mega-nav/mega-footer/marketing-shell, landing bodies drop
   "use client", seven new loading.tsx files).
- `41dc085` Wave 5: a11y batch (Alert role by tone, NotificationItem
   anchor semantic, SkipToContent primitive on interview + aptitude,
   login error focus, onboarding step focus + step-3 skip).
- `b02e423` Wave 6: DS + polish (companies/[id] parallel fetches,
   latest-postings sort, Clash 700 preload, parseSkills memo,
   ApiClients type consolidation across 5 files, markRead
   recordError, Avatar deduped to @ip/ui).

Verification: typecheck across @ip/shared + @ip/ui + @ip/candidate,
`pnpm --filter @ip/candidate build` clean. Notable bundle drops:
- Marketing/legal routes (pilot, waitlist, /status, /dpa, /privacy,
  /terms, /trust, /sample-report, /what-we-dont-do, /hiring-teams):
  ≤108 kB First Load JS — was 238-256 kB.
- /login 156 kB (was 243 kB), /jobs 198 kB (was 250 kB),
  /jobs/[id] 205 kB (was 247 kB), /interview 174 kB (was 246 kB).
- 103 kB shared-chunk budget is the new floor.
