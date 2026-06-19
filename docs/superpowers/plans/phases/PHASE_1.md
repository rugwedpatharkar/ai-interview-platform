# PHASE 1 — Robust Closed-Loop Funnel (TEXT)

> The MVP that already works end-to-end for both personas, on a scale-ready,
> compliant skeleton. Interview is **text** (voice/video are P3/P4). This doc drives
> Phase 1's writing-plans → execution cycles. See `../ARCHITECTURE.md` + service docs.

## 1. Goal & scope

Deliver the full hiring funnel in text: **company posts a job → candidate applies +
consents → AI MCQ aptitude → threshold gate (recruiter-overridable) → adaptive text
interview → AI scoring → recruiter decision → candidate notified**, with per-job
Excel export — multi-tenant, audited, on free infra.

**Epics:** A (identity/tenancy), B (company app), C (candidate app+profile),
D (funnel engine), E (aptitude), F text-interview, G (scoring/reporting),
J (trust/compliance), + I-skeleton (queues/workers/Redis/storage).
**Deferred:** H matching, K RAG/crawl (resume *extraction* is in P1), L chat,
voice/video, advanced proctoring.

## 2. Services in play

- **admin-service** — most of P1 (auth, CRUD, funnel, aptitude delivery+grade+gate,
  interview WS, scoring persistence, Excel, compliance, notifications).
- **ai-agents** — minimal: Profile, Blueprint, Aptitude-Setter, Interviewer (text),
  Evaluator, Report-Writer + a thin Planner; RPC + RabbitMQ workers.
- **mcp-data** — platform read/write tools (may start as an in-process library with
  identical tool contracts, liftable to a server later).
- **mcp-capability** — only `parse_document` (resume extraction).
- **frontend** — both Next.js apps, text interview UI.

## 3. Data model additions (MongoDB, tenant-scoped)

All collections from the master plan land in P1:
`companies, users, candidate_profiles, jobs, aptitude_banks, applications,
aptitude_attempts, interviews, scores, consents, audit_logs, notifications,
candidate_notes`.

**Indexes (correctness + scale):** unique `users.email`; `users.comp_id`;
`jobs.comp_id`; `applications.(comp_id, job_id)`, `applications.candidate_user_id`,
unique `applications.(job_id, candidate_user_id)` (one application per job);
`aptitude_attempts.application_id`; `interviews.application_id`.

## 4. Application state machine (authority: admin-service `funnel/`)

```
applied → aptitude_pending → aptitude_done → [GATE]
   ├─ pass → interview_pending → interview_in_progress → interviewed → scored
   │          → {shortlisted | rejected | hired}   (recruiter.decision)
   └─ fail → gated_out  (recruiter override → interview_pending)
extra: expired | withdrawn | abandoned
```
Each transition is validated, persisted, and **audit-logged**. Driven by RabbitMQ
events (see ARCHITECTURE §7.3).

## 5. Module / file layout (P1)

```
admin-service/app/{config,db,main}.py
  models/ enums.py company.py user.py candidate_profile.py job.py
          application.py aptitude.py interview.py score.py compliance.py
  repositories/ <one per collection>
  security/ passwords.py tokens.py
  api/ deps.py auth.py companies.py jobs.py profiles.py applications.py
       aptitude.py interview_ws.py results.py decisions.py
       notifications.py compliance.py
  funnel/ state_machine.py consumers.py
  aptitude/ delivery.py grader.py gate.py
  reporting/ excel.py
  compliance/ consent.py audit.py retention.py
  notifications/ notifier.py
  messaging/ publisher.py
  rpc/ ai_client.py
ai-agents/ (see AI_AGENTS.md) — P1 agents + service/rpc.py + service/workers.py
mcp-data/  (see MCP_SERVERS.md) — platform tools + scope guard
mcp-capability/ parse.py (parse_document)
frontend/ apps/company, apps/candidate, packages/ui, packages/api-client, packages/ws
```

## 6. Service-by-service work breakdown

### admin-service
1. **Foundation & auth (Epic A)** — scaffold, settings, Mongo `AsyncMongoClient`,
   indexes, models, bcrypt+JWT, repositories, company+candidate registration, email
   verification, login, `CurrentUser`/`require_role` guards.
   *(A first granular TDD plan already exists: `../2026-06-16-backend-foundation-auth.md`
   — apply the "Pending code migrations" from the master plan: rename to
   admin-service, Company/comp_id/company_admin, PyMongo async, repo-boundary tests.)*
2. **Companies/teams** — company profile, recruiter invites + roles.
3. **Jobs (Epic B)** — lifecycle, screening config, publish (emits `job.published`).
4. **Profiles (Epic C, server)** — resume upload→object storage; trigger
   `profile.parse`; profile review/edit; completeness gate.
5. **Applications (Epic C/D)** — apply (one per job) + consent; emit
   `application.created`; application tracker queries.
6. **Aptitude (Epic E)** — serve bank (timed, single attempt, randomized), submit
   (emit `aptitude.submitted`), receive `aptitude.graded`, **gate** + override.
7. **Interview WS (Epic F)** — session lifecycle, per-turn RPC to ai-agents,
   transcript/structured persistence, pause/resume/reconnect, emit `interview.completed`.
8. **Scoring/reporting (Epic G)** — store scores on `scoring.completed`; funnel
   board queries; candidate compare; per-job **Excel**.
9. **Decisions (Epic B)** — recruiter decision → `recruiter.decision` → notify.
10. **Compliance (Epic J)** — consent records, audit log on every transition/override,
    retention/deletion endpoint.
11. **Notifications** — email + in-app at each transition.
12. **Funnel engine (Epic D)** — state machine + RabbitMQ consumers tying it together.

### ai-agents (P1 minimal)
- `Profile` (resume→structured via `parse_document`), `Blueprint` (rubric+plan from
  JD), `Aptitude-Setter` (MCQ bank), `Interviewer` (text graph + structured capture),
  `Evaluator` (evidence-backed scores), `Report-Writer` (summary + excel row).
- `service/rpc.py` (`POST /interview/turn`) + `service/workers.py` (consume
  `application.created`/`aptitude.submitted`/`interview.completed`/`profile.parse`/
  `blueprint.build`). LLMClient (Gemini) + Redis checkpointer.

### mcp-data
- Tools: `save_profile`, `get_job`, `save_aptitude_bank`, `save_aptitude_result`,
  `get_job_rubric`, `save_interview`, `save_score`, `get_candidate_profile` + scope
  guard + audit linkage.

### mcp-capability
- `parse_document` (pdfplumber/pypdf + python-docx, Gemini OCR fallback).

### frontend
- Company + candidate apps per FRONTEND.md §3 (P1 rows).

## 7. Interfaces / events introduced (P1)

- REST + `WS /interview/ws` (admin-service §4).
- Events: `job.published`, `application.created`, `aptitude.submitted`,
  `aptitude.graded`, `interview.completed`, `scoring.completed`,
  `recruiter.decision`, `profile.parse`/`profile.parsed`, `blueprint.build`/`blueprint.ready`.
- RPC: `POST /interview/turn`.
- MCP-data tool contracts (above) — stable across phases.

## 8. Ordered build sequence

1. admin-service **foundation & auth** (Epic A) — *(migrate existing scaffold)*.
2. Core domain CRUD: companies/teams, jobs (+lifecycle), profiles (upload+review).
3. Messaging skeleton: RabbitMQ publisher + a no-op consumer + funnel state machine.
4. ai-agents skeleton: LLMClient + Profile + Blueprint + `profile.parse` worker;
   mcp-data `save_profile`/`get_job`; mcp-capability `parse_document`.
5. Aptitude: Aptitude-Setter (on `job.published`), delivery, grader, **gate**+override.
6. Interview: Interviewer graph + RPC + admin WS + persistence + reconnect.
7. Scoring: Evaluator + Report-Writer (on `interview.completed`) + score persistence.
8. Company results: funnel board, compare/notes, decision loop, **Excel**.
9. Compliance: consent gating, audit on all transitions, deletion.
10. Notifications wiring (email+in-app) at each transition.
11. Frontend: candidate flow (profile→apply→aptitude→interview→tracker), then company
    flow (job→funnel→results→decision).
12. End-to-end pass + hardening.

## 9. Dependencies / prereqs
- None from prior phases (P1 is first). Internally: auth before everything;
  messaging+funnel before aptitude/interview/scoring; mcp-data + parse_document
  before Profile agent.

## 10. Acceptance / verification (P1 done = all green)
1. **Unit:** MCQ valid+auto-gradable; grader gates vs threshold; resume parser
   extracts fields; evaluator outputs evidence-backed scores; Excel columns/rows.
2. **Funnel (offline):** drive the state machine through every transition incl. gate
   pass/fail, override, abandoned/expired.
3. **Agent loop (offline):** Interviewer vs a `FakeTransport`/fake-LLM → required-topic
   coverage + time-budget stop; Evaluator independent of conduct.
4. **Tenancy:** company A cannot read company B's jobs/applications (admin + mcp-data).
5. **Compliance:** every automated transition + override writes an `audit_log`;
   consent required before screening; deletion removes candidate data.
6. **E2E (manual):** register company+candidate → publish job → apply+consent → pass
   aptitude → complete text interview → recruiter sees score, decides → candidate
   notified → download per-job Excel with the correct row.
7. **Free-tier sanity:** a full funnel run stays within free LLM/email limits.

## 11. Exit criteria → Phase 2
Funnel is reliable end-to-end; agent contracts + MCP-data tools stable; `Transport`
abstraction in place (so P3/P4 swap cleanly); ready to add Matcher/RAG/chat.
