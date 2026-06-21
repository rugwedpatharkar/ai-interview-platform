# Robustness Phase 1 — HANDOFF (2026-06-21)

Phase 1 closed: every raw external-call site in the four hot services is wrapped
with `with_timeout`, the `check_timeouts` guard is tightened to skip repo-wrapped
methods, expected `AuthDomainError` catches no longer log tracebacks.
`scripts/.timeouts_allowlist.txt` is empty (header-only) — any new uninstrumented
external call hard-blocks the gate.

**Branch:** `main` · **Base:** `aea46ed` · **HEAD:** `0e80f18` · **7 commits**
**Gate:** `bash scripts/check.sh` exit 0 (with one pre-existing flake noted below).

## Shipped

| # | Task | Sites wrapped | Commit |
|---|---|---|---|
| P1-1 | `scripts/check_timeouts.py` regex tightened to explicit pymongo + redis verb lists; `lib/lib/audit.py` excluded; 2-line forward-window for `httpx.AsyncClient(timeout=...)`; 21 false-positive lines stripped from allowlist | n/a (lint guard) | `f993720` |
| P1-2 | `src/mcp-data/app/tools.py`: 18 Mongo ops wrapped + 2 hidden inside `asyncio.gather()` | 18 + 2 = 20 | `00bce29`, `83a3a9e` |
| P1-3 | `src/mcp-capability/app/tools.py`: 7 Redis ops wrapped (kb_search + ingest paths) | 7 | `6866903` |
| P1-4 | `src/ai-agents/app/infra/sessions.py`: 3 Redis ops wrapped (save/get/list_in_progress) | 3 | `eb24b9c` |
| P1-5 | `src/ai-agents/app/infra/practice_sessions.py`: 2 Redis ops wrapped (save/get) | 2 | `02312d0` |
| P1-6 | `log_domain_error` tolerant of non-AppError types; `routes/auth.py:_abort` helper wraps 9 `AuthDomainError` catch sites + 1 explicit `InvalidTokenError` catch with DEBUG-no-traceback log; new `test_log_demotion.py` proves the refresh path | n/a (logging) | `0e80f18` |

**Total: 32 external-call sites timeout-wrapped + traceback noise eliminated for the documented expected-error paths.**

## Skipped (already shipped by parallel session at commit `0942dec`)

- `frontend/packages/shared/src/transport.ts` cookie-refresh `AbortController` + 8s timeout.
- `frontend/packages/shared/src/tokens.ts` cross-tab storage listener.
- `frontend/apps/candidate/app/login/page.tsx` redirect race fix.
- `frontend/apps/candidate/app/auth/callback/page.tsx` redirect timer fix.

The Phase 0 spec listed these as Phase 1 P0 FE items; the parallel session shipped them between Phase 0 close and Phase 1 start.

## Verification

```
$ bash scripts/check.sh
==> ruff format (check)
==> ruff lint (incl. security S-rules)
==> robustness guards (timeouts + log-coverage)
==> pip-audit (dependency CVEs)
==> lib tests                      144 passed
==> admin tests                    467 passed (added test_log_demotion)
==> ai-agents tests                302 passed
==> mcp-data tests                 46 passed
==> mcp-capability tests           49 passed
==> GATE PASSED
```

**Allowlist state:** `scripts/.timeouts_allowlist.txt` contains header comments only.

## Behavior delta (document this for the changelog)

- A Mongo call that previously hung indefinitely now raises `OperationTimeout` after
  10s (default; env `MONGO_OP_TIMEOUT_SECONDS`); the Phase-0 grpcweb translator maps
  this to gRPC `DEADLINE_EXCEEDED`. Clients see a failed call instead of waiting
  forever.
- A Redis call hang now raises after 5s (env `REDIS_OP_TIMEOUT_SECONDS`), same translation.
- Expected domain errors in the auth flow (refresh, verify, password-reset) no longer
  emit tracebacks server-side. They log a single line at DEBUG: `domain_error: <message> kind=<class>`.
  Clients still receive the correct gRPC status (`UNAUTHENTICATED`, `INVALID_ARGUMENT`, etc.).
- All timeouts tunable via env — no magic numbers in code.

## Pre-existing flakiness noted (NOT introduced by Phase 1)

`lib/tests/test_execution.py` intermittently fails on macOS with
`PermissionError: [Errno 1] Operation not permitted` at `os.killpg(proc.pid,
signal.SIGKILL)` (`lib/execution/runner.py:99`/`:143`). The signal call is blocked
by macOS sandboxing of a child process group. Stress-test: 3 consecutive gate runs
during Phase 1 produced two failures (different tests) and one full PASS. The
runner code is correct; the platform's signal-delivery contract isn't honored
under sandbox.

**Recommended Phase 6 follow-up:** add `contextlib.suppress(PermissionError)` to the
killpg fallback in `lib/execution/runner.py` so the test passes deterministically.

## What Phase 2 consumes

- The empty `scripts/.timeouts_allowlist.txt` means ANY new uninstrumented external
  call in `admin / ai-agents / mcp-data / mcp-capability` hard-blocks the gate.
- The tightened `check_timeouts.py` regex correctly skips repo-method calls (which
  delegate to `BaseRepository` and are already wrapped).
- `log_domain_error` is now tolerant of any exception type — Phase 2's admin
  resource-layer `log_context` coverage work can use it freely without first
  migrating errors to inherit `AppError`.

## What Phase 2 will tackle

- Admin resource-layer `log_context` coverage (~104 functions per the Phase-0 seeded
  allowlist `.log_coverage_allowlist.txt`).
- Add error logs to ~25 catch-and-reraise blocks in mcp-data/ai-agents that have
  no error context today.
- Replace per-resource `_STATUS` dicts with the Phase-0 central `AppError` translator
  (migration of `app.errors.AuthDomainError` to inherit `lib.errors.AppError` is the
  enabling step).
- Audit-log gap sweep — automated decisions, overrides, sensitive accesses without
  audit_log writes.
