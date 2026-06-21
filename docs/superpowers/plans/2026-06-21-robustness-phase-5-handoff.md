# Robustness Phase 5 — HANDOFF

**Date:** 2026-06-21  
**Branch:** main  
**Commit range:** 2250b87..1b063d0 (14 commits)

---

## What shipped in Phase 5

### P5-1 — ObservabilityService proto + BE implementation
- `fb2fb31` — `admin/observability.proto`: `RecordClientError` + `RecordClientEvent` RPCs.
- `9426c94` — `client_errors` + `client_events` Mongo repositories with TTL indexes.
- `84f9bb3` — `record_client_error` + `record_client_event` resources with identity scrub + dedup guard.
- `a7df066` — `ObservabilityServicer` wired into admin gRPC-web + DI.

### P5-2 — gRPC-web API client regeneration
- `54b6692` — `@ip/api-client` regenerated to expose `ObservabilityService` client.

### P5-3 — FE observability SDK (`@ip/shared`)
- `65b8380` — `transport.ts` captures `X-Correlation-ID` from RPC response headers.
- `4b6cdbd` — `observability.ts`: `initObservability`, `track`, `recordError` with buffered flush (10s interval + page-unload drain).
- `e004c57` — Transport hook emits `api.timeout` + `api.unauthorized_refresh` quality events automatically.

### P5-4 — FE SDK mount + sample funnel events
- `cb6104b` — `ObservabilityBoundary` mounted at candidate app root; `initObservability` called with build SHA.
- `0635f67` — 4 sample funnel events wired:
  - `auth.logged_in` — login page `onSubmit` success path (with `role` + `method: "password"`).
  - `auth.registered` — candidate register + company register `onSubmit` success paths.
  - `job.viewed` — `apply-island.tsx` `useEffect` (client-side signal for an SSR-rendered public page).
  - `report.viewed` — applicant report page `useEffect` triggered when `dto` first becomes non-null.

### P5-5/6 — Settings knobs + OTLP wiring
- `bf2bed3` — `metrics_port: int = 0` + `otlp_endpoint: str | None = None` added to `BaseServiceSettings`.
- `02993dc` — All 4 services (admin, ai-agents, mcp-data, mcp-capability) check `otlp_endpoint` at startup and wire `OTLPSpanExporter` when set; fall back to `tracing_enabled` bool otherwise.

### P5-6 — Docker-compose + Prometheus scrape config
- `21df32a` — Each service gets `METRICS_PORT: "9090"` + `OTLP_ENDPOINT: "${OTLP_ENDPOINT:-}"` in `docker-compose.yml`, plus exposed host ports (admin→9091, ai-agents→9092, mcp-data→9093, mcp-capability→9094). `deploy/prometheus.yml` provides the ready-to-use scrape config.

### P5-7 — SLO + alert rules doc
- `1b063d0` — `docs/superpowers/plans/OBSERVABILITY.md`: draft SLO table (7 indicators), error-budget targets, 4 Prometheus alert rules, Grafana dashboard skeletons, runbooks.

---

## Gate status

- Backend (`bash scripts/check.sh`): **PASSED** (928 tests across 4 services, 0 failures).
- Frontend typecheck (`pnpm --filter @ip/candidate exec tsc --noEmit`): **PASSED**.
- Docker compose validate: **PASSED**.

---

## Deferred to Phase 6

| Item | Notes |
|---|---|
| 8 remaining funnel events | `application.started`, `application.submitted`, `aptitude.started`, `aptitude.submitted`, `interview.started`, `interview.completed`, `decision.made`, `notification.opened` — call sites identified, just not wired yet. |
| `navigator.sendBeacon` drain path | Current page-unload drain uses `sendBeacon` stubs; verify real beacon fires on unload in production. |
| Prometheus query-exporter for Mongo collections | `client_errors` + `client_events` are in Mongo; Prometheus alert rules reference `client_errors_total` / `client_events_total` counters that need a query-exporter or pushgateway to bridge. |
| Finalised SLO targets | Refine after two weeks of production baseline data. |
| Grafana board JSON | Skeleton documented in OBSERVABILITY.md; actual `.json` board files not yet created. |
| `voice-worker` OTLP wiring | `voice-worker` in docker-compose shares the `ai-agents` image but has its own startup path (`app.service.voice_worker`); `metrics_port` is already read there but `otlp_endpoint` wiring was not added to that startup path in this phase. |

---

## Phase 4/3/2 carry-forwards still open

- Phase 4 corr-IDs: full propagation to RabbitMQ event payloads (only HTTP path is wired).
- Phase 3 auth hardening: email-verify gate at login (deferred by product).
- Phase 2 FE error boundaries: per-route error.tsx coverage beyond the root boundary.

---

## How to resume

1. For funnel events: search for `TODO P6-funnel` comments (none placed yet — look at route pages for `application.started`, `application.submitted`, etc.).
2. For Prometheus ← Mongo bridge: add a `mongodb_exporter` or `query-exporter` sidecar to docker-compose scraping `client_errors` + `client_events` aggregates.
3. For Grafana: create board JSONs in `deploy/grafana/` referencing the metrics in OBSERVABILITY.md §Dashboards.
