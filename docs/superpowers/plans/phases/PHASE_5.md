# PHASE 5 — Scale & Robust Integrity

> Harden for real production scale and trust: autoscaling + observability, identity
> verification + proctoring, AI-answer/plagiarism detection, ATS integrations, and
> commercial features (billing/quotas, multi-region). See `../ARCHITECTURE.md`.

## 1. Goal & scope
Take the feature-complete platform to **production-grade** at scale (1000s companies,
100k+ candidates): operational resilience, anti-cheating integrity, ecosystem
integrations, and monetization — "make it work, then make it robust."

**Epics:** I (scale/infra, full) + integrity, integrations, billing.

## 2. Workstreams

### 2.1 Scale & operations
- Autoscaling stateless admin-service + ai-agents workers; RabbitMQ consumer scaling;
  Mongo connection-pool tuning; managed/replicated MongoDB, Redis, Qdrant.
- **Observability:** distributed tracing, metrics/dashboards, alerting; LangSmith on
  ai-agents; SLOs (interview turn latency, funnel throughput).
- Rate limiting, idempotency, backpressure, dead-letter queues, retries/backoff.
- Multi-region / data residency; backups + disaster recovery.

### 2.2 Robust integrity / anti-cheating
- **Identity verification:** ID match at interview start.
- **Proctoring:** tab-switch/focus-loss, face-presence, multi-face / second-voice
  detection; flags surfaced in the report (not auto-reject — human reviews).
- **AI-answer detection** (ChatGPT-assisted answers) + coding plagiarism (with the
  P5 `run_code` sandbox for coding aptitude).
- Question-bank rotation + anti-leak measures.

### 2.3 Integrations & commercial
- **ATS** integrations (Greenhouse/Lever/Workday), webhooks + public API.
- **Billing/quotas** (Stripe): plans, usage metering (interviews/month), quota gates.
- Admin/superadmin console; tenant lifecycle management.

## 3. Data model additions
- `proctoring_events` `{ application_id, type, severity, at, evidence_ref }`.
- `identity_checks` `{ user_id, method, status, at }`.
- `integrity_flags` on `interviews`/`scores` (advisory, human-reviewed).
- `subscriptions` / `usage_meters` / `quota` (per company).
- `api_keys` / `webhooks` (per company) for the public API.

## 4. Module / file additions
```
admin-service/ proctoring/ integrity/ billing/ integrations/ate/ api_public/
               observability/ ratelimit/
ai-agents/ integrity/ ai_answer_detection.py ; eval_harness/ (quality regression)
mcp-capability/ run_code.py (sandboxed) ; proctoring vision tools
infra: tracing/metrics stack, managed datastores, multi-region config
```

## 5. Interfaces / events
- Events: `proctoring.flag`, `identity.verified`, `usage.metered`, `webhook.dispatch`.
- REST: public `/api` (keyed) + webhooks; billing endpoints; admin console APIs.
- ATS connectors (outbound sync of candidates/decisions).

## 6. Ordered build sequence (independent workstreams; sequence by priority)
1. Observability + autoscaling + queue resilience (operate safely first).
2. Identity verification + core proctoring (tab-switch/face) → report flags.
3. AI-answer/plagiarism detection + `run_code` sandbox + coding aptitude.
4. Billing/quotas + admin console.
5. ATS integrations + public API/webhooks.
6. Multi-region / data residency + DR.

## 7. Dependencies / prereqs
- All prior phases (feature-complete funnel + voice/video + chat/matching/RAG).
- P4 media path (for proctoring vision signals); compliance (audit/consent) extended.

## 8. Acceptance / verification
1. **Scale:** load test sustains target throughput; autoscaling + DLQ + retries hold
   under failure injection; SLOs met.
2. **Integrity:** proctoring events recorded + surfaced as advisory flags (never
   auto-reject); identity verification gates interview start; AI-answer/plagiarism
   detection flags planted cases.
3. **Commercial:** quota gates enforce plan limits; usage metered accurately; billing
   webhooks reconcile.
4. **Integrations:** ATS sync round-trips; public API authenticated + rate-limited;
   webhooks deliver with retries.
5. **Compliance at scale:** audit/consent/retention + data residency honored
   multi-region.
6. **Regression:** all P1–P4 acceptance suites pass.

## 9. Definition of done (project)
Production-grade, compliant, scalable platform: the full funnel (text→voice→video),
matching + RAG + chat, robust integrity/proctoring, ATS + public API, and
billing/quotas — operable, observable, and defensible.
