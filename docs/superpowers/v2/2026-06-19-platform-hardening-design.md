# Platform Hardening — Design (cross-cutting engineering standards)

> **Context.** This is **not a user-facing feature** — it is the cross-cutting
> engineering-standards module for v2, resolving the audit's **Part B → "Cross-cutting /
> data-model / testing"** band plus **Part A core #4 (rate-limiting + security hardening)** and
> **#5 (observability & health)**. It is the cross-cutting `platform-hardening` module the audit's
> "How to fold this in" §2 calls for. Read the
> [architecture overview](2026-06-19-v2-architecture-overview-design.md) first, then the
> [v2 completeness audit](2026-06-19-v2-completeness-audit.md) (Part B "Cross-cutting" + Part A
> #4/#5). House style mirrors
> [`2026-06-19-code-execution-sandbox-design.md`](2026-06-19-code-execution-sandbox-design.md).
> **Local-only personal project; never run git/gh.** No production code yet — this documents the
> standards so the sibling plan ([`2026-06-19-platform-hardening.md`](2026-06-19-platform-hardening.md))
> can apply them task-by-task with `bash scripts/check.sh` staying green (baseline **423 tests**).

---

## 1. Goal & scope

v2 adds a marketplace half, new gRPC services, new infra (sandbox/Docker, LiveKit, Qdrant), and
several **unbounded-growth** collections. Each pillar spec handles its *own* slice; what's missing
is the **consolidated, platform-wide** view so a reviewer can see the whole surface in one place and
nothing falls between two specs. This module owns six cross-cutting concerns:

1. **Consolidated rate-limit policy** — one table of every new/sensitive endpoint with per-IP +
   per-user limits + the opaque-429 + `Retry-After` convention, wiring the existing
   `lib.redis.RateLimiter` into the new gRPC services and the `/public/*` app.
2. **Observability & health** — structured-logging conventions (`comp_id`/`user_id` binding),
   tracing seams for the new agents, `/health` + `/health/detailed` per service incl. new infra,
   and what to log/alert on for best-effort async ops.
3. **Data lifecycle / retention** — TTL/retention per growing collection, tied to the erasure cascade.
4. **Index-migration strategy** — how new indexes deploy safely on large collections (background/
   online builds, idempotent ensure, no write-blocking).
5. **Timezone discipline** — all timestamps UTC, tz-aware, with a lint/test guard.
6. **Cross-cutting tests** — forged-`comp_id` rejection, an end-to-end funnel test, a concurrency/CAS
   test, and named load/perf targets (or an explicit "not load-tested in v2.0" statement) — plus
   **order-of-magnitude capacity estimates** at 1M-candidate / 10K-company scale.

**In scope.** Reusable standards + concrete, gate-green tasks (the plan) that apply *across* the new
pillars. The `Notifier`-contract widening that the audit lists here is **already owned and specified**
by the [notifications-center spec §3.7](2026-06-19-notifications-center-design.md) (the full-row
signature) — this module **references** it as the cross-cutting home and does not re-specify it, to
keep a single source of truth.

**Out of scope (deferred / not v2.0).**
- A metrics/APM backend (Prometheus/Grafana/OTel collector). v2.0 ships the **logging + health +
  tracing-seam** layer (structured, correlation-ID-stitched, parseable); wiring an exporter is a
  later config swap behind the same seam — the same demo-first posture the sandbox/voice specs take.
- A distributed tracing vendor. We define **tracing seams** (a `Tracer` Protocol + a no-op default)
  so the new agents are instrumentable, not an actual Jaeger/Tempo deployment.
- A load-test harness as code. v2.0 **names** the load/perf targets and states plainly that the
  funnel is **not load-tested in v2.0** (§7.4) — building the harness is post-launch backlog.
- Per-tenant quota/billing (the `Company.plan` field exists; demo runs free) — Part A *later* tier.

---

## 2. Where it fits

```
                       lib (shared package — the reuse surface)
  ┌────────────────────────────────────────────────────────────────────────┐
  │ redis.RateLimiter   logging (bind_ids/correlation)   mongodb.IndexSpec  │
  │ (hit/peek/reset)    (loguru + redaction)             (ensure_indexes)   │
  └───────┬──────────────────────┬──────────────────────────────┬──────────┘
          │ wired into           │ bound at every               │ declared once in
          ▼                      ▼ entrypoint                   ▼
  ┌─────────────────┐   ┌─────────────────────┐        ┌──────────────────────┐
  │ ADMIN           │   │ all 4 services      │        │ admin/infra/db.py    │
  │ • /public/* RL  │   │ comp_id/user_id on  │        │ INDEXES (single      │
  │   (per-IP)      │   │ every log line +    │        │ index authority) +   │
  │ • gRPC-web RL   │   │ /health[/detailed]  │        │ TTL specs + online   │
  │   (per-IP+user) │   │ tracing seam on     │        │ build flags          │
  └─────────────────┘   │ new agents          │        └──────────────────────┘
                        └─────────────────────┘
  Retention sweeps + erasure cascade ──► notifications · messages · practice_sessions
                                         · video_answers · audit_logs (TTL/aged)
```

- **`lib` is the reuse surface.** Every standard here is *wiring existing `lib` primitives into the
  new surfaces*, not new infrastructure. `RateLimiter`, `get_logger`/`bind_ids`, and
  `IndexSpec`/`ensure_indexes` already exist and are tested; this module's job is to apply them
  uniformly so every new endpoint, log line, and collection is covered.
- **admin is the index + retention authority.** `admin/infra/db.py` already declares indexes for
  collections written by other services (it is the single index authority — see its header comment).
  New indexes, TTL specs, and retention sweeps land there / in admin schedulers, never scattered.
- **No new service, no new infra.** Hardening is *capability on the existing services* (the same
  posture as the rest of v2): a rate-limit interceptor, a health resource, a retention sweep on the
  existing scheduler loop, a tracing seam, a lint rule.

---

## 3. Consolidated rate-limit policy (audit Part A #4 + Part B "consolidated rate-limit table")

### 3.1 Mechanism (reuse `lib.redis.RateLimiter` — zero new infra)

The limiter already exists and is battle-tested on login/register/forgot + the failed-login lockout:

```python
# lib/lib/redis/ratelimit.py — fixed-window over Redis, every call with_timeout-bounded
result = await limiter.hit(key, limit, window_seconds)   # RateLimitResult{allowed, retry_after}
if not result.allowed:
    # opaque 429 + Retry-After: result.retry_after
```

`routes/oauth.py` already gates `/refresh` exactly this way (per-IP `hit` → 429 + `Retry-After` on
`not allowed`, with `_client_ip` honoring `X-Forwarded-For` **only** behind a `trusted_proxy`). v2
**generalizes that one precedent** to every new surface. No new limiter, no new Redis usage pattern —
the fixed-window `hit(key, limit, window)` contract is reused verbatim; only the **keys + limits**
are new.

### 3.2 The opaque-429 + `Retry-After` convention (one rule, everywhere)

A throttled response is **deliberately uninformative** so it leaks no quota intelligence to a
scraper/attacker:

- **REST (`/public/*`):** HTTP `429`, body `{"error": "rate_limited"}` and **only** the
  `Retry-After: <seconds>` header (= `result.retry_after`). **No** remaining-quota count, **no**
  limit value, **no** per-endpoint/per-IP detail (those would hand an attacker the exact budget). This
  is exactly the [job-marketplace spec §3.2](2026-06-19-job-marketplace-design.md) opaque-429 already
  specified for `/public/*`; this module makes it the **platform rule** for all surfaces.
- **gRPC / gRPC-web:** `grpc.StatusCode.RESOURCE_EXHAUSTED`, an opaque message (`"rate_limited"`), and
  the retry hint carried in **trailing metadata** `retry-after: <seconds>` (the gRPC-native analogue
  of the header; gRPC-web forwards trailers, so the browser client reads it the same way).
- **Key shape:** `"{surface}:{scope}:{principal}"` under the limiter's own namespace, e.g.
  `"public_search:ip:1.2.3.4"`, `"messaging_send:user:<user_id>"`,
  `"messaging_send:comp:<comp_id>"`. `peek` is used for read-only "are we over?" checks that must not
  themselves count a hit (e.g. a pre-flight on an idempotent retry).
- **Fail-open vs fail-closed.** A Redis outage makes `hit` raise (the `with_timeout` boundary). For
  **abuse-control** limits (public search, messaging) the interceptor **fails open** (log + allow) —
  a cache blip must not take down the marketplace — and relies on the per-IP edge/WAF as the backstop.
  For **security-sensitive** ops (password/email change, 2FA, session revoke) it **fails closed**
  (deny + opaque error) — better to refuse a sensitive mutation than to let a limiter outage open a
  brute-force window. This split is the one policy decision the table below encodes per row.

### 3.3 The policy table (every new/sensitive endpoint)

Limits are **per-IP** (anti-scrape/anti-DoS for unauthenticated or cheap calls) **and/or per-user /
per-comp** (anti-abuse for authenticated mutations). Numbers are **starting points**, all `Settings`
fields (tunable without code change), and chosen to be generous for a real human and stingy for a
bot. "Both" = the request must pass **every** listed limit (IP **and** user).

| # | Surface / endpoint | Transport | Per-IP | Per-user (or per-comp) | Fail | Why |
|---|---|---|---|---|---|---|
| 1 | `GET /public/jobs` (search/facets) | REST | 60 / min | — (anon) | open | Scrape/DoS of the crawlable catalog; the heaviest anon query (`$text`+`$facet`). |
| 2 | `GET /public/jobs/{id}`, `/public/companies/*` | REST | 120 / min | — (anon) | open | Cheap reads; higher ceiling, still bot-bounded. |
| 3 | `SearchJobs` (authed twin) | gRPC-web | 120 / min | 300 / min user | open | Authed users get a higher budget; IP still caps a shared NAT. |
| 4 | `SearchCandidates` (employer sourcing) | gRPC-web | — | 120 / min user · 600 / hr comp | open | Employer-side scrape of the candidate universe; comp cap bounds a whole tenant. |
| 5 | `SaveJob` / `UnsaveJob` | gRPC-web | — | 120 / min user | open | Write amplification on `saved_jobs`. |
| 6 | `CreateJobAlert` / `UpdateJobAlert` | gRPC-web | — | 30 / min user · 50 alerts max | open | Alert-table flooding (each alert is swept on a schedule — bounded fan-out). |
| 7 | `SendMessage` | gRPC-web | 30 / min | 30 / min user · 300 / hr comp | open | Spam/harassment vector; per-thread flooding. The headline new-write abuse surface. |
| 8 | `ListThreads` / `ListMessages` (+ SSE/poll) | gRPC-web | — | 240 / min user | open | Badge-poll loop; high ceiling but caps a runaway client. |
| 9 | `ListNotifications` / `MarkRead` / `MarkAllRead` | gRPC-web | — | 240 / min user | open | Bell-poll loop; same shape as messaging list. |
| 10 | Account security ops — password change, email change, 2FA enable/disable, **session revoke** | gRPC-web | 5 / 15 min | 5 / 15 min user | **closed** | Brute-force / account-takeover surface (mirrors the existing login lockout). |
| 11 | Notification-preference / settings writes | gRPC-web | — | 60 / min user | open | Cheap settings churn; low abuse value. |
| 12 | `presigned_put_url` (video clip) + clip finalize | gRPC-web | — | 20 / hr user · per-question retake cap | **closed** | Storage-exhaustion vector (mint-and-upload); pairs with the bucket size cap (video spec §3.5). |
| 13 | `StartPractice` / practice turn | gRPC-web | — | 10 / hr user (sessions) | open | LLM-cost abuse (practice is unauthenticated-to-a-recruiter but still spends model budget). |

- **Per-IP keys** use the **same trusted-proxy `_client_ip`** as `routes/oauth.py` (X-Forwarded-For
  only when `trusted_proxy`), so a forged header can't dodge the limit behind the proxy.
- **Per-comp ceilings** (rows 4, 7) bound a *whole tenant* (a compromised employer account can't
  scrape/spam the platform), layered over the per-user limit — the multi-tenant `comp_id` discipline
  applied to rate-limiting.
- **The video/storage row (12)** is fail-closed and pairs with the [async-video spec
  §3.5](2026-06-19-async-video-interview-design.md) presigned `content-length-range` + bucket-policy
  backstop: rate-limit caps *how often* a URL is minted; the size cap bounds *how big* each upload is.

### 3.4 Where it's wired (the two new surfaces)

- **`/public/*` Starlette app (admin):** a per-IP `hit` at the top of each public route handler
  (rows 1–2), exactly mirroring `routes/oauth.py::/refresh`. Already the marketplace spec's plan; this
  module's table is the **authority** for the numbers.
- **gRPC services (admin gRPC-web):** a **single rate-limit interceptor** (a `grpc.aio`
  `ServerInterceptor`) keyed off `(method, client_ip, user_id, comp_id)` — `user_id`/`comp_id` from
  the authenticated context the existing auth interceptor already populates; `method` → its row in a
  `Settings`-backed policy map. One interceptor enforces rows 3–13 uniformly, so no per-RPC
  boilerplate and no endpoint can be silently un-limited (a method missing from the map fails the
  startup self-check, §3.5). This is the gRPC analogue of the REST gate and the single place the
  opaque-`RESOURCE_EXHAUSTED` + `retry-after`-trailer convention lives.

### 3.5 Startup completeness check (no un-limited endpoint ships)

A `test_rate_limit_policy_complete` asserts **every** method in the new gRPC service set and every
`/public/*` route has a policy-table entry (the map's keys == the registered method/route set). A new
endpoint added without a limit **fails the gate**, so the table can't silently drift behind the API.

---

## 4. Observability & health (audit Part A #5 + Part B "observability/alerting for best-effort ops")

### 4.1 Structured-logging conventions (`comp_id` / `user_id` binding)

`lib/lib/logging.py` already gives loguru with: a process-wide JSON-ish structured sink, a
`correlation_id` `ContextVar` injected into every line, `_SENSITIVE`-key redaction (passwords/tokens
never logged), and `log_operation`/`log_context` (entry/exit + `duration_ms` + exception). The
**convention this module fixes** is *what context every line must carry*:

- **Bind `comp_id` + `user_id` at the entrypoint, once.** Every gRPC handler and `/public/*` route
  binds `get_logger(**bind_ids(comp_id=..., user_id=...))` at the top (public routes have no
  `user_id`; they still bind `correlation_id`). `bind_ids` already folds in the `correlation_id`, so a
  single request's logs across admin → ai-agents → mcp-* are **stitchable by correlation id** and
  **filterable by tenant** — the two queries an operator actually runs ("everything for this request",
  "everything for this tenant").
- **Correlation propagation across services.** admin sets the `correlation_id` per request (the
  existing ASGI middleware / gRPC interceptor pattern, `set_correlation_id` → `reset` on exit) and
  **forwards it on the MCP/HTTP/event hop** so ai-agents and the MCP servers continue the *same* id
  rather than minting a new one. The hop carries the id in a header/metadata field / event envelope key
  (the same place the auth context already rides).
- **Never log PII bodies.** Log **ids and counts**, not résumé text, message bodies, or transcripts.
  The redaction set is extended to cover any new sensitive field name introduced by the pillars
  (the audit's PII discipline; one-line `_SENSITIVE` addition).
- **Aggregate metrics via `log_operation`.** Best-effort and batch ops log a structured `op.done` with
  `duration_ms` and a domain count (e.g. `alerts_swept`, `clips_expired`) — the trace points an
  operator needs that aren't in any response (the CLAUDE.md "keep aggregate-metric `tl.step`" carve-out).

### 4.2 Tracing seams for the new agents (practice, code-runner, video)

The new compute paths (practice interview, `run_code` grading, video STT) are the ones most worth
*timing* (LLM + container + STT latency). We define a **`Tracer` seam** — a duck-typed Protocol with a
**no-op default** (`NoopTracer`) and a context-manager `span(name, **attrs)` — injected like every
other seam (`embedder`/`vector_store`/`CodeRunner`). The new agents wrap their key phases
(`span("practice.turn")`, `span("run_code.case")`, `span("video.stt")`) in a span that, today, simply
emits a `log_operation`-style structured line with `duration_ms` + attributes, and **later** swaps for
an OTel exporter behind the *same* Protocol — zero change to the agents. This is the demo-first
"instrument the seam, defer the backend" posture (identical to how the sandbox defers gVisor).

### 4.3 Health endpoints (`/health` + `/health/detailed`) per service, incl. new infra

Two endpoints per service, a deliberate **liveness vs readiness** split:

- **`/health` (liveness):** cheap, dependency-free, "the process is up" → `200 {"status":"ok"}`. Safe
  to hit at high frequency (k8s liveness probe); never touches Mongo/Redis/Qdrant.
- **`/health/detailed` (readiness):** checks each **injected dependency** with a short bounded timeout
  (reusing `with_timeout`) and reports per-dependency `ok|degraded|down` + the overall roll-up. Each
  service reports the dependencies it actually owns:

| Service | `/health/detailed` checks |
|---|---|
| **admin** | Mongo (ping), Redis (ping), RabbitMQ (connection), MinIO/S3 (bucket head) |
| **ai-agents** | mcp-data reachable, mcp-capability reachable, RabbitMQ, **LiveKit** (voice; token endpoint / room API reachable) |
| **mcp-data** | Mongo (the sole DB gateway) |
| **mcp-capability** | Qdrant (collection info), Redis, **Docker daemon** (sandbox — `ping`; reports `down` if the daemon is unreachable so the sandbox's infra-failure mode is visible *before* a submission hits it) |

- **Transport.** admin already serves gRPC `grpc.health.v1` (see `tests/test_health.py`) — that stays
  the gRPC liveness signal; `/health[/detailed]` are added as **HTTP routes on the same uvicorn process**
  (admin already mounts `/public/*` and `/auth/*` via the dispatcher — health rides the same pattern).
  ai-agents/mcp-* expose them on their HTTP surface. The check **degrades gracefully**: a down
  dependency yields `503` + the per-dependency map, never an unhandled 500, so a probe gets a structured
  answer.
- **Built behind seams** so the gate stays offline: `/health/detailed` checks call the injected
  dependency handles; in tests, fakes report healthy. No real Mongo/Docker/LiveKit in `check.sh`.

### 4.4 What to log/alert on for best-effort async ops (the audit's explicit ask)

The best-effort async ops are **fire-and-forget by design** (a failure must not block the main flow),
which is exactly why they need **explicit observability** — a silent best-effort failure is invisible
otherwise. For each, log a structured success metric **and** a `WARNING`/`ERROR` on failure with enough
context to act, and define the alert condition:

| Best-effort op | Log on success | Log + alert on failure | Alert condition |
|---|---|---|---|
| **Erasure cascade** (Inc 0, per artifact) | `op.done erasure user_id=… repos=N deleted=…` | `ERROR` per failed repo with `repo` + `user_id` (cascade continues — see [erasure spec]; per-repo failure is isolated) | **any** erasure-step failure (right-to-erasure is a hard obligation — page on it) |
| **Notification email** (`Notifier`) | row written + `email_sent` | `WARNING` swallowed-and-logged (already the spec's behavior); the `notification.requested` consumer → DLX on repeated failure | DLX depth > 0 sustained (delivery is failing) |
| **Alert sweep** (`job_alerts` → notify) | `op.done alerts_swept=N matched=M notified=K duration_ms=…` | `ERROR` if the sweep run raises; partial-failure count surfaced | sweep skipped/failed N consecutive runs, or `duration_ms` > the schedule interval (falling behind) |
| **Clip retention sweep** (video) | `op.done clips_expired=N bytes_reclaimed=…` | `ERROR` on storage-delete failure (clip remains; retried next run) | repeated storage-delete failures (growth not being reclaimed) |
| **TTL-collection growth** (notifications/messages/practice) | doc-count + storage-size sampled per sweep | — | collection storage-size crossing a configured ceiling (capacity §6 budget breached) |

These are **error-budget / alerting *definitions*** (what to watch), not a wired alertmanager — the
demo logs them structurally; production points an alert backend at the same lines. This is the audit's
"observability/alerting for best-effort async ops" item, made concrete.

---

## 5. Data lifecycle / retention (audit Part B "retention/TTL … unbounded growth")

Three collections grow without bound (`notifications`, `messages`, `practice_sessions`), one stores
**large blobs** (`video_answers` → MinIO), and one is a compliance record (`audit_logs`). Retention is
**two mechanisms working together**:

- **Mongo TTL index** (`expireAfterSeconds`) for time-aged auto-deletion of self-expiring rows — Mongo
  reaps them in the background with no app code. Declared as an `IndexSpec` in `admin/infra/db.py`
  (the index authority) on a tz-aware `datetime` field.
- **Erasure cascade** (Inc 0, `CandidateEraser`) for **on-demand, age-independent** deletion when a
  candidate exercises right-to-erasure — every collection below is already a cascade target
  (architecture overview §6: "Extend `CandidateEraser` to every new artifact"). **Retention and erasure
  are orthogonal:** TTL caps *passive* growth; erasure handles the *active* legal obligation. A clip
  may be erased on request long before its retention TTL, or auto-expire by TTL if never erased.

| Collection | Grows with | Retention (v2.0 default, a `Settings`/config field) | Mechanism | Tied to erasure |
|---|---|---|---|---|
| `notifications` | every funnel transition + message + alert | **180 days** since `created_at` | TTL index on `created_at` | yes (cascade deletes a user's rows) |
| `messages` | every message sent | **kept while the application is non-terminal; archived/aged 365 days** after the parent application reaches a terminal decision | aged sweep (not a blind TTL — a live conversation must not expire mid-hiring) + cascade | yes |
| `message_threads` | one per application | same lifecycle as its application; swept when the application is erased/aged | cascade + aged sweep | yes |
| `practice_sessions` | candidate self-serve practice | **90 days** since `created_at` (detached from any application — pure growth) | TTL index on `created_at` | yes (a user's practice is theirs to erase) |
| `video_answers` (rows) | one per recorded answer | transcript kept with the application; **raw clip** auto-expires `video_clip_retention_days` (e.g. 30) post-decision | clip lifecycle (video spec §3.5) + cascade `delete_raw` | yes (cascade `delete_raw`s the blob) |
| `audit_logs` | every funnel transition / override / consent | **kept long (e.g. 2 years), NOT TTL-reaped aggressively** — it is the compliance/accountability record | long-retention aged sweep, **excluded from candidate-erasure** (the audit trail must survive erasure; it stores ids/actions, not erasable PII bodies) | **no** (deliberately — see note) |

> **Why `audit_logs` is the exception.** It is the very record that proves the funnel/override/consent
> history; deleting it on candidate erasure would destroy the accountability trail the compliance-ready
> posture depends on. It stores **ids + actions + timestamps, not résumé/message *content***, so it is
> not a PII store that erasure must purge — it is retained on its own long clock. (If a jurisdiction
> ever requires audit-PII erasure, that is a targeted-redaction follow-up, not a blanket cascade.)

**Sweeps run on the existing scheduler loop** (the same loop the alert-delivery sweep bolts onto — Part
A #14), not a new service. Each sweep is best-effort + structurally logged (§4.4) and **idempotent**
(re-running deletes nothing already gone). TTL-index reaping needs no sweep at all (Mongo does it); the
aged sweeps cover the "depends on application terminal-state" cases a flat TTL can't express.

---

## 6. Capacity estimates (audit Part B "capacity/growth estimates")

**Order-of-magnitude** sizing at the audit's stated scale — **1M candidates, 10K companies** — to size
indexes/TTL and catch an unbounded design *before* build. Assumptions are deliberately round (this is a
planning sanity check, not a benchmark); per-doc sizes are conservative averages.

| Collection | Rows per … | Est. rows | ~Bytes/doc | Raw size | Notes / dominant index |
|---|---|---|---|---|---|
| `notifications` | ~30 / candidate / yr (transitions+msgs+alerts) | ~30M / yr → **~15M steady** (180-day TTL halves it) | ~400 B | ~6–12 GB | TTL on `created_at` caps it; `(recipient_user_id, created_at)` feed index |
| `messages` | ~20 / application; ~3 apps / candidate | ~60M | ~600 B | ~36 GB | `(thread_id, created_at)` (the audit's required index); aged post-decision |
| `message_threads` | 1 / application | ~3M | ~500 B | ~1.5 GB | `(comp_id, …)` + per-participant unread counters |
| `practice_sessions` | ~2 / candidate (self-serve, optional) | ~2M → **~0.5M steady** (90-day TTL) | ~2 KB (transcript) | ~1–4 GB | TTL on `created_at`; pure growth, detached from funnel |
| `video_answers` (rows) | ~5 answers / video interview; rare | ~1–5M rows | ~1 KB (row; clip in S3) | ~1–5 GB rows | **clips dominate storage**, not the rows |
| `video_answers` **clips** (MinIO) | one ≤25 MB clip / answer | ~1–5M clips | ≤25 MB | **~25–125 TB at peak**, **but** clips auto-expire ~30 d post-decision → **steady ≈ active-pipeline only** | the real storage driver; retention §5 is what keeps it bounded |
| `audit_logs` | ~5 / application | ~15M / yr | ~500 B | ~7–8 GB / yr | long-retention; ids/actions only |
| `saved_jobs` | ~10 / active candidate | ~10M | ~150 B | ~1.5 GB | `(candidate_user_id, …)` |
| `job_alerts` | ~2 / active candidate | ~2M | ~300 B | ~0.6 GB | swept on schedule; 50-alert cap (rate row 6) bounds fan-out |

**Headlines for the build:**
- **Video clips are the only genuinely large store** (tens of TB *at peak inflow*); the §5 post-decision
  clip expiry is therefore **load-bearing, not optional** — without it, storage is unbounded. Transcripts
  (KB) are kept; raw video (MB) is not.
- **Mongo collections are all single-to-tens-of-GB** with TTL/aged retention — comfortably within a
  community Mongo 7 deployment; **no sharding needed for v2.0** at this scale. The dominant query for
  each has a named compound index (the index-migration §7 deploys them online).
- **`notifications` + `messages` are the growth watch-items**; their TTL/aged sweeps (§5) plus the
  capacity-ceiling alert (§4.4) keep them in budget.

---

## 7. Index-migration strategy (audit Part B "index migration … online builds block writes")

New indexes are added across pillars to `admin/infra/db.py`. On a **large** existing collection
(`applications`, `jobs`, `messages` after launch), a naive foreground `create_index` can **block writes**
for the build duration. The strategy:

### 7.1 Idempotent ensure (already the mechanism)

`ensure_indexes` (lib) calls `create_index`, which **Mongo no-ops if the index already exists** (the
docstring's guarantee). So re-running the full `INDEXES` list on every admin boot is safe and cheap — the
deploy model is "declare in `db.py`, ensure on startup", and an already-built index costs nothing. **No
migration scripts**; the declared list *is* the desired state.

### 7.2 Background / online builds on large collections

- **Modern MongoDB (4.2+) builds indexes with an optimized build that does not hold an exclusive lock for
  the whole build** — readers and writers proceed during the build (the foreground/background distinction
  of old Mongo is largely gone). v2.0 targets that behavior: index builds on a populated collection are
  **online by default**.
- For the **largest** collections, builds are run **deliberately, not implicitly at first boot under
  load**: the plan flags which new indexes land on already-large collections (`applications`, `jobs`) so
  they can be ensured in a **low-traffic window** / explicitly, rather than colliding with peak writes.
  The ensure call is the same; the *timing* is the control.
- **Never block the write path on a build.** Boot-time `ensure_indexes` runs **before** the service
  accepts traffic (startup hook), so a build never races live writes from *this* process; cross-process,
  the online build handles concurrent writers.

### 7.3 TTL indexes are just indexes

The retention TTL indexes (§5) are declared the **same way** (`IndexSpec(... {"expireAfterSeconds": N})`)
and ensured idempotently. Adding a TTL to an existing collection is an online index build + Mongo's
background reaper starts on the next cycle — no app change, no write block.

### 7.4 Safe-deploy checklist (per new index)

1. Declare the `IndexSpec` in `admin/infra/db.py` (single authority).
2. If the target collection is **large at deploy** (`applications`/`jobs`/post-launch `messages`), flag it
   for an explicit/low-traffic ensure; otherwise boot-time ensure is fine.
3. Confirm the build is **online** (no exclusive-lock foreground build) on the target Mongo version.
4. For a **unique** index on existing data, pre-check for dup keys (a unique build *fails* on existing
   duplicates) — the plan adds the dup-scan step for any new unique index on a populated collection.
5. Idempotency: re-ensure is a no-op (verified by re-running `ensure_indexes` in a test against a fake/
   real Mongo and asserting no error + no duplicate index).

---

## 8. Timezone discipline (audit Part B "UTC timezone discipline")

**Every timestamp is UTC and stored tz-aware.** The whole funnel/CAS/audit chain compares and orders by
time; a naive or local-time datetime is a latent correctness bug (wrong ordering, wrong TTL expiry, wrong
retry windows).

- **The rule:** all timestamps are produced with `datetime.now(UTC)` (tz-aware), never `datetime.utcnow()`
  (which returns a **naive** datetime — the classic footgun) and never a local-zone `now()`. Stored to
  Mongo as tz-aware; TTL fields (§5) are tz-aware UTC so Mongo's reaper computes expiry correctly.
- **One `now` per function** (the CLAUDE.md data-flow rule): compute `now = datetime.now(UTC)` once and
  reuse, so a multi-write op stamps a single consistent instant.
- **The lint/test guard (the audit's explicit ask):**
  - **Ruff** flags `datetime.utcnow()` and naive `datetime.now()` (no tz) — ruff's `DTZ` (flake8-datetimez)
    rule set bans exactly these (`DTZ003` `utcnow`, `DTZ005` `now()` without tz). Enabling `DTZ` in the
    ruff config makes a naive-datetime call **fail `bash scripts/check.sh`** — the guard is the existing
    gate, no new tooling.
    - Documented carve-out: a deliberate naive call (if any in third-party glue) uses a scoped
      `# noqa: DTZ` with a reason, so the ban has no silent exceptions.
  - **A unit test** (`test_timezone_discipline`) asserts representative model timestamps round-trip as
    **tz-aware UTC** (`dt.tzinfo is not None and offset == 0`) — belt-and-braces over the lint, covering
    values that come back from Mongo.

---

## 9. Cross-cutting tests (audit Part B "E2E, legacy-migration, concurrency, load tests named")

The audit names four test classes that no single pillar owns; this module owns them as the
platform-integration suite. All run **offline** in `bash scripts/check.sh` against the existing fakes
(the load *targets* are documented, not executed — §9.4).

### 9.1 Forged-`comp_id` rejection (tenant-isolation integration test)

The single most important multi-tenant guard: a request authenticated as **comp A** that supplies a
**comp B** `comp_id` (in a body field, a path id, or a filter) must be **rejected/scoped-out**, never
served comp B's data. The test (`test_forged_comp_id_rejected`) drives the new gRPC surfaces (messaging,
discovery `SearchCandidates`, notifications, saved/alerts) with a token for comp A and a forged comp B id
and asserts: **403/empty**, **never** a cross-tenant row, and an **audit/log** line for the rejected
attempt. This proves the `comp_id` scoping the architecture relies on is enforced at *every* new
endpoint, not just the ones a pillar author remembered — the platform-wide version of the sandbox's
`test_sandbox_no_cross_tenant_leak`.

### 9.2 End-to-end funnel test (apply → aptitude → interview → report → decision → notification)

One happy-path integration test that walks a candidate through the **whole** funnel across services
(admin funnel CAS → ai-agents grade/interview/evaluate via fakes → report → recruiter decision →
`TransitionNotifier` row + email), asserting each state transition is CAS-guarded, each artifact is
written, and the **notification fires at the end**. This is the audit's "E2E" test — it proves the new
pillars compose into the existing funnel without breaking the integration seam, and it's the regression
net for "did a hardening change break the golden path".

### 9.3 Concurrency / CAS test (two recruiters decide simultaneously)

The audit's named concurrency test: **two recruiters decide on the same application at the same instant**.
Exactly **one** decision wins (the funnel's compare-and-set transition succeeds once), the other gets a
clean **conflict** (no double-transition, no double-notification, no torn audit log). `test_concurrent_decision_cas`
fires two `advance_application` calls racing on one application and asserts a single state change + a
single audit row + a single notification — proving the CAS guard the whole funnel depends on holds under
contention. (Pairs with the existing unique indexes that are the defense-in-depth backstop.)

### 9.4 Load / performance targets (named; **not load-tested in v2.0**)

Per the audit's "named load/perf targets (or an explicit 'not load-tested' statement)" — v2.0 makes the
explicit statement and records the targets to test against later:

> **v2.0 is NOT load-tested.** No load/soak/stress harness is built or run for v2.0 (demo-first posture).
> The following are the **target SLOs** a later load-test phase must verify; they are recorded here so the
> harness has acceptance criteria, not because they are measured today.

| Path | Target (p95) | Notes |
|---|---|---|
| `GET /public/jobs` (search) | < 300 ms | The crawlable hot path; `$text`+`$facet` on Mongo 7, CDN `max-age=60` sheds repeat load |
| Authed `SearchJobs` / list reads | < 250 ms | Indexed reads |
| `SendMessage` / `MarkRead` (writes) | < 200 ms | Single-doc atomic update + one event publish |
| `run_code` (per coding submission) | < (wall-clock ceiling × cases) + container overhead | Bounded by the sandbox's S7 wall-clock kill; latency is the cost, correctness is bounded |
| Notification/alert sweep | completes **within its schedule interval** | The §4.4 "falling behind" alert is the runtime check |
| Concurrent decision throughput | CAS correctness holds under contention | Correctness (§9.3) is tested now; *throughput* is the deferred load item |

---

## 10. Testing approach (how the gate stays green + offline)

- **Offline gate, unchanged discipline.** Every new test uses the existing fakes (`LoggingNotifier`,
  fake Mongo/Redis repos, `FakeCodeRunner`, `NoopTracer`) — no real Mongo/Redis/Docker/LiveKit in
  `bash scripts/check.sh`. The hardening tests are **integration-shaped but fake-backed**, exactly like
  the rest of v2. Baseline **423 tests** only grows.
- **Rate-limit:** unit-test the interceptor/route gate with a fake limiter (allowed → passes;
  not-allowed → opaque 429 / `RESOURCE_EXHAUSTED` + retry hint, **no** quota leak in the body/message);
  the §3.5 completeness check asserts no endpoint is un-limited; fail-open vs fail-closed asserted by
  making the fake limiter raise.
- **Health:** `/health` → `200` always; `/health/detailed` with healthy fakes → `200` + all-ok map; with
  a fake dependency reporting down → `503` + the per-dependency map (no unhandled 500).
- **Retention:** sweep functions tested against fake repos — assert aged/over-TTL rows are removed, live
  ones kept, the sweep is idempotent (second run removes nothing), and a per-row delete failure is
  logged-and-continues (best-effort).
- **Timezone:** the `DTZ` ruff rule failing on a planted naive call (gate-enforced) + the round-trip
  tz-aware assertion test.
- **Cross-cutting:** the four §9 tests (forged-`comp_id`, E2E funnel, concurrent-decision CAS, and the
  load-targets recorded as a doc/non-executing marker test).
- **Live checks (NOT the gate):** the real `/health/detailed` against real Mongo/Redis/Docker/LiveKit,
  and a real online index build on a populated collection (asserting writes proceed during the build) are
  **manual/integration**, mirroring the sandbox's live-runner checks.

---

## 11. Open questions

- **Per-comp rate ceilings (rows 4, 7).** The per-comp numbers are first guesses; revisit once real
  employer-usage shape is known (a busy 500-seat tenant vs a 2-seat startup have very different
  legitimate volumes — may need a per-plan multiplier, which is the billing-tier hook).
- **`messages` retention vs legal hold.** "Aged 365 days post-decision" is a default; some jurisdictions
  or disputes may require a hold that *suspends* aging — a `legal_hold` flag on the thread that exempts it
  from the sweep is the likely follow-up (out of scope for v2.0).
- **Tracing backend choice.** The `Tracer` seam defers the backend; when one is chosen (OTel → Tempo/
  Jaeger/Honeycomb), confirm the span attributes defined here (`comp_id`, `user_id`, `correlation_id`,
  per-phase counts) are the right cardinality (high-cardinality `user_id` as an attribute vs a log field
  is the usual tracing-cost decision).
- **Health-detail auth.** `/health/detailed` exposes dependency status — confirm it's bound to an
  internal/ops surface (or returns only coarse `ok|degraded` publicly) so it doesn't leak topology to the
  internet. `/health` (liveness) is safe to expose.
- **Index-build window automation.** v2.0 flags large-collection builds for a low-traffic ensure
  *manually*; whether to automate "build during the maintenance window" is a later ops nicety.
