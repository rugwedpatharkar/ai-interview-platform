# Architecture — Aptura · AI Hiring Platform

> **⚠️ 2026-06-17 update:** admin-service is **gRPC** (not FastAPI/REST) and the **frontend
> talks gRPC (gRPC-web) to admin** — the REST/WS Frontend↔Admin rows below are superseded.
> Every service uses `app/model` + `app/resources` + `app/routes`. See `HANDOFF.md`.
>
> **⚠️ 2026-06-19 — v2 in design.** A fresh v2 architecture (unified job marketplace + AI
> interview; evolve-the-foundation; demo-first, compliance-ready) supersedes this for v2 scope.
> Read **`docs/superpowers/v2/2026-06-19-v2-architecture-overview-design.md`** first.

> System overview for the whole project. Read this first; then the per-service docs
> (`ADMIN_SERVICE.md`, `AI_AGENTS.md`, `MCP_SERVERS.md`, `FRONTEND.md`) and the
> per-phase implementation docs under `phases/`.

## 1. What we are building

A **two-sided, multi-tenant SaaS hiring platform** with an AI screening funnel.
Companies post software/IT jobs; candidates build profiles and apply; an AI agent
pipeline runs **aptitude test → gate → adaptive interview → scored report**; the
company reviews ranked results, decides, and the candidate is notified — a closed
loop for both sides.

**Targets:** production scale (1000s of companies, 100k+ candidates). **Principle:**
architect for scale + compliance now, run on free tiers in dev. Hiring AI is legally
high-risk (NYC LL144, EU AI Act, GDPR), so **audit logging, consent, human override,
explainable scoring** are first-class.

## 2. System at a glance

Four deployables + shared infra (everything free / self-hostable in dev via
docker-compose):

```
                         ┌──────────────────────────┐
        Company app ───► │                          │
       (Next.js)         │      ADMIN SERVICE       │  owns MongoDB
                         │  (FastAPI, REST + WS)    │  (source of truth)
      Candidate app ───► │                          │
       (Next.js)         └───┬───────────┬──────────┘
                             │ RabbitMQ  │ HTTP RPC (interview turns)
                             │ (events)  │
                             ▼           ▼
                        ┌──────────────────────────┐
                        │       AI-AGENTS           │  LangGraph + Gemini
                        │  Planner → specialists    │  (stateless compute)
                        │      → Summary            │
                        └───┬──────────────────┬────┘
                            │ MCP              │ MCP
                            ▼                  ▼
                     ┌────────────┐     ┌────────────────┐
                     │  mcp-data  │     │ mcp-capability │
                     │ (platform  │     │ web/search/    │
                     │  data —    │     │ embed/parse/   │
                     │  sole DB   │     │ kb_search)     │
                     │  gateway)  │     └──────┬─────────┘
                     └─────┬──────┘            │
                           ▼                   ▼
                       MongoDB           Qdrant + Redis cache
                                         (RAG, P2)

  Shared infra: MongoDB · Redis · RabbitMQ · object storage (R2/MinIO) · Qdrant(P2)
```

### Components

| Component | Role | Tech |
|---|---|---|
| **admin-service** | API gateway + business logic + source of truth; holds interview WebSocket; publishes agent jobs | FastAPI, PyMongo `AsyncMongoClient`, Redis, RabbitMQ |
| **ai-agents** | Multi-agent pipeline (Planner→specialists→Summary); RabbitMQ consumers + HTTP RPC | LangGraph, Gemini (`LLMClient`), Redis checkpointer |
| **mcp-data** | Platform-data tools — the agents' ONLY path to Mongo (tenant/role-scoped, auditable) | MCP server (Python) |
| **mcp-capability** | External tools: `web_search`, `web_fetch`, `kb_search`, `parse_document`, `embed` | MCP server (Python), Qdrant, BeautifulSoup/Playwright |
| **frontend** | Company app + Candidate app | Next.js, Tailwind, shadcn/ui, TanStack Query (pnpm+Turborepo monorepo) |

## 3. Core principles

- **Multi-tenancy everywhere:** every tenant doc + query carries `comp_id`. Enforced
  in the admin service and again at the `mcp-data` tool layer.
- **Async-first:** heavy/long work (resume parse, MCQ gen, scoring, matching,
  crawling) runs in **RabbitMQ workers**, never in request handlers.
- **Agents are stateless compute:** they never touch Mongo directly — only via
  `mcp-data` tools. Keeps a clean, auditable boundary and lets AI scale separately.
- **Right pattern per task:** multi-agent fan-out only for *parallel* work; the live
  interview is a **single stateful LangGraph agent** (sequential/interdependent).
- **Explainability + audit:** every automated decision is evidence-backed and
  written to `audit_logs`; a human can override any gate/score.
- **Free-first, scale-ready:** dev runs on free tiers; scaling = turning knobs
  (more workers, managed DB, paid realtime), not redesign.

## 4. Multi-agent topology (inside ai-agents)

```
            ┌─────────────┐
   task ──► │   PLANNER    │  fast model; classify + route/decompose
            └──┬───┬───┬──┘
               │   │   │   (parallel only when independent)
     ┌─────────┘   │   └──────────┐
     ▼             ▼              ▼
 ┌────────┐  ┌──────────┐  ┌───────────┐   specialists reach data/tools
 │Profile │  │Blueprint │  │Aptitude-  │   ONLY via MCP; self-contained
 │        │  │/Planner  │  │Setter     │   briefs; no mid-task coordination
 └────────┘  └──────────┘  └───────────┘
 ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐
 │Interviewer│ │Evaluator │ │ Matcher  │ │Assistant│  (Matcher/Assistant: P2/3)
 │(stateful) │ │(scoring) │ │  (P2)    │ │ (chat)  │
 └──────────┘ └──────────┘ └──────────┘ └─────────┘
                    │
                    ▼
            ┌─────────────────┐
            │ SUMMARY/RESPONDER│  synthesize + evidence/citation pass
            └─────────────────┘
```

- **Planner** routes; uses a **fast model** for low latency.
- **Specialists** are tool-wrapped roles with strict Pydantic I/O contracts.
- **Interviewer** is the exception: a single stateful graph with a **Redis
  checkpointer** (resumable on disconnect) — NOT a fan-out.
- **Summary/Responder** merges outputs; for scoring it runs a separate
  evidence/citation pass.

## 5. Data ownership

- **admin-service owns MongoDB** — the single source of truth.
- **ai-agents** holds no durable platform state; it reads/writes platform data
  **through `mcp-data` tools** and emits result events. Interview working-state lives
  in **Redis** (LangGraph checkpointer) during a session, then is persisted to Mongo.
- **Qdrant** (P2) holds the tech knowledge-base vectors; **object storage** holds
  resumes (and recordings in P4).

## 6. Interconnection

| Edge | Mechanism |
|---|---|
| Frontend ↔ Admin | REST/JSON (JWT bearer) + WebSocket `/interview/ws`; typed `packages/api-client` from OpenAPI |
| Admin → AI (async) | RabbitMQ topic events `{domain}.{action}`; AI persists via `mcp-data`, emits `*.completed`; Admin funnel advances |
| Admin ↔ AI (live interview) | Admin holds browser WS; per turn → AI `POST /interview/turn` (HTTP RPC); state in Redis |
| AI ↔ tools | MCP: `mcp-data` (platform data) + `mcp-capability` (external) |
| Contracts | Shared Pydantic schemas; funnel event names are the integration seam |

**Funnel events:** `job.published`, `application.created`, `aptitude.submitted`,
`aptitude.graded`, `interview.completed`, `scoring.completed`, `recruiter.decision`
(+ `*.completed` acks). Every automated transition writes an `audit_log`.

## 7. End-to-end flows

### 7.1 Funnel flow (happy path)
```
Candidate applies + consents
   → application.created ─(RabbitMQ)→ AI Aptitude-Setter serves test
   → candidate submits → aptitude.submitted → auto-grade
   → GATE vs job.pass_threshold
        ├─ pass → interview_pending → notify candidate
        └─ fail → gated_out → notify (recruiter may override → re-enter)
   → candidate runs interview (WS) → interview.completed
   → Evaluator scores → Report-Writer → scored → notify recruiter
   → recruiter reviews/compares → recruiter.decision → notify candidate
```

### 7.2 Live interview flow (P1 text; P3/P4 add voice/video)
```
Browser ──WS──► Admin (auth/tenancy, session) ──HTTP RPC──► AI Interviewer graph
   each turn: candidate answer → graph(next question | probe | wrap-up)
   state checkpointed in Redis (resume on disconnect)
   on end → transcript + structured_data persisted via mcp-data → interview.completed
```

### 7.3 Async-job flow
```
Admin publishes {domain}.{action} → RabbitMQ → AI worker consumes
   → runs LangGraph graph → persists result via mcp-data tools
   → emits {domain}.completed → Admin funnel consumer advances state + audit_log + notify
```

### 7.4 RAG question-generation flow (P2)
```
job.published → Blueprint agent extracts JD tech stack
   → kb_search(Qdrant hybrid) per tech (on-demand ingest if unseen, cached)
   → grounds question plan (source-cited) → cached on the job
   (live interview reads only the prepared plan — no crawl in hot path)
```

### 7.5 Chat flow (P2/3)
```
User ──WS──► Admin ──► Assistant agent (Planner-routed)
   → Matcher / mcp-data / kb_search (EVERY fetch scoped by comp_id+role+relationship)
   → streamed, RAG-grounded, cited answer
```

## 8. Phasing (see phases/PHASE_N.md for detail)

| Phase | Theme | Adds |
|---|---|---|
| **P1** | Robust closed-loop funnel (TEXT) | Epics A,B,C,D,E,F(text),G,J + I-skeleton; admin-service + minimal ai-agents + mcp-data + both FE apps |
| **P2** | Intelligence & polish | Matcher (H), RAG KB + crawl (K), chat (L), JD-Assistant, analytics, SSO; mcp-capability + Qdrant |
| **P3** | Voice interview | STT+TTS+LiveKit behind `Transport` |
| **P4** | Video + recording | Webcam capture + stored recordings |
| **P5** | Scale & robust integrity | Autoscaling, observability, ID verification, proctoring, ATS, billing, multi-region |

## 9. Cross-cutting concerns

- **Security/tenancy:** JWT (admin-only); role/tenant guards; `mcp-data` re-checks
  `comp_id`+role+relationship on every tool call (defense in depth for chat).
- **Compliance:** `audit_logs`, `consents`, retention/deletion, human override.
- **Observability:** structured logging with `comp_id`/`user_id`; LangSmith tracing
  on ai-agents; telemetry step/aggregate metrics.
- **Cost/latency:** model routing (fast vs strong), Redis multi-tier (exact +
  semantic) cache, parallel-where-independent, streaming, per-task budget caps.

## 10. Conventions (mirrors andromeda)

- `comp_id` on every tenant doc + query; `{domain}.{action}` routing keys.
- Provider-agnostic LLM factory; prompts in a registry (DB + cached), not inlined.
- Pydantic env-envelope config + singleton `get_settings()`.
- Standard API response envelope (`status`/`message`/`data`) under `/api/v1`.
- `conftest.py` env-stubbing; unit tests mock the repo boundary, integration hit
  a local MongoDB.
