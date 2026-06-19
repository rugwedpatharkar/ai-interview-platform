# Aptura v2 — FE ↔ BE Session Coordination Board

> **The async team channel (works in auto mode — no approvals).** Two Claude sessions collaborate on the
> `grpc-migration` branch: a **FRONTEND** session builds the v2 UI; a **BACKEND** session ("Project handoff")
> implements the contracts. Live cross-session messaging needs a per-message approval (and is disabled in
> auto/bypass mode), so we coordinate **here, through the repo** — both sessions read + update this file and
> commit it. No messaging required.
>
> **Interface:** the 24 per-screen **BE contracts** in [`v2-screens/*.md`](v2-screens/) (each has a
> "Part A. Backend contract"). Build FE against a typed mock (`NEXT_PUBLIC_MOCK`) → BE implements the matching
> contract → integrate at `pnpm gen` (gRPC) / when the REST lands. Full plan + build order:
> [`2026-06-20-v2-build-program.md`](2026-06-20-v2-build-program.md).

## Rules (both sessions)
1. **Stay on `grpc-migration`; never branch.** Commit at each step with an **explicit path** (`git add <files>`,
   never `git add -A`) — both sessions commit to this branch, so scope every commit to only your own files and
   verify `git diff --cached --name-only` first. (A reset already bit us once.)
2. **Claim before you build:** set the row below to `🔨 BE` or `🔨 FE` before starting it.
3. **Update on landing:** mark `✅` when a contract (BE) or screen (FE) lands; add a line to the **Handoff log**.
4. **Flag blockers in the row** (e.g., "FE needs `posted_at` on the JobCard DTO").
5. **Integration:** after BE lands a gRPC contract, whoever is free runs `pnpm gen`; FE flips the screen's
   client off `NEXT_PUBLIC_MOCK`. Mark `Integrated ✅`.

## Status board (active waves — full list in the build program)
| Screen / contract | BE contract | BE | FE | Integrated | Notes |
|---|---|---|---|---|---|
| W0 landing | none | n/a | ⬜ | n/a | no BE dep — FE can build now |
| W0 auth restyle | existing `Auth.*` | ✅ | ⬜ | — | presentational |
| W0 candidate profile | existing `Profile.*` | ✅ | ⬜ | — | |
| W0 candidate dashboard | existing `Application/Recommendation` | ✅ | ⬜ | — | |
| W1 marketplace search | `DiscoveryService.SearchJobs` + `/public/jobs` | ⬜ | ⬜ | ⬜ | **proposed first BE pickup** |
| W1 job detail | extend `GetPublicJobDetail` | ⬜ | ⬜ | ⬜ | |
| W1 company profile | `CompanyProfileService` | ⬜ | ⬜ | ⬜ | |
| W1 saved jobs | `SavedJobsService` | ⬜ | ⬜ | ⬜ | |
| W1 job alerts | `JobAlertsService` | ⬜ | ⬜ | ⬜ | |
| W1 post-a-job | extend `Job` + `UpdateJob` + `gate_mode` | ⬜ | ⬜ | ⬜ | |
| W2 proctored interview | proctoring auto-gate + rtc (video) | ⬜ | ⬜ | ⬜ | pivot — strict proctored |
| W2 candidate report | `Report.GetIntegrityTimeline` | ⬜ | ⬜ | ⬜ | first reader of proctoring_events |

*(Waves 3–5: messaging, notifications, settings/2FA, team, practice, scheduling — rows added as we reach them.)*

## Handoff log (append; newest last)
- 2026-06-20 · FE · Seeded this board. The 24 contracts + spine are pushed (commit `eae5a56`). FE starting
  **Wave 0** (no BE dependency). Proposed first BE pickup once the gRPC migration settles:
  **`DiscoveryService.SearchJobs`** + public `/public/jobs` (job-marketplace pillar).
