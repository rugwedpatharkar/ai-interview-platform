# Robustness Phase 6 — Polish + Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the program. Drain the carry-forward backlog from Phases 2-5, run a full chaos-injection verification of the closed-loop hire funnel, finalise the SLO targets, and emit the program-level HANDOFF that says "the platform meets the extreme-robustness bar set in the original spec". After Phase 6: every Phase 0 acceptance check from §5 of the spec is verifiable via a single command.

**Architecture:** This phase is a mosaic — small carry-forward fixes (lint rules, dev dependencies, legacy cleanups), one substantial FE/BE feature (messaging server-streaming replaces 30s long-poll), one substantial verification effort (chaos profiles with `toxiproxy` against the full E2E flow), plus the final docs (soft-fail classifier, SLO sign-off, program-closure HANDOFF). Each task is independently shippable; the final task ties everything together.

**Tech Stack:** Python 3.12, TypeScript 5.x, `toxiproxy` (for chaos), gRPC server-streaming (Phase 0 gRPC-web translator already supports it per `lib/lib/grpcweb.py`).

## Global Constraints

- Spec source: `docs/superpowers/specs/2026-06-21-platform-robustness-and-observability-design.md` (§3 Phase 6 + §5 Acceptance).
- Behavior preservation by default; targeted bug fixes allowed where audit-justified (carry-forwards have been audit-justified across earlier phases).
- TDD where applicable.
- Per-task commit on `main`; stage explicit paths only.
- Working directory: `/Users/rugwedpatharkar/Projects/Project`.
- pnpm `9.15.0`.
- Pre-commit gate per touched file: `ruff format --check` + `ruff check` + pytest (BE) OR `pnpm typecheck` + `pnpm build` (FE) — all exit 0. Full `bash scripts/check.sh` exit 0 after every BE commit.
- macOS `os.killpg` flake — Task 1 fixes it; until then re-run gate if it fires.
- No new `except: pass`, no nested `try/except`, no magic-number timeouts.

## Pre-Phase Audit (scouted)

- 24 routes files import `_STATUS` from `routes/auth.py` (per Phase 2 deferral) — confirmed by grep.
- `@ip/shared/package.json` has no vitest devDep / test script — confirmed.
- `lib/lib/execution/runner.py:99` calls `os.killpg` without suppression — confirmed.
- `frontend/apps/candidate/app/messages/page.tsx:69` polls at 30s — confirmed (Phase 5 left this as Phase 6 polish).
- 8 funnel events remain unwired (Phase 5 sampled 4 of 12).
- `check_log_coverage.py` AST checker requires `log_context` as literal first body statement — docstrings forced inline (Phase 2 deferral).
- `IntegrityFlag.severity` typed as `string` in protobuf-es; FE casts to local union (Phase 4 deferral).
- No `toxiproxy` profile or chaos compose overlay exists.

## File Structure (lock-in)

**Tasks 1-3: small cleanups (3 tasks, ~5 commits total)**
- Task 1 (quick-wins batch, 1-2 commits): `lib/lib/execution/runner.py` killpg suppress; `frontend/packages/shared/package.json` add vitest devDep + test script; `scripts/check_log_coverage.py` allow `[docstring, log_context]` as first 2 body statements.
- Task 2 (`_STATUS` legacy cleanup, 1 commit): 24 route files import `_STATUS` — replace with `lib.errors.to_grpc_status` where applicable; keep `InvalidTokenError`/`RateLimitedError` manual handling.
- Task 3 (severity enum, 1-2 commits): make `IntegrityFlag.severity` a proto enum; regen FE stubs; FE types cleanly.

**Task 4: 8 funnel events (1 commit)**
- Wire `application.started`/`application.submitted` (jobs/[id] + apply mutation), `aptitude.started`/`aptitude.submitted`, `interview.started`/`interview.completed`, `decision.made`, `notification.opened`.

**Task 5: voice-worker hardening (1-2 commits)**
- Graceful SIGTERM handler that drains active sessions + redis-checkpoints + exits cleanly.
- OTLP wiring (`init_tracing` at startup if `OTLP_ENDPOINT` set).

**Task 6: messaging SSE (substantial — multiple commits)**
- New proto: `MessagingService.StreamMessages(application_id) returns (stream Message)` — server-streaming.
- BE resource: long-poll Mongo change stream OR polled-emit-on-tick.
- FE: replace `useQuery` 30s poll with `for await` consumption (same pattern as existing `chat-stream.ts`).

**Task 7: chaos verification**
- New `docker-compose.chaos.yml` overlay with `toxiproxy` between services and Mongo/Redis/RabbitMQ.
- Profiles: `mongo-slow-500ms`, `redis-pause-2s`, `rabbitmq-restart`, `mcp-data-unavailable`.
- Script `scripts/run-chaos-smoke.sh` runs the closed-loop E2E (register→apply→aptitude→interview→report→decision→notify) under each profile.

**Task 8: program closure docs**
- `docs/superpowers/plans/SOFT_FAIL_CLASSIFIER.md` — every `try/except` block in the codebase tagged "hard-fail / soft-fail-by-design / pending".
- `docs/superpowers/plans/SLO_FINAL.md` — final SLO targets after baseline.
- `docs/superpowers/plans/2026-06-21-robustness-program-close.md` — program-level HANDOFF (all 6 phases + Phase 0 §5 acceptance checks verified).
- Memory pointer.

---

## Task 1 — Quick-wins batch

**Goal:** drain three small lint/test/infra carry-forwards in a single batch.

### Files
- Modify: `lib/lib/execution/runner.py` (suppress PermissionError on killpg/proc.wait)
- Modify: `frontend/packages/shared/package.json` (add `vitest` devDep + `test` script)
- Modify: `scripts/check_log_coverage.py` (AST checker allows docstring as 1st body statement, `log_context` as 2nd)
- Test: `scripts/tests/test_check_log_coverage.py` extend with docstring-allowed case

### Steps
- [ ] **1.1: killpg suppress.** In `lib/lib/execution/runner.py` around lines 99 + 145, wrap `os.killpg(...)` + `proc.wait(...)` in `contextlib.suppress(PermissionError)`. Document why in a one-line comment (macOS sandbox). Run `cd lib && ../.venv/bin/python -m pytest tests/test_execution.py -v` — flaky tests should now be deterministic.
- [ ] **1.2: vitest devDep.** Edit `frontend/packages/shared/package.json` — add `"vitest": "^2.0.0"` to `devDependencies` (or match the existing root version) + add `"test": "vitest run"` to scripts. Run `cd frontend && npx pnpm@9.15.0 install` then `cd frontend && npx pnpm@9.15.0 --filter @ip/shared test` — green.
- [ ] **1.3: AST checker allows docstring.** In `scripts/check_log_coverage.py` `_starts_with_log_context(fn)`, treat `[ast.Expr(Constant(str)), ast.AsyncWith(...)]` as a valid 2-statement prefix. Extend the test with one case showing a function with docstring + `async with log_context(...)` passes the checker.
- [ ] **1.4: Run full gate.**
```
bash scripts/check.sh
```
- [ ] **1.5: Commits (combined OR per fix — controller's call):**
```
git add lib/lib/execution/runner.py
git commit -m "fix(lib/execution): suppress PermissionError on macOS sandbox killpg"

git add frontend/packages/shared/package.json frontend/pnpm-lock.yaml
git commit -m "chore(@ip/shared): add vitest devDep + test script for CI"

git add scripts/check_log_coverage.py scripts/tests/test_check_log_coverage.py
git commit -m "fix(scripts/check_log_coverage): allow docstring + log_context as first two body statements"
```

---

## Task 2 — `_STATUS` legacy cleanup across 24 routes

**Goal:** the 24 routes files that import `_STATUS` from `routes/auth.py` migrate to `lib.errors.to_grpc_status` where the error has a lib peer.

### Background

Phase 2 simplified `_STATUS` in `routes/auth.py` itself but documented that 22-24 other route modules import the dict and call `_STATUS.get(type(exc), INTERNAL)` directly. They keep working but use the legacy ladder. Phase 6 cleans them up.

### Files
- Modify: every `src/admin/app/routes/*.py` file that imports `_STATUS` (24 files). For each `_abort` helper or inline `_STATUS.get(...)` call:
  - If the only errors handled are AppError subclasses with lib peers (most cases), replace with `to_grpc_status(exc)`.
  - If `InvalidTokenError` / `RateLimitedError` is in scope (no lib peer), keep a small local fallback.
- Modify: `src/admin/app/routes/auth.py` — remove the now-unused export OR keep it (judgment call; if removed, the 24 callers above must drop the import).

### Steps
- [ ] **2.1: Grep the call sites.**
```
grep -ln "_STATUS.get" src/admin/app/routes/*.py
```
- [ ] **2.2: Per file, refactor.** For each `_abort` helper or inline `_STATUS.get` site:
  ```python
  # before:
  await context.abort(_STATUS.get(type(exc), grpc.StatusCode.INTERNAL), str(exc))
  # after:
  code, msg = to_grpc_status(exc)
  await context.abort(code, msg)
  ```
  If the file has special handling for `RateLimitedError` (returns `retry_after` metadata), keep that inline before the translator call.
- [ ] **2.3: Run admin suite after each file** to catch regressions early. After all 24 done, run full gate.
- [ ] **2.4: Commit per file OR grouped (controller's call — Phase 2 used commit-per-file for similar scope).**
```
git add src/admin/app/routes/<file>.py
git commit -m "refactor(admin/routes/<file>): replace _STATUS.get with lib.errors.to_grpc_status"
```

---

## Task 3 — `IntegrityFlag.severity` proto enum

### Files
- Modify: `src/admin/app/routes/pb/report.proto` — change `string severity` to `enum Severity { ... }` (LOW/MED/HIGH/CRITICAL per spec §3.1).
- Regen BE stubs + FE stubs.
- Modify: `src/admin/app/resources/integrity.py` — emit the enum value, not a string.
- Modify: FE applicants page — drop the local `Severity` union type cast; use the generated enum.

### Steps
- [ ] **3.1: Read existing `report.proto` IntegrityFlag definition.**
- [ ] **3.2: Add enum.**
```proto
enum FlagSeverity {
  FLAG_SEVERITY_UNSPECIFIED = 0;
  FLAG_SEVERITY_LOW = 1;
  FLAG_SEVERITY_MED = 2;
  FLAG_SEVERITY_HIGH = 3;
  FLAG_SEVERITY_CRITICAL = 4;
}

message IntegrityFlag {
  // ... existing fields
  FlagSeverity severity = N;  // replaces string severity
}
```
- [ ] **3.3: Regen both BE + FE stubs.**
- [ ] **3.4: Resource — map string→enum** at the persistence boundary if the DB still stores strings (use a small dict).
- [ ] **3.5: FE — drop `Severity` cast,** use `FlagSeverity.LOW` etc.
- [ ] **3.6: Gate.** `bash scripts/check.sh`, `pnpm typecheck`, `pnpm build`.
- [ ] **3.7: Commits.**
```
git add src/admin/app/routes/pb/report.proto src/admin/app/routes/pb/report_pb2.py src/admin/app/routes/pb/report_pb2.pyi src/admin/app/routes/pb/report_pb2_grpc.py
git commit -m "feat(report.proto): FlagSeverity enum replaces string severity"

git add src/admin/app/resources/integrity.py
git commit -m "feat(admin/integrity): emit FlagSeverity enum values"

git add frontend/packages/api-client/src/gen/report_pb.ts frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx
git commit -m "feat(company/applicants): consume FlagSeverity enum directly"
```

---

## Task 4 — 8 remaining funnel events

### Sites + properties

| Event | File | Trigger |
|---|---|---|
| `application.started` | `apps/candidate/app/jobs/[id]/page.tsx` (or `apply-island.tsx`) | apply CTA click |
| `application.submitted` | same | apply mutation onSuccess |
| `aptitude.started` | `apps/candidate/app/aptitude/[applicationId]/page.tsx` | page mount |
| `aptitude.submitted` | same | submit mutation onSuccess (include `duration_ms`) |
| `interview.started` | `apps/candidate/app/interview/[applicationId]/page.tsx` | RTC connected callback |
| `interview.completed` | same | interview-end signal (include `end_reason`) |
| `decision.made` | `apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx` | decide.mutate onSuccess (include `decision`) |
| `notification.opened` | `apps/candidate/app/notifications/page.tsx` (or wherever inbox click fires) | item click |

### Workflow

- [ ] **4.1: Per event, add `track(...)` at the documented moment.** Use existing patterns from Phase 5's sampled 4 events.
- [ ] **4.2: Run typecheck + build after each batch.**
- [ ] **4.3: Commit grouped:**
```
git add <touched files>
git commit -m "feat(fe): wire remaining 8 funnel events (application/aptitude/interview/decision/notification)"
```

---

## Task 5 — voice-worker graceful shutdown + OTLP

### Files
- Modify: `src/ai-agents/app/service/voice_worker.py`
- Test: `src/ai-agents/tests/test_voice_worker_shutdown.py` (new)

### Behavior

- SIGTERM handler drains active sessions: for each room currently in `_run_session`, request a clean close, allow ≤30s to finish, then force-disconnect.
- Redis checkpoint each session's `InterviewSession` state before close.
- After all sessions closed (or timeout), exit 0.
- Add OTLP init at startup using `settings.otlp_endpoint` (Phase 5 pattern from admin/ai-agents/mcp-*).

### Steps

- [ ] **5.1: Read voice_worker.py to find the session registry + shutdown path.**
- [ ] **5.2: Write the failing test** — spawn the worker with one fake session, SIGTERM, assert the session was checkpointed + the worker exited cleanly.
- [ ] **5.3: Implement.**
- [ ] **5.4: Add OTLP init in the worker's startup.**
- [ ] **5.5: Gate.**
- [ ] **5.6: Commit:**
```
git add src/ai-agents/app/service/voice_worker.py src/ai-agents/tests/test_voice_worker_shutdown.py
git commit -m "feat(ai-agents/voice-worker): SIGTERM-driven graceful shutdown + OTLP wiring"
```

---

## Task 6 — Messaging server-streaming (replaces 30s long-poll)

### Background

`frontend/apps/candidate/app/messages/page.tsx:69` polls every 30s. Phase 0 audit cited stale state for 30s on hot threads.

### Files
- Modify: `src/admin/app/routes/pb/messaging.proto` — add `StreamMessages(StreamMessagesRequest) returns (stream Message)`.
- Regen BE + FE stubs.
- Modify: `src/admin/app/resources/messaging.py` — new `async def stream_messages(application_id, *, messages_repo, last_seq_no)` that yields new messages as they arrive. Implementation options: Mongo change stream (production-correct) OR poll-emit-on-tick (simpler; 1s interval server-side). Pick poll-emit for Phase 6 simplicity; document Mongo change stream as future work.
- Modify: `src/admin/app/routes/messaging.py` — wire the streaming method.
- Modify: `frontend/apps/candidate/app/messages/page.tsx` — replace `useQuery` + `refetchInterval: 30_000` with a `useEffect` that opens the stream and updates state.

### Steps

- [ ] **6.1: Proto + regen + wire BE.**
- [ ] **6.2: Reuse the `chat-stream.ts` FE pattern** (Phase 0 audit confirmed it already does server-streaming for chat).
- [ ] **6.3: Reconnect logic on stream error** — exponential backoff (use `@ip/shared` `pollingBackoff` for the reconnect intervals).
- [ ] **6.4: Tests** — at minimum, an admin test that verifies the stream emits a message when one is inserted while the stream is open.
- [ ] **6.5: Gate.**
- [ ] **6.6: Commits:**
```
git add src/admin/app/routes/pb/messaging.proto <regen stubs>
git commit -m "feat(messaging.proto): StreamMessages server-streaming RPC"

git add src/admin/app/resources/messaging.py src/admin/app/routes/messaging.py src/admin/tests/<...>
git commit -m "feat(admin/messaging): stream_messages with poll-emit ticks + tests"

git add frontend/packages/api-client/src/gen/messaging_pb.ts frontend/apps/candidate/app/messages/page.tsx
git commit -m "feat(candidate/messages): replace 30s long-poll with streaming subscription"
```

---

## Task 7 — Chaos verification

### Files
- Create: `docker-compose.chaos.yml` — overlay with `toxiproxy` between services and Mongo/Redis/RabbitMQ.
- Create: `scripts/run-chaos-smoke.sh` — orchestrates: bring up chaos profile → run E2E → tear down.
- Create: `scripts/chaos-profiles/` directory with 4 toxiproxy config files: `mongo-slow.json`, `redis-pause.json`, `rabbitmq-restart.json`, `mcp-data-unavailable.json`.
- Create: `docs/superpowers/plans/CHAOS_VERIFICATION.md` — what each profile tests, expected behavior, observed results.

### Workflow

This task is verification — the existing code should already withstand these profiles thanks to Phases 0-5 (timeouts everywhere, idempotent consumers, DLX, audit replay). If a profile reveals a regression, file as a separate fix.

- [ ] **7.1: Add toxiproxy service** to `docker-compose.chaos.yml`. Route Mongo/Redis/RabbitMQ traffic through it.
- [ ] **7.2: Author 4 chaos profile JSONs** following toxiproxy's API (`latency`, `down`, `slicer`).
- [ ] **7.3: E2E smoke script** that runs the closed-loop hire flow against the chaos compose. Use existing `scripts/smoke_login.py` as the starting point.
- [ ] **7.4: Run each profile sequentially** and document observed behavior in `CHAOS_VERIFICATION.md`.
- [ ] **7.5: Commit per profile OR grouped:**
```
git add docker-compose.chaos.yml scripts/chaos-profiles/ scripts/run-chaos-smoke.sh
git commit -m "feat(chaos): toxiproxy overlay + 4 chaos profiles + E2E smoke runner"

git add docs/superpowers/plans/CHAOS_VERIFICATION.md
git commit -m "docs(chaos): observed results under 4 chaos profiles"
```

If a chaos run reveals a real regression, file the fix as a Phase 6 sub-commit (e.g. `fix(<service>): handle <profile>-induced <regression>`).

---

## Task 8 — Program closure

### Files
- Create: `docs/superpowers/plans/SOFT_FAIL_CLASSIFIER.md` — tagged catalog of every `try/except` block.
- Create: `docs/superpowers/plans/SLO_FINAL.md` — final SLO targets.
- Create: `docs/superpowers/plans/2026-06-21-robustness-program-close.md` — program-level HANDOFF.
- Create: `~/.claude/projects/.../memory/robustness-phase-6.md`.
- Append ONE line to `~/.claude/projects/.../memory/MEMORY.md`.

### Soft-fail classifier

Grep every `except` in the BE codebase. For each, classify:
- **hard-fail:** caller must see the error (correctness-critical path).
- **soft-fail-by-design:** best-effort (telemetry, notification, session checkpoint mid-shutdown).
- **legitimate boundary:** the `except Exception` at the gRPC translator.

Document in `SOFT_FAIL_CLASSIFIER.md` as a table. ~150-200 sites.

### SLO finalisation

Take the draft `OBSERVABILITY.md` SLOs from Phase 5; finalise after observing ≥ 2 weeks of production data (or note "pending production deployment" if not yet live).

### Program-level HANDOFF

Cover:
- All 6 phases summary (commits per phase).
- Phase 0 §5 acceptance checks — for each, document the verification command + result:
  1. `scripts/check_timeouts.py` exit 0 → ✅
  2. `scripts/check_log_coverage.py` exit 0 → ✅
  3. No leaked internal errors → audit grep
  4. Every funnel transition observable → events landing
  5. Every client error captured → smoke test
  6. Chaos-tested → Task 7 results
  7. Knob-driven → grep no magic-number
  8. Idempotent mutations → test grep
  9. Audit trail intact → audit_logs row counts
  10. No regression → final gate green
- Phase carry-forwards still open after Phase 6 (should be near-zero).

### Steps

- [ ] **8.1: Write SOFT_FAIL_CLASSIFIER.md** — grep + classify.
- [ ] **8.2: Write SLO_FINAL.md.**
- [ ] **8.3: Write program-close HANDOFF.**
- [ ] **8.4: Memory pointer.**
- [ ] **8.5: Commit:**
```
git add docs/superpowers/plans/SOFT_FAIL_CLASSIFIER.md docs/superpowers/plans/SLO_FINAL.md docs/superpowers/plans/2026-06-21-robustness-program-close.md
git commit -m "docs(robustness): program-level closure — all 6 phases + acceptance verified"
```

---

## Self-review

**1. Spec coverage:**
- §3 Phase 6 messaging SSE → Task 6 ✓
- §3 Phase 6 voice-worker graceful shutdown → Task 5 ✓
- §3 Phase 6 soft-fail classifier → Task 8 ✓
- §3 Phase 6 chaos verification → Task 7 ✓
- §3 Phase 6 final SLO sign-off → Task 8 ✓
- §5 acceptance checks verified → Task 8 ✓
- All Phase 2/3/4/5 carry-forwards → Tasks 1, 2, 3, 4 (small fixes), Task 5 (voice OTLP) ✓
- HANDOFF + memory → Task 8 ✓

**2. Placeholder scan:**
- Task 6 says "Pick poll-emit for Phase 6 simplicity; document Mongo change stream as future work" — pragmatic deferral, not a placeholder.
- Task 8 "≥ 2 weeks of production data" — if not yet live, document "pending"; operational latitude.

**3. Type consistency:**
- `to_grpc_status(err) → (StatusCode, str)` matches Phase 0 ✓
- `FlagSeverity` enum integer values 0-4 ✓
- All `track(...)` calls use `ClientEventName` union from `@ip/shared` ✓

**4. Gate impact:**
- Each task explicitly runs gate before commit ✓
- macOS killpg flake fixed in Task 1 ✓

No issues. Plan ready.

---

## End-state — what "the program closes" means

When Phase 6 closes, the 10 Phase 0 §5 acceptance checks are all verifiable. The repo's `bash scripts/check.sh` is the canonical health check. Future development inherits:
- Every external call timeout-wrapped (lint-enforced).
- Every admin resource function log-context-wrapped (lint-enforced).
- Every typed error flows through the central translator (centralized).
- Every FE unhandled error → server-side row (auto).
- Every funnel transition → server-side metric (auto).
- Chaos profiles available for re-verification on any change.

After Phase 6 there is no Phase 7; the program is done.
