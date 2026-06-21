# Robustness Phase 3 — HANDOFF (2026-06-21)

Phase 3 closed: every long-poll site is capped with backoff, settings + appearance
are live-only (no NEXT_PUBLIC_MOCK runtime gate), every error toast routes through
the friendly `errorMessage()` helper, ICS failures surface a toast on both schedule
pages, every primary submit button is disabled on invalid/pending. Defensive
cast-seam in `toReportDTO` means a sparse protobuf response no longer renders as
false zeros.

**Branch:** `main` · **Base:** `93c170a` · **HEAD:** `7929e41` · **7 commits**
**Gate:** `pnpm -r typecheck` exit 0 · `pnpm build` exit 0 for `@ip/candidate` and
`@ip/company` · BE `bash scripts/check.sh` untouched (no backend changes).

## Shipped

| # | Task | Commit |
|---|---|---|
| P3-1 | `pollingBackoff()` helper in `@ip/shared` — Tanstack-Query `refetchInterval` callback with capped exponential backoff + jitter + max-poll stop. 4 Vitest cases. | `b690eff` |
| P3-2 | `apps/candidate/app/profile/page.tsx` — resume-parse polling: 500ms initial, 5s cap, 24 polls (~3 min), 20% jitter; "Still parsing your resume…" toast fires once at `dataUpdateCount === 4`. | `111f46e` |
| P3-3 | `apps/candidate/components/dashboard.tsx` — applications polling: 10s initial, 60s cap, 18 polls (~9 min), 15% jitter; preserves existing "no in-flight → don't poll" early return. | `e6e1529` |
| P3-4 | `apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx` — report polling: 3s initial, 10s cap, 60 polls (~5 min); proxies `Math.max(dataUpdateCount, errorUpdateCount)` so NOT_FOUND retries also count; manual "Check again" UI at cap; `toReportDTO` defensive on every field (`typeof === "string"`, `Array.isArray`, `typeof === "number"` guards — no `as any`). | `4a87d46` |
| P3-5 | `apps/candidate/app/settings/{settings,appearance}-client.ts` — removed `USE_MOCK_SETTINGS` / `USE_MOCK` runtime gate. `makeMock*` factories stay exported for tests. | `1279404` |
| P3-7 (auth) | `apps/candidate/app/login/page.tsx`, `register/page.tsx` — `disabled={mutation.isPending \|\| !isValid}` + `mode: "onChange"` where missing. 2 pages updated; 10 already-OK. | `a39873a` |
| P3-7 (company) | `apps/candidate/app/company/{register,rubrics,onboarding}/page.tsx` — same pattern; 3 pages updated; preserves intentional UX patterns (rubrics' "edit until first save attempt"). | `7929e41` |

## Tasks completed with no work needed

- **P3-6 (ICS toast)** — both `addToCalendar` functions in `apps/candidate/app/schedule/page.tsx` and
  `apps/candidate/app/company/jobs/[id]/applicants/[appId]/schedule/page.tsx` already had `try/catch
  { toast.error(errorMessage(err)) }`. Audit confirmed; no commit needed.
- **P3-8 (errorMessage() coverage)** — scanned 6 `toast.error` sites lacking `errorMessage`: 4 are
  pure validation guards (file type/size, required fields), 1 is intentional domain copy ("That
  time was just taken"), 1 is intentionally neutral for security (forgot-password never reveals
  account existence). Zero convertible. Helper coverage already complete.

## Verification

```
$ cd frontend && npx pnpm@9.15.0 -r typecheck
@ip/shared: tsc --noEmit exit 0
@ip/ui:     tsc --noEmit exit 0
@ip/api-client: tsc --noEmit exit 0
@ip/candidate:  tsc --noEmit exit 0
@ip/company:    tsc --noEmit exit 0

$ cd frontend && npx pnpm@9.15.0 --filter @ip/candidate build
✓ Compiled successfully — 50 routes

$ cd frontend && npx pnpm@9.15.0 --filter @ip/company build
✓ Compiled successfully
```

BE gate `bash scripts/check.sh` re-run: GATE PASSED (Phase 3 introduced no backend
changes; the macOS `os.killpg` flake in `lib/tests/test_execution.py` was last seen
in Phase 2 and is unrelated to FE work).

## Behavior delta

- **Profile / dashboard / applicant report no longer poll forever.** Each has a hard
  poll-count cap; reaching it stops the auto-refresh. The applicant-report page shows
  a manual "Check again" button on cap so recruiters can re-trigger without leaving
  the page.
- **Resume parsing surfaces user feedback after ~10s of polling.** A single toast,
  not a noisy loop.
- **Settings + Appearance are live-RPC only.** A `NEXT_PUBLIC_MOCK=1` env var no
  longer silently fakes persistence — devs working offline need to mock at a higher
  layer (e.g. msw, or talk to the backend).
- **Cast-seam reports degrade gracefully.** A protobuf response missing
  `executive_summary` now renders an empty string, not the field name as a string,
  and missing arrays render as `[]` instead of throwing.
- **Submit buttons accurately reflect form state.** No more spam-click while
  invalid; no more double-submit while a mutation is in-flight.

## Carried-forward concerns (Phase 6 polish)

- **`@ip/shared` has no `test` script and vitest is not a devDep.** Tests run via
  `npx vitest run` (downloads on demand). For CI, add `vitest` as a devDependency
  and `"test": "vitest run"` to `package.json`. Same for `@ip/candidate` if a CI
  step assumes `pnpm test`.
- **`mode: "onChange"` on a few existing React Hook Form usages would be a UX
  improvement** (live validity update, button activates as user fills the form
  correctly), but adding it required reasoning about other validation effects —
  deferred where unsure.
- All Phase-2 backlog items still open: 22 routes modules using legacy
  `_STATUS.get`, AST checker docstring exemption, macOS `os.killpg` suppress.

## What Phase 4 consumes

- Every FE page that polls a long-running operation has a predictable cap and
  user-feedback story.
- Settings is live-RPC; mock-vs-live ambiguity is gone.
- The cast-seam pattern in `toReportDTO` is the template for Phase 4's
  `IntegrityTimeline` migration: when the real RPC ships, swap the seam without
  fearing partial-response crashes.

## What Phase 4 will tackle

Missing-RPC wirings (per the program spec §3 Phase 4):
- `decisions.holdApplication` + `decisions.rejectApplication` end-to-end.
- `reports.getIntegrityTimeline` end-to-end (replaces FE cast-seam mock).
- Server-side cursor pagination on `listApplicants`, `getCandidateRecommendations`,
  `listNotifications`, `talent.getTalentPool`.
- Unified mark-read shared backend resource for messaging + notification.
