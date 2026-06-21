# Robustness Phase 2 — HANDOFF (2026-06-21)

Phase 2 closed: every admin resource function emits structured op-logs, `AuthDomainError`
flows through the central translator, every catch-and-reraise block logs before re-raise,
the presigned-URL silent-failure is gone, and magic-number timeouts are replaced with
settings knobs. `scripts/.log_coverage_allowlist.txt` is empty (header-only) — any new
admin resource function added without `log_context` hard-blocks the gate.

**Branch:** `main` · **Base:** `52819a2` · **HEAD:** `30874b3` · **36 commits**
**Gate:** `bash scripts/check.sh` exit 0 (with the pre-existing macOS `os.killpg` flake
noted in Phase 1 HANDOFF — re-run if it fires).

## Shipped

### P2-1 — AuthDomainError → AppError migration (2 commits)
- `129d96c` — `feat(admin): migrate AuthDomainError to inherit lib.errors.AppError`
- `adb4ea2` — `refactor(admin): drop _STATUS dict in routes/auth.py — central translator covers it`

`app.errors.AuthDomainError` now inherits `lib.errors.AppError`; specific subclasses get
multi-inheritance from their `lib.errors.*` peer (`NotFoundError`, `ConflictError`,
`ValidationError`, `InvalidCredentialsError`, `ForbiddenError`, `InvalidTransition`,
`LimitExceededError`). `InvalidTokenError` and `RateLimitedError` retain manual handling
(no lib peer). 10 new tests verify the translator maps each admin error to the correct
gRPC status without per-route ladders. The `_STATUS` dict in `routes/auth.py` was
simplified to delegate primary translation to `lib.errors.to_grpc_status`.

### P2-2..P2-4 — `log_context` coverage (28 commits + 1 chore cleanup)

**104 admin resource functions wrapped across 28 files.** One commit per file, smallest
files single-func, biggest 12 funcs (auth.py).

Batch A (identity workstream, 6 files / 38 funcs): auth(12) settings(11) team(6)
company_profile(4) profile(3) preferences(2). Commits `a41a83e..a30aa9e`.

Batch B (funnel + compliance, 7 files / 26 funcs): scheduling(8) scheduler(4)
compliance(4) application(4) report(3) decision(2) funnel(1). Commits
`720da10..f3ef6a0`. One chore commit `4bd66c8` corrected an allowlist that didn't
strip in the original application.py commit (cce9ee2) because a `&&` chain broke
on E501.

Batch C (everything else, 15 files / 40 funcs): notification(5) job(5) rubric(4)
messaging(4) saved_jobs(3) job_alerts(3) coding(3) analytics(3) recommendations(2)
discovery(2) aptitude(2) talent(1) sourcing(1) recommend(1) integrity(1). Commits
`28c6c73..e346f3f`.

Pattern applied everywhere:
```python
async def <funcname>(<args>):
    async with log_context(
        log,
        "resource.<file_stem>.<funcname>",
        **bind_ids(user_id=..., comp_id=..., application_id=..., job_id=...),
    ):
        # body, re-indented one level
```

### P2-5 — Error logs in catch-and-reraise blocks (3 commits)
- `702b39d` — `fix(mcp-data): log.exception before re-raise in 19 catch blocks`
- `8c5b954` — `fix(mcp-capability): log.exception before re-raise in embed + kb_search`
- `14f013d` — `fix(ai-agents): log.exception in sessions + mcp_capability catch blocks`

25 catch-and-reraise blocks across mcp-data, mcp-capability, and ai-agents now log
`log.exception(...)` before re-raising. Prometheus counters preserved. The `ingest()`
per-source loop in mcp-capability/tools.py (line 270) was correctly left alone — it's
an intentional BE-#11 per-source isolation soft-fail.

### P2-6 — Cleanup sweep (2 commits)
- `0baa2a2` — `fix(admin/company_profile): surface DependencyError on presigned URL failure`
- `30874b3` — `refactor: replace magic-number timeouts with lib.timeouts.* knobs`

The `_logo_url` helper in `company_profile.py` no longer swallows storage exceptions —
real S3 failures now raise `DependencyError`, mapped to gRPC `UNAVAILABLE` by the
central translator. Missing key / `storage=None` still returns `""` (intentional). 3
new tests verify behavior. No pre-existing test depended on the swallow.

Magic-number timeouts at three sites replaced with `lib.timeouts.*` accessors:
- `src/ai-agents/app/infra/gemini.py` — `timeout=30` → `timeouts.llm_call()` (sentinel).
- `src/mcp-capability/app/seams/fetcher.py` — default-arg `timeout=10` →
  `timeouts.http_client()` (sentinel inside body).
- `src/admin/app/infra/oauth.py` — `httpx.AsyncClient(timeout=10)` → `timeouts.http_client()`.

Three sites explicitly skipped: `lib/lib/grpcweb.py:230` (framework deadline boundary),
`lib/lib/storage/client.py:54-55` (botocore config constants, not call-site), and
`lib/lib/execution/runner.py:132,145` (sandbox-specific runner).

### P2-6b — Audit-log gap sweep: **no actionable gaps found**

All 5 mutation-heavy resource files (`auth`, `settings`, `team`, `compliance`,
`decision`, `funnel`) already write `AuditLog` rows. `job.py` uses the event bus
as its lifecycle record by design. The Phase 0 audit cited gaps that have since
been closed; nothing to do.

## Verification

```
$ bash scripts/check.sh
==> ruff format (check)
==> ruff lint (incl. security S-rules)
==> robustness guards (timeouts + log-coverage)
==> pip-audit (dependency CVEs)
==> lib tests                      144 passed (occasional macOS killpg flake — re-run)
==> admin tests                    480+ passed (new coverage tests added)
==> ai-agents tests                302+ passed
==> mcp-data tests                 46 passed
==> mcp-capability tests           49 passed
==> GATE PASSED
```

**Allowlist state:** `scripts/.log_coverage_allowlist.txt` contains only header
comments. The lint guard hard-blocks any new admin resource function added without
`log_context`.

## Behavior delta (document this for the changelog)

- Every admin resource function emits structured `op.start`/`op.done`/`op.error` log
  lines with `duration_ms` and bound ids (correlation_id, user_id, comp_id,
  application_id, job_id). Server-side log volume grows; observability spike is
  expected and intentional.
- `AuthDomainError` subclasses now route through the central gRPC translator. gRPC
  status codes the client sees are UNCHANGED (the translator produces the same codes
  the old `_STATUS` dicts produced).
- `_logo_url` raises `DependencyError` on actual S3 failure → gRPC `UNAVAILABLE` (was
  silent empty string). FE will see an explicit error.
- All LLM/HTTP timeouts tunable via env (`LLM_CALL_TIMEOUT_SECONDS`,
  `HTTP_CLIENT_TIMEOUT_SECONDS`).
- ~25 backend catch blocks now produce full tracebacks in logs when re-raising. Useful
  for diagnostics; log volume rises.

## Notes for Phase 3+

### `_STATUS` cleanup follow-on (deferred from P2-1)

The P2-1 implementer flagged: 22 routes modules import `_STATUS` from
`src/admin/app/routes/auth.py` and call `_STATUS.get(type(exc), INTERNAL)` directly.
The `_STATUS` dict was simplified in `routes/auth.py` itself, but full cleanup of the
22 callers (replacing their `_STATUS.get` with `lib.errors.to_grpc_status`) is a
follow-on refactor — non-blocking, behavior-preserving. Suggest a Phase 6 polish task.

### AST checker compromise (deferred to Phase 6)

`scripts/check_log_coverage.py` requires `log_context` as the LITERAL first statement
of the function body. ~6 docstrings across resource files were converted to inline
comments inside the `async with` block to satisfy the AST check. A nicer fix:
update the checker to allow `[docstring, log_context]` as the first two statements.
Add to Phase 6 polish.

### Pre-existing flake

`lib/tests/test_execution.py::test_runs_and_captures_stdout` and siblings
intermittently fail on macOS with `PermissionError: [Errno 1] Operation not
permitted` at `os.killpg(proc.pid, signal.SIGKILL)`. Re-run the gate; not Phase 2's
fault. Phase 6 should `contextlib.suppress(PermissionError)` in
`lib/execution/runner.py:99/:143`.

## What Phase 3 consumes

- Every admin resource is observable end-to-end (start/done/error with duration_ms).
- All typed domain errors flow through the central translator + `log_domain_error`.
- The empty `.log_coverage_allowlist.txt` means any new uninstrumented admin resource
  hard-blocks the gate.
- Phase 3 (FE robustness sweep) can rely on backend NEVER swallowing errors silently
  and NEVER leaking traceback noise to logs for expected domain errors.

## What Phase 3 will tackle

Frontend robustness sweep (per the program spec §3 Phase 3):
- Settings page — remove `USE_MOCK_SETTINGS` env gate; all `settings.*` RPCs live.
- Resume-parse polling — jittered exponential backoff.
- Report polling (`applicants/[appId]`) — max-poll cap + manual-refresh fallback.
- Dashboard polling — backoff + cap.
- Defensive field access on cast-seam reports.
- Friendly error-message mapping — gRPC code → user message.
- Submit-button disabled state.
- ICS RPC error surfacing.
