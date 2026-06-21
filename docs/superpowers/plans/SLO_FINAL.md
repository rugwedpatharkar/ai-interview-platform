# SLO Final Targets

> **Status: PROVISIONAL — finalise after 2 weeks of production data.**
>
> These targets are the Phase 5 draft from `OBSERVABILITY.md` with no changes.
> Production baselines are not yet available (platform not yet live). Ops must
> revisit these after the first two weeks of real traffic and tighten or loosen
> as data dictates.

---

## Service-level objectives

| Service | Indicator | Objective | Window |
|---|---|---|---|
| admin | success rate (gRPC code != INTERNAL / UNKNOWN / UNAVAILABLE) | 99.5% | 30d rolling |
| admin | p99 latency on `auth.Login` | < 500ms | 30d rolling |
| admin | p99 latency on `application.Apply` | < 1000ms | 30d rolling |
| ai-agents | success rate | 99.0% | 30d rolling |
| mcp-data | success rate | 99.5% | 30d rolling |
| mcp-capability | success rate | 99.0% | 30d rolling |
| FE | unhandled error rate per session | < 0.5% | 7d rolling |

---

## Error-budget targets

- 99.5% SLO over 30d = ~3.6 hours of allowed unavailability per month.
- Alert when 50% of budget consumed in any 1-hour window (fast-burn) or 5% / 24h (slow-burn).

---

## Alert rules (Prometheus expressions)

From Phase 5 `OBSERVABILITY.md`:

```yaml
- alert: AdminErrorRateHigh
  expr: sum(rate(admin_grpc_errors_total[5m])) / sum(rate(admin_grpc_requests_total[5m])) > 0.01
  for: 5m
  labels: { severity: page }
  annotations:
    summary: "Admin gRPC error rate > 1% for 5 minutes"

- alert: AdminLatencyP99High
  expr: histogram_quantile(0.99, sum(rate(admin_grpc_duration_ms_bucket[5m])) by (le)) > 1000
  for: 10m
  labels: { severity: warn }

- alert: FunnelDropAuthRegistered
  expr: |
    sum(increase(client_event_total{name="auth.registered"}[1w]))
    < 0.7 * sum(increase(client_event_total{name="auth.registered"}[1w] offset 1w))
  for: 30m
  labels: { severity: warn }
  annotations:
    summary: "auth.registered weekly count down > 30% week-over-week"

- alert: ClientErrorRateHigh
  expr: |
    sum(rate(client_errors_total[1h]))
    / sum(rate(client_events_total{name="auth.logged_in"}[1h])) > 0.01
  for: 30m
  labels: { severity: warn }
  annotations:
    summary: "Client unhandled errors > 1% of logged-in sessions"
```

---

## Post-baseline refinement checklist

After two weeks of production data, revisit:

- [ ] Tighten admin p99 latency if observed p99 is consistently < 200ms (set target to < 300ms).
- [ ] Adjust ai-agents success rate if voice sessions have higher natural abort rate.
- [ ] Set concrete funnel conversion ratios (auth.registered → application.submitted).
- [ ] Wire Prometheus ← Mongo bridge for `client_errors` / `client_events` collections.
- [ ] Create Grafana board JSON files in `deploy/grafana/` using skeleton from OBSERVABILITY.md.
- [ ] Confirm `METRICS_PORT` scrape targets are reachable from Prometheus in prod topology.
- [ ] Remove "PROVISIONAL" status from this doc once baseline is established.

---

## How targets relate to the robustness program

- The **Phase 1 timeout wrappers** (OperationTimeout / DEADLINE_EXCEEDED) ensure that p99 latency
  stays bounded even under infrastructure slowdowns. Without them, a single slow Mongo query could
  cause the p99 to blow past 1000ms.
- The **Phase 5 observability SDK** is what populates `client_errors_total` and
  `client_event_total` so the alert rules above can fire.
- The **Phase 6 chaos scaffolding** (`CHAOS_VERIFICATION.md`) is the pre-release verification
  that the system actually behaves under the load these SLOs assume.
