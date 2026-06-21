# Phase 6 HANDOFF — Robustness Program Close

**Phase:** 6 — Polish + Chaos Verification + Program Close
**Status:** COMPLETE
**Closed:** 2026-06-22
**Branch:** main
**Commit range:** 7e1c74c (plan) → da457c5 (chaos scaffolding) → 02cd053 (classifier + SLO)
**Gate:** `bash scripts/check.sh` → green (928 tests, 0 failures)

---

## What Phase 6 shipped

### Tasks 1-3 — Small carry-forward cleanups

| Task | What | Commit |
|---|---|---|
| 1a | `lib/lib/execution/runner.py` — suppress `PermissionError` on macOS sandbox `killpg` | `c48d13a` |
| 1b | `@ip/shared/package.json` — vitest devDep + test script | `0aa9e21` |
| 1c | `scripts/check_log_coverage.py` — allow docstring + log_context as first two body statements | `0a3b07e` |
| 2 | 24 route files: replace `_STATUS.get` with `to_grpc_status` (3 batches) | `bf24637`, `35da572`, `0e4c32c`, `d714cd7` |
| 3 | `IntegrityFlag.severity` → `FlagSeverity` proto enum; regen FE stubs | `7be337b`, `9a47003`, `4b21d05`, `bc57a8b` |

### Task 4 — 8 remaining funnel events

Wired `application.started`, `application.submitted`, `aptitude.started`, `aptitude.submitted`,
`interview.started`, `interview.completed`, `decision.made`, `notification.opened`.

All 12 funnel events now wired (Phase 5 had 4, Phase 6 added 8). Commit: `e1b73cc`.

### Task 5 — voice-worker hardening

- SIGTERM handler drains active sessions + Redis checkpoints before exit.
- OTLP wiring at startup when `OTLP_ENDPOINT` is set.

Commit: `1289ee1`.

### Task 6 — messaging server-streaming

Replaced 30s long-poll with gRPC server-streaming `StreamMessages` RPC:
- New proto: `MessagingService.StreamMessages` (server-streaming).
- Admin resource: poll-emit ticks + tests.
- Candidate FE: subscription replaces long-poll.

Commits: `6b33cc3`, `21b84f7`, `f085b47`.

### Task 7 — Chaos verification scaffolding

- `docker-compose.chaos.yml`: toxiproxy overlay for Mongo/Redis/RabbitMQ.
- 4 chaos profiles: `mongo-slow`, `redis-pause`, `rabbitmq-restart`, `mcp-data-unavailable`.
- `scripts/run-chaos-smoke.sh`: orchestrator (apply profile → smoke → cleanup).
- `docs/superpowers/plans/CHAOS_VERIFICATION.md`: runbook.

Commit: `da457c5`. Full chaos runs are an ops exercise — execute before first prod release.

### Task 8 — Program-close docs

- `SOFT_FAIL_CLASSIFIER.md`: 252 except-clauses classified (boundary/hard-fail/soft-fail/TBD).
- `SLO_FINAL.md`: provisional SLO targets + alert rules (finalise after 2 weeks of prod data).
- This HANDOFF.
- Program-level closure doc.

Commit: `02cd053`.

---

## Behavior delta

No new observable behavior changes in Tasks 7+8. Tasks 1-6 shipped these changes:

- `_STATUS.get` → `to_grpc_status` everywhere (equivalent behavior; single translator).
- `FlagSeverity` as enum in protobuf (previously string). FE drops local `Severity` union.
- 8 funnel events now fire (previously silent).
- SIGTERM on voice-worker now drains (previously killed in-flight sessions).
- Messaging is now server-streaming (FE gets updates in ~1s vs up to 30s).
- macOS `killpg` sandbox error no longer crashes the gate.

---

## Open follow-ons

| Item | Priority | Owner |
|---|---|---|
| Author `scripts/smoke_e2e.py` (extends smoke_login.py) | P1 | Ops |
| Execute chaos runs before first prod release | P1 | Ops |
| Finalise SLO targets after 2 weeks prod baseline | P2 | Ops |
| Audit 20 TBD catches from SOFT_FAIL_CLASSIFIER | P2 | Dev |
| Wire Prometheus ← Mongo bridge for client_errors/events | P2 | Dev |
| Grafana board JSON in `deploy/grafana/` | P3 | Dev |

---

## Resuming from this HANDOFF

The program is complete. No outstanding technical debt introduced by Phases 1-6.
If resuming for any reason:

1. Gate: `bash scripts/check.sh` (should be green).
2. Outstanding items are in the table above.
3. Spec: `docs/superpowers/specs/2026-06-21-platform-robustness-and-observability-design.md`.
4. Program closure doc: `docs/superpowers/plans/2026-06-21-robustness-program-close.md`.
