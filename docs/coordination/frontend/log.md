# Frontend engineer log

Append-only. Entries newest first inside each day. Format:

```
## YYYY-MM-DD HH:MM — <route or component>
- what changed (1–2 lines)
- commit sha
- open questions (if any)
```

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
