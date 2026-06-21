# Platform Observability — SLOs, Alerts, Dashboards

This is the draft on-call playbook. Targets are starting points; ops finalises after
two weeks of production data.

## SLOs (initial draft — refine after baseline)

| Service | Indicator | Objective | Window |
|---|---|---|---|
| admin | success rate (gRPC code != INTERNAL / UNKNOWN / UNAVAILABLE) | 99.5% | 30d rolling |
| admin | p99 latency on `auth.Login` | < 500ms | 30d rolling |
| admin | p99 latency on `application.Apply` | < 1000ms | 30d rolling |
| ai-agents | success rate | 99.0% | 30d rolling |
| mcp-data | success rate | 99.5% | 30d rolling |
| mcp-capability | success rate | 99.0% | 30d rolling |
| FE | unhandled error rate per session | < 0.5% | 7d rolling |

## Error-budget targets

- 99.5% SLO over 30d = ~3.6 hours of allowed unavailability per month.
- Alert when 50% of budget consumed in any 1-hour window (fast-burn) or 5%/24h (slow-burn).

## Alert rules (Prometheus)

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

(These metrics need to be exported from `client_errors`/`client_events` collections via a query exporter or a Prometheus pushgateway — Phase 6 polish.)

## Dashboards (Grafana)

Create these boards (skeleton — populate after data lands):

1. **Service Health** — error rate + p99 latency per gRPC method, per service.
2. **Funnel Conversion** — counts of the 12 funnel events over time, with conversion ratios (auth.registered → application.submitted → interview.completed → decision.made).
3. **Client Errors** — top error names, top routes, top components, by build_sha.
4. **Quality Events** — api.timeout rate, api.unauthorized_refresh rate, client.slow_render distribution.

## On-call rotation

(Placeholder — set after ops staffing finalises.)
- Primary on-call: ?
- Escalation: ?
- Pages route to: ?

## Runbooks

- **AdminErrorRateHigh** → check `kubectl logs admin --tail=100` for recent stack traces. Common: DB pool exhaustion. Restart admin pod is a last resort.
- **FunnelDropAuthRegistered** → check the `/register` page for an FE regression; inspect `client_errors` table filtered to `route=/register`.
- **ClientErrorRateHigh** → check `client_errors` table by `error.name` and `build_sha`. If a single build_sha dominates, rollback.
