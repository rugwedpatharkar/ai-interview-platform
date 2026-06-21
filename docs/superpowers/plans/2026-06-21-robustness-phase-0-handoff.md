# Robustness Phase 0 — HANDOFF (2026-06-21)

Phase 0 closed: the shared `lib/` primitives that the next 5 phases of the platform
robustness + observability program consume have landed on `main`. **No service code
was touched** — services keep their old code paths until Phase 1 starts consuming
the new helpers.

**Gate:** `bash scripts/check.sh` exit 0 — all 9 stages green (format, lint, two new
robustness guards, pip-audit, lib/admin/ai-agents/mcp-data/mcp-capability test suites).

**Spec:** `docs/superpowers/specs/2026-06-21-platform-robustness-and-observability-design.md`
**Plan:** `docs/superpowers/plans/2026-06-21-robustness-phase-0-shared-infrastructure.md`

## Shipped

| Module | Public API | Why |
|---|---|---|
| `lib/lib/errors.py` | `AppError` base + 8 subclasses (`ValidationError`, `NotFoundError`, `ConflictError`, `PermissionError`, `AuthError`, `DependencyError`, `BusinessRuleError`, `InternalError`) · `TimeoutError = OperationTimeout` alias · `to_grpc_status(err) -> (StatusCode, str)` · `_STATUS_MAP` | Typed boundary — internals raise, the central translator catches at egress. Generalises the `d4f0271` register-validation fix. |
| `lib/lib/timeouts.py` | `mongo()`, `redis()`, `rabbitmq_publish()`, `llm_call()`, `llm_retries()`, `mcp_call()`, `storage_op()`, `http_client()` | Env-driven knobs (8 new `BaseServiceSettings` fields); no magic numbers in call sites. |
| `lib/lib/logging.py` | `log_domain_error(log, err, **ctx)` | DEBUG-no-traceback log for expected domain errors at the gRPC boundary. Kills the `24e117b` traceback noise. |
| `lib/lib/grpcweb.py` | `_translate_exception_to_status()` + central handler integration in BOTH unary and server-streaming `except` blocks | Single source of truth at egress — replaces per-resource `_STATUS` ladders. Existing `_UNAVAILABLE_ERRORS` fallback preserved for legacy callers. |
| `lib/lib/audit.py` | `write_audit(repo, doc)` · `enqueue_replay(redis, doc)` (idempotent via per-event_id `SET NX EX`, 24h TTL) · `drain_replay(repo, redis, *, batch=50)` | Compliance-critical audit-write primitive + retryable replay queue. |
| `scripts/check_timeouts.py` + `.timeouts_allowlist.txt` | Walks `lib/lib`, `src/admin`, `src/ai-agents`, `src/mcp-data`, `src/mcp-capability`. Greps external-call patterns outside `with_timeout(...)` windows. Exits non-zero on unallowlisted hits. Allowlist seeded with **50 currently-uninstrumented sites**. | Gate enforcement: Phase 1 shrinks the allowlist file-by-file as it wraps calls. |
| `scripts/check_log_coverage.py` + `.log_coverage_allowlist.txt` | AST walk of `src/admin/app/resources/*.py`. Flags `async def`s whose body doesn't start with `async with log_context(...)`. Allowlist seeded with **104 currently-unwrapped functions**. | Gate enforcement: Phase 2 shrinks the allowlist as it adds `log_context`. |
| `scripts/check.sh` | New "robustness guards" stage between `ruff check` and `pip-audit` | Both new guards run on every gate invocation; regression is impossible. |
| `ruff.toml` | Added `S603`, `S607` to the existing `**/tests/**` per-file-ignore | The new gate-guard tests use `subprocess.run` — that's the test's whole point. |

## Verification (the run that closed Phase 0)

```
$ bash scripts/check.sh
==> ruff format (check)
==> ruff lint (incl. security S-rules)
==> robustness guards (timeouts + log-coverage)
==> pip-audit (dependency CVEs)
==> lib tests
==> admin tests
==> ai-agents tests
==> mcp-data tests
==> mcp-capability tests
==> GATE PASSED
```

**Test deltas added by Phase 0:**
- `lib/tests/test_errors.py` — 6 cases (4 hierarchy + 2 `to_grpc_status`)
- `lib/tests/test_timeouts.py` — 2 cases (env-override + defaults)
- `lib/tests/test_logging.py` — 2 new cases (`log_domain_error` DEBUG-no-traceback + bind-path)
- `lib/tests/test_grpcweb.py` — 5 cases (AppError routing + AuthError + NotFound + unknown→INTERNAL + OperationTimeout→DEADLINE_EXCEEDED)
- `lib/tests/test_audit.py` — 5 cases (write_audit success + DependencyError + enqueue dedup + drain_replay success/failure + missing-event_id ValueError)
- `scripts/tests/test_check_timeouts.py` — 2 cases (clean run + new-violation-detected)
- `scripts/tests/test_check_log_coverage.py` — 6 cases (clean + violation + wrapped passes + private skipped + `__init__` skipped + `--seed` works)

## Commits (20 total on main, 005a520..e827b8d)

Phase work was implemented via subagent-driven development (one subagent per task,
review after each, fix-and-re-review for the Important findings, plan-correction
commits where the brief turned out to be wrong).

Key plan corrections caught during execution:
- `# noqa: A001` mandate dropped — project's ruff doesn't enable `A`, so `RUF100`
  strips unused suppressions. Repeated in Task 1 and Task 5 contexts.
- Task-2 reference test had an operator-precedence bug in the assertion. Fixed in
  both the plan and the implementation.
- Task-6 audit dedup used a shared SET key with single TTL refresh — replaced with
  per-event_id `SET NX EX` for true 24-hour dedup window.
- Task-7 implementer needed `S603`/`S607` added to the existing test per-file-ignore.
- Task-8 allowlist seeded with absolute paths — fixed to repo-relative for CI portability.

## What Phase 1 will consume

| New helper | Consumer site in Phase 1 |
|---|---|
| `with_timeout(coro, timeouts.mongo(), op=...)` | All ~18 raw Mongo calls in `src/mcp-data/app/tools.py` (drop their lines from `.timeouts_allowlist.txt`) |
| `with_timeout(coro, timeouts.redis(), op=...)` | 7 Redis calls in `src/mcp-capability/app/tools.py` + 4 calls in `src/ai-agents/app/infra/sessions.py` |
| `log_domain_error(log, err)` | At gRPC boundary catch sites once Phase 2 rewires resources to raise typed `AppError` |
| `audit.write_audit` + `audit.enqueue_replay` | Phase 2's audit-log gap sweep + a new `audit_replay_drainer` consumer service that calls `drain_replay` on a schedule |

## What Phase 0 does NOT touch (deferred to Phase 1+)

- Service code in `src/` — Phases 1, 2, 4, 5, 6.
- Frontend code — Phases 1, 3, 5, 6.
- The `@idempotent_by(...)` decorator-comment pair — Phase 2.
- The `audit_replay_drainer` consumer service — Phase 2.
- Wiring the new translator into per-service servicers (replacing per-resource
  `_STATUS` dicts) — Phase 2.

## Next plan to write

`docs/superpowers/plans/2026-06-21-robustness-phase-1-stop-the-bleeding.md` — the
deploy-blocking P0 sweep (mcp-data Mongo timeouts, mcp-capability Redis timeouts,
ai-agents session-store timeouts, FE transport cookie-refresh timeout, FE cross-tab
token sync, demote expected-domain-error tracebacks).
