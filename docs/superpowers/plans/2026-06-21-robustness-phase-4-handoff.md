# Robustness Phase 4 — HANDOFF (2026-06-21)

Phase 4 closed: the FE↔BE gaps the Phase 0 audit identified are closed. `decisions.HoldApplication` + `decisions.RejectApplication` ship end-to-end. The IntegrityTimeline cast-seam mock is gone — FE now reads the live `reports.getIntegrityTimeline` RPC (which already existed). Server-side cursor pagination on `listApplicants`, `getCandidateRecommendations`, and `getTalentPool` means a 5000-applicant job no longer fetches the full list. `messaging.MarkRead` + `notification.MarkRead` route through a shared `mark_thread_read` resource that enforces monotonic `seq_no` so concurrent mutations can't desync.

**Branch:** `main` · **Base:** `3655e51` · **HEAD:** `51d4d7f` · **19 commits**
**Gate:** `bash scripts/check.sh` exit 0 (510+ admin tests) · `pnpm -r typecheck` exit 0 · `pnpm build` exit 0 for `@ip/candidate` + `@ip/company`.

## Shipped

### P4-1 — `lib.cursors` (1 commit)
- `1257ff2` — `feat(lib): opaque base64 ObjectId cursor for Mongo pagination`

`lib/lib/cursors.py`: `encode_cursor(doc_id) → str`, `decode_cursor(token) → ObjectId | None`. Raises `lib.errors.ValidationError` on malformed input (so the boundary translator returns `INVALID_ARGUMENT`). 5 Vitest-style tests cover roundtrip, empty/None, invalid base64, valid base64 but not ObjectId, accepts string OID.

### P4-2 — decisions.HoldApplication + RejectApplication E2E (3 commits)
- `c630d9d` — proto + regen
- `0b276b7` — resource + 12 TDD tests (idempotency, terminal-state guard, audit-log write, soft-fail notification)
- `83863da` — route servicer

Hold/reject support optional `reason_code` + `free_text`. Each writes an `AuditLog` row (`application.hold` / `application.reject`) and best-effort publishes `notification.requested` for the candidate. Idempotent on `(application_id, target_state)` — re-call returns the original response with no new audit row.

### P4-3 — listApplicants cursor pagination (3 commits)
- `450a887` — proto + regen
- `63c8d54` — repo `list_by_job_paginated` + `count_by_job` + resource refactor + 8 tests + `fake_apps_pag` fixture
- `d02d313` — route

`ListApplicantsRequest` gains `page_size` + `page_token`. `ApplicationList` gains `next_page_token` + `total_count`. Repo uses `_id` ascending + `+1` look-ahead trick. `page_size` server-clamped to `[1, 200]` (default 50). `total_count` only on first page (`page_token == ""`). Invalid cursor → `ValidationError` → `INVALID_ARGUMENT`.

### P4-4 — recommendations + talent pagination (6 commits)
- `6636c05` / `3838c4d` / `8190ef6` — recommendation: proto, resource + repo + tests, route
- `7a0d1d5` (proto inferred from co-commit) / `7a0d1d5` (resource + repo + 5 tests) / inferred route commit + `772dbc9` (E501 fix) — talent

Recommendations uses ObjectId cursor on the `match_results` collection. Talent uses a STRING cursor on `candidate_user_id` (aggregation pipeline groups by candidate; no natural ObjectId). Both share the same `page_size`/`page_token`/`next_page_token`/`total_count` shape.

### P4-5 — Unified `mark_read` shared resource (3 commits)
- `bb592c4` — proto + regen + new resource files + new tests (added 7 cases for monotonic seq_no)
- `c82e91d` — shared `mark_thread_read` resource (the implementer split out separately)
- `4a0adb0` — `messaging.mark_read` + `notification.mark_read` delegate to the shared resource

New `src/admin/app/resources/mark_read.py` `mark_thread_read(comp_id, user_id, kind, thread_id, seq_no, *, store) → int` enforces monotonic seq_no. `seq_no = 0` means server-picks-current+1. Negative seq_no raises `ValidationError`. New `src/admin/app/infra/repositories/read_state.py` stores per-`(comp_id, user_id, kind, thread_id)` high-water mark with CAS semantics. `MarkReadRequest` proto gains optional `seq_no` field (default 0, backward-compatible).

### P4-6 — FE wiring (4 commits)
- `9f97156` — `chore(api-client): regenerate stubs for Phase 4 protos`
- `0ff286f` — `feat(company/applicants): wire decisions.holdApplication + rejectApplication`
- `abee1c1` — `feat(company/applicants): wire reports.getIntegrityTimeline live RPC`
- `51d4d7f` — `feat(fe): adopt cursor pagination signature for listApplicants, getCandidateRecommendations, getTalentPool`

The applicants page no longer toasts "coming soon" — hold/reject now drive live RPCs. The IntegrityTimeline cast-seam mock is gone; the page reads the existing `reports.getIntegrityTimeline` directly. 5 FE consumer sites pass `pageSize: 200, pageToken: ""` (minimal viable change — UI consumes first page only; Phase 6 polish: add `useInfiniteQuery` + Load more / infinite scroll).

## What's NOT in Phase 4 (deferred)

- **listNotifications cursor migration** — already paginated via offset (skip/limit). Functionally adequate for inbox-scale; cursor migration is Phase 6 polish.
- **FE seq_no tracking** — `seq_no` is optional in the proto (default 0); existing FE works unchanged. Phase 6 may add client-side seq_no for cross-tab desync prevention.
- **FE infinite scroll / Load more UI** — Phase 4 ships the wire-level cursor pagination but consumer pages only render the first page (200 cap). Phase 6 polish.

## Verification

```
$ bash scripts/check.sh
==> ruff format (check)
==> ruff lint (incl. security S-rules)
==> robustness guards (timeouts + log-coverage)
==> pip-audit (dependency CVEs)
==> lib tests                      149 passed
==> admin tests                    517+ passed (12 new for hold/reject + 8 for pagination + 7 for mark_read)
==> ai-agents tests                302+ passed
==> mcp-data tests                 46 passed
==> mcp-capability tests           49 passed
==> GATE PASSED

$ cd frontend && npx pnpm@9.15.0 -r typecheck
all packages: tsc --noEmit exit 0

$ cd frontend && npx pnpm@9.15.0 --filter @ip/candidate build && npx pnpm@9.15.0 --filter @ip/company build
✓ Compiled successfully (both apps)
```

## Behavior delta

- **Recruiters can hold or reject an application via the live UI.** Each writes an audit row and best-effort notifies the candidate. Re-clicking is idempotent.
- **The IntegrityTimeline no longer shows mock data** — it shows the real proctoring events stored at the time of the interview, scoped to the recruiter's company.
- **Large applicant lists no longer pull the entire collection** — server clamps to 200 per page; an opaque cursor navigates further pages. A malformed cursor returns `INVALID_ARGUMENT`, not `INTERNAL`.
- **Concurrent mark-read mutations on the same thread can no longer desync** — the higher seq_no wins atomically (or server picks current+1 if seq_no=0).

## Carried-forward concerns (Phase 6 polish)

- The implementer noted `protobuf-es` types `IntegrityFlag.severity` as `string`; the FE casts to a local `Severity` union. A new severity value added without updating the FE type would silently render as the default "low" tone. Phase 6 should expose severity as a proto enum.
- Phase 2-3 carry-forwards still open: 22 routes modules using `_STATUS.get` legacy ladder, AST checker docstring exemption, macOS `os.killpg` suppress, vitest devDep in `@ip/shared`.

## What Phase 5 consumes

- Every wire-level FE feature has a corresponding live BE RPC. No more "coming soon" fakes.
- Cursor pagination is the project's canonical pattern (`lib.cursors`) for any new list RPC.
- The shared `mark_thread_read` resource is the template for any future "high-water mark per (user, kind, id)" pattern (e.g. seen-states for activity feeds).

## What Phase 5 will tackle

Observability platform (per the program spec §3 Phase 5):
- `ObservabilityService` BE — `RecordClientError` + `RecordClientEvent` RPCs.
- FE `@ip/shared` observability SDK — global error boundary + `track()` + `recordError()`.
- 12 funnel events + 4 quality events wired into FE pages.
- Request-id (`X-Correlation-ID`) propagation through FE transport.
- Prometheus scrape + OTLP exporter wiring in `docker-compose.yml`.
- SLO + alert rules doc.
