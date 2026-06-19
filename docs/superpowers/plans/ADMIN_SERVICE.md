# ADMIN SERVICE

> **⚠️ UPDATED 2026-06-17 — admin-service is gRPC, not FastAPI/REST.** It uses the
> `app/model` + `app/resources` (all logic) + `app/routes` (thin gRPC) structure; the
> contract is `app/pb/auth.proto`. The FastAPI/REST specifics below are superseded — see
> `HANDOFF.md` and the [[interview-platform-service-structure]] memory.

> The platform's **source of truth + API gateway**. Owns MongoDB, runs the funnel
> state machine, holds the interview WebSocket, enforces auth/tenancy/compliance,
> and publishes jobs to the AI service. See `ARCHITECTURE.md` for the system view.

## 1. Technologies

| Concern | Choice | Why |
|---|---|---|
| Web framework | **FastAPI** (async) | High-throughput async I/O; OpenAPI for the typed FE client; Pydantic-native |
| DB driver | **PyMongo `AsyncMongoClient`** | Official, non-deprecated (Motor is EOL), non-blocking under async |
| Validation | **Pydantic v2** | Boundary validation; shared schema shapes with ai-agents |
| Cache / live state | **Redis** (redis-py async) | Interview session pointers, rate limits, idempotency keys |
| Messaging | **RabbitMQ** via **aio-pika** (corelib `Publisher`/`Consumer`) | Async job dispatch + funnel events (`{domain}.{action}`) |
| Sync RPC to AI | **httpx** | Per-turn interview calls to ai-agents |
| Object storage | **S3-compatible** (Cloudflare R2 / MinIO) via **aioboto3** | Resume (and later recording) storage |
| Auth | **JWT** (python-jose) + **bcrypt** | Stateless tokens; SHA-256 pre-hash before bcrypt |
| Excel | **openpyxl** | Per-job candidate export |
| Tests | **pytest** | Unit (mock repo boundary) + integration (local Mongo) |

Config: `pydantic-settings` env envelope + singleton `get_settings()`.
Run locally via docker-compose alongside Mongo/Redis/RabbitMQ.

## 2. Architecture

Layered, with a **repository boundary** so unit tests never need a DB.

```
admin-service/
  app/
    main.py            # app factory + lifespan (Mongo client, indexes, RabbitMQ)
    config.py          # Settings (pydantic-settings)
    db.py              # AsyncMongoClient provider + ensure_indexes()
    models/            # Pydantic domain models + enums
    repositories/      # one repo per collection (tenant-scoped queries)
    security/          # passwords (bcrypt), tokens (JWT)
    api/
      deps.py          # get_current_user, require_role, tenant scope, repo/DI
      <routers>.py     # auth, companies, jobs, profiles, applications,
                       #   aptitude, interview(WS), results, decisions,
                       #   notifications, compliance
    funnel/            # application state machine + transition rules
    aptitude/          # timed delivery, grading, gate (+ override)
    reporting/excel.py # per-job aggregation → .xlsx
    compliance/        # consent, audit log, retention/deletion
    notifications/     # Notifier (email + in-app)
    messaging/         # RabbitMQ publisher + funnel-event consumers
    rpc/               # httpx client to ai-agents (interview turns)
  tests/
```

**Key modules**
- `funnel/` — the **application state machine** (single authority on legal
  transitions); consumes `*.completed` events and advances state, writing an
  `audit_log` per transition.
- `api/interview.py` — owns the browser **WebSocket**; per candidate turn calls
  ai-agents RPC; persists transcript/structured_data; emits `interview.completed`.
- `compliance/` — `record_consent`, `write_audit`, `delete_candidate_data`.
- `security/` + `api/deps.py` — JWT issue/verify, `CurrentUser`, `require_role`.

## 3. Functionalities (by epic / phase)

| Epic | Functionality | Phase |
|---|---|---|
| A | Company + candidate registration, email verification, login (JWT), roles, per-`comp_id` isolation, team invites | P1 |
| B | Job lifecycle (`draft→published→paused→closed→archived`), screening config, funnel dashboard data, candidate compare + notes, **decision loop**, Excel export | P1 |
| C (server) | Candidate profile CRUD + completeness gate; application create (one per job) + consent | P1 |
| D | **Funnel state machine** over RabbitMQ | P1 |
| E (server) | Aptitude **delivery** (timed, single attempt, randomized), submission, **gate vs threshold + recruiter override** | P1 |
| F (server) | Interview **WebSocket** host + session lifecycle + pause/resume/disconnect-recovery | P1 |
| G (server) | Persist scores; per-job **Excel**; dashboard queries | P1 |
| J | Audit log, consent, retention/deletion, accessibility headers | P1 |
| — | Job recommendations (consume Matcher results), chat WS host | P2/3 |

## 4. Interfaces / Connections

### Exposes (REST, `/api/v1`, JWT bearer; standard `{status,message,data}` envelope)
- `POST /auth/register/company`, `/auth/register/candidate`, `/auth/verify`,
  `/auth/login`
- `GET /me`; company team: `POST /companies/{id}/invite`
- Jobs: `POST/GET/PATCH /jobs`, `POST /jobs/{id}/publish|pause|close`
- Profiles: `POST /profiles/resume` (upload), `GET/PATCH /profiles/me`
- Applications: `POST /applications` (apply+consent), `GET /applications`
- Aptitude: `GET /aptitude/{application_id}` (serve), `POST /aptitude/{id}/submit`
- Gate override: `POST /applications/{id}/gate-override`
- Interview: **`WS /interview/ws`**
- Results: `GET /jobs/{id}/candidates`, `GET /jobs/{id}/export.xlsx`
- Decisions: `POST /applications/{id}/decision`
- Notifications: `GET /notifications`; Compliance: `POST /me/delete`

### Publishes (RabbitMQ, `{domain}.{action}`)
`job.published`, `application.created`, `aptitude.submitted`,
`interview.completed`, `recruiter.decision`.

### Consumes (RabbitMQ)
`aptitude.graded`, `scoring.completed`, `profile.parsed`, `blueprint.ready`
(generic `*.completed`) → funnel advances.

### Calls (sync)
- ai-agents `POST /interview/turn` (HTTP RPC) per interview turn.
- `Notifier` (email provider) for emails.

### Owns
- **MongoDB** collections (see Phase 1 doc data model). Agents never touch Mongo
  directly — they go through `mcp-data`, which connects to the same DB.

## 5. Phasing

- **P1:** all of the above in text; `Transport` abstraction so interview WS is
  modality-agnostic.
- **P2:** consume Matcher results for recommendations; host the assistant chat WS;
  SSO; funnel analytics endpoints.
- **P3/P4:** interview WS carries voice/video signaling (LiveKit); recording refs.
- **P5:** rate limiting, observability, data-residency, billing/quota gates.

## 6. Conventions
- Every repository method takes/loops on `comp_id` for tenant docs.
- Validate at boundaries (request models, external data); trust internal calls.
- Unit tests mock repositories; integration tests run against a local MongoDB.
