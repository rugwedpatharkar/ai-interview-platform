# Phase 2 — AGENT-side Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development or
> superpowers:executing-plans. Every task is **TDD** — failing test → minimal code →
> `bash scripts/check.sh` green (baseline **263 tests**, count grows per task). **Project is
> LOCAL-ONLY — never run git/gh.** Autonomous mode: proceed task-by-task.

**Goal:** Build the AI/data plane for Phase 2 — RAG knowledge base + embeddings, the Matcher agent,
RAG-grounded cited interview questions, a tenant/role-scoped streaming chat assistant, and the
JD-assistant — entirely behind injected seams so it is unit-tested **offline and gate-green**;
live retrieval/LLM quality defers to when the Gemini key + Qdrant exist.

**Scope (this plan owns these services):** `src/ai-agents/`, `src/mcp-capability/`, `src/mcp-data/`.

**Architecture:** Reuse every P1 pattern — injected seams with `Fake*` impls, idempotent upserts,
prompt-fencing (`_prompt_safety.fence`), the event→handler→gateway→persist→emit flow. New external
pieces (Gemini **embeddings**, **Qdrant**, web **crawl**) become three seams
(`Embedder`/`VectorStore`/`Fetcher`) exactly like P1's fake-LLM seam.

**Tech-stack adds:** `qdrant-client`, `rank-bm25`, `httpx`, `beautifulsoup4` (mcp-capability only),
Gemini embeddings via the existing provider key; Qdrant container in `docker-compose.yml`.

## Global Constraints
- **No git/gh.** Gate after each task: `bash scripts/check.sh` (ruff format+lint S-rules, pip-audit,
  pytest ×5) must stay green. Pin clean dep versions so **pip-audit passes**.
- **TDD**, reusing `src/ai-agents/tests/conftest.py` fixtures (`fake_llm`, `fake_llm_by_schema`,
  `fake_data`, `fake_sessions`, `fake_publisher`, `fake_capability`, `FakeRedis`) and adding fakes
  for the new seams (`FakeEmbedder`, `FakeVectorStore`, `FakeFetcher`, `fake_kb`).
- **§10.5 regression is sacred:** every P1 test stays green throughout.
- Python style per `~/.claude/CLAUDE.md` (trust-the-system, validate at boundaries, minimal).
- **Two P2 acceptance properties are first-class:** chat privacy (§10.3 — A10/A12 adversarial) and
  matching determinism (§10.1 — cached embeddings + temp-0, A6).

## Where this fits
Sibling plans: `2026-06-18-phase-2-backend.md` (admin/lib control plane),
`2026-06-18-phase-2-frontend.md` (the two Next.js apps). Umbrella + the Phase-1↔Phase-2 fit
reconciliations: `2026-06-18-phase-2.md` (Part A). Build order across all three sides is in that
umbrella's Part F. **The RAG foundation (A1–A5) gates the Backend RecommendationService data and
all Frontend AI surfaces — build it first.**

## Decisions that bind this plane (from umbrella Part B)
1. **Blueprint = two-tier.** Build the cited question plan **once on `job.published`** (cache in
   `job_question_plans`); `build_blueprint` at interview start **loads + adapts** it. **Never** call
   `kb_search` in the interview hot path. *(Reconciles the P1 reality that `build_blueprint` today
   runs per-candidate at `start_interview` and `handle_job_published` builds only the aptitude bank.)*
3. **Chat = ai-agents REST `/chat/turn` + SSE; scope from the signed JWT.** The access token already
   carries `role`+`comp_id`; read all three claims into the scope ctx (no DB lookup) and re-check at
   the mcp-data tool layer (the privacy boundary).
5. **mcp-data is the agent data plane.** Agent-written collections (`match_results`,
   `job_question_plans`, `kb_sources`, `chat_*`) are written via mcp-data tools here and **read by
   admin via its own repositories** — the P1 reports pattern. Don't add admin reads in this plan.

---

## WORKSTREAM A-I — RAG / embeddings foundation
*Everything downstream depends on this. Build entirely behind seams.*

### A1 — Seams + deps + infra
**Files:** new `src/mcp-capability/app/seams/{embedder,vector_store,fetcher}.py`; `pyproject.toml`
(+`qdrant-client`, `rank-bm25`, `httpx`, `beautifulsoup4`); `docker-compose.yml` (Qdrant service +
named volume + healthcheck); `src/mcp-capability/app/config.py` (+`qdrant_url: str`,
`gemini_embed_model: str`, `redis_url` — today it has only `service_name` + `mcp_port`, and
`BaseServiceSettings` already provides `redis_url`/S3); `tests/test_seams.py`.
- **Change:** each seam = a duck-typed interface + a real impl + a `Fake*`:
  - `Embedder.embed(texts: list[str]) -> list[list[float]]` — `GeminiEmbedder` (via the provider
    key + `gemini_embed_model`); `FakeEmbedder` → deterministic hash-based unit vectors.
  - `VectorStore.upsert(collection, ids, vectors, payloads)` / `search(collection, vector, k) ->
    [{id, score, payload}]` — `QdrantVectorStore`; `FakeVectorStore` in-memory cosine top-k.
  - `Fetcher.fetch(url) -> {text, url}` — httpx + BeautifulSoup; `FakeFetcher` canned responses.
- **Test:** `FakeEmbedder` is deterministic (same text → same vector); `FakeVectorStore` upsert then
  search returns the nearest by cosine; `FakeFetcher` returns its canned text.
- **Verify:** gate green (**pip-audit must pass** — pin clean versions).

### A2 — Semantic chunking + content-hash dedup
**Files:** new `src/mcp-capability/app/chunking.py`; `tests/test_chunking.py`.
- **Change:** `chunk(text, window=1024, overlap=128) -> list[str]` (sentence-aware) and a sha256
  `content_hash(chunk) -> str`.
- **Test:** window/overlap honoured; identical text → identical hash; text shorter than the window →
  exactly one chunk.

### A3 — Hybrid retrieval (dense + BM25 + RRF)
**Files:** new `src/mcp-capability/app/retrieval.py`; `tests/test_retrieval.py`.
- **Change:** `hybrid_search(query, *, embedder, store, collection, k) -> [{chunk, source, score}]`
  — dense (embed → `store.search`) + BM25 (`rank-bm25` over the candidate chunk texts) fused by
  **Reciprocal Rank Fusion**.
- **Test (offline):** with fake vectors + known BM25 terms, a keyword-exact hit outranks a
  pure-semantic-only hit; the `collection` argument scopes results. *(Live "hybrid beats
  pure-vector" §10.2 is deferred — needs a real index.)*

### A4 — `embed` / `kb_search` / `ingest` tools
**Files:** `src/mcp-capability/app/{tools.py,server.py}`; new `app/schemas.py`; `tests/test_kb_tools.py`.
- **Change:** add three operations and wire each as a module-level seam-backed `@mcp.tool()` in
  `server.py` (mirror the existing `parse_document` tool; construct `Embedder`/`VectorStore`/`Fetcher`
  at module scope from settings and connect the store in `_lifespan`):
  - `embed(texts) -> list[vec]`.
  - `kb_search(query, topic, k=5) -> {chunks[], citations[]}` — Redis-cached, hybrid (A3),
    tenant/topic-scoped collection name, citations resolved from `kb_sources`.
  - `ingest(owner, sources) -> {ingested, skipped}` — fetch (A1) → chunk (A2) → `content_hash`
    dedup → embed → upsert + write `kb_sources` provenance `{topic, url, fetched_at, citation,
    content_hash}`.
- **Test:** kb_search cache hit vs miss; ingest dedups by `content_hash`; ingest then kb_search
  returns a citation; two topics map to isolated collections.
- **Verify:** gate green.

### A5 — ai-agents capability gateway
**Files:** `src/ai-agents/app/infra/mcp_capability.py` (+`embed`, `kb_search`, `ingest`);
`src/ai-agents/tests/conftest.py` (`fake_capability` gains those methods + a `fake_kb` returning a
canned `{chunks, citations}` per topic); `tests/test_mcp_clients.py`.
- **Change:** each gateway method forwards args to the MCP tool and `unwrap`s the result (the P1
  gateway pattern).
- **Test:** gateway forwards arguments and unwraps the tool result.
- **Verify:** gate green.
> **Produces (consumed by A9/A11 + the Backend/Frontend AI surfaces):**
> `capability.kb_search(query, topic, k) -> {chunks[], citations[]}`,
> `capability.embed(texts) -> list[vec]`, `capability.ingest(owner, sources)`.

---

## WORKSTREAM A-II — Matcher pipeline

### A6 — Matcher agent
**Files:** new `src/ai-agents/app/resources/matcher.py`; `src/ai-agents/app/model/scoring.py`
(+`MatchResult{score: float, reasons: list[str]}`); `tests/test_matcher.py`.
- **Change:** `match(profile, jd, *, embedder, llm) -> MatchResult` — embed profile + JD (cached via
  the embedder), cosine similarity for the score, a **temp-0** LLM call for the rationale. Untrusted
  profile/JD text **fenced**. Deterministic for fixed inputs.
- **Test:** identical inputs → identical score (**§10.1 determinism**); reasons reference real
  skills present in the inputs.
- **Verify:** gate green.

### A7 — mcp-data match persistence
**Files:** `src/mcp-data/app/{tools.py,server.py}` (+`save_match_result(comp_id, job_id,
candidate_user_id, score, reasons)` — idempotent upsert keyed on `(job_id, candidate_user_id)` in a
new `match_results` collection; +`get_match_results(*, job_id=None, candidate_user_id=None)`);
`src/ai-agents/app/infra/mcp_data.py` (+gateway methods); tests in both `src/mcp-data/tests` and
`src/ai-agents/tests`.
- **Change:** follow the existing `DataStore` upsert idiom (`update_one(..., upsert=True)`).
- **Test:** upsert is idempotent (second save with same key updates, doesn't duplicate); get-by-job
  and get-by-candidate filter correctly.
- **Verify:** gate green.

### A8 — `match.run` handler + worker binding
**Files:** `src/ai-agents/app/resources/handlers.py` (+`handle_match_run(payload, *, llm, data,
capability, publisher)`); `src/ai-agents/app/routes/worker.py` (add `"match.run"` to `EVENTS` + a
dispatch branch; `make_dispatch` already receives `capability` — forward it); `tests/test_handlers.py`
+ `tests/test_worker.py`.
- **Change:** `handle_match_run` fetches profile + JD via mcp-data → `match()` (using
  `capability.embed`) → `save_match_result` → emit `match.completed {comp_id, job_id,
  candidate_user_id}`. **Idempotent:** skip if a result for `(job, candidate)` already exists
  (the P1 `handle_interview_completed` report-guard pattern at [handlers.py:73](src/ai-agents/app/resources/handlers.py)).
- **Test:** handler persists + emits once; a redelivered `match.run` is a no-op (no second LLM call,
  no re-emit).
- **Verify:** gate green.
> **Consumes:** `match.run {comp_id, job_id, candidate_user_id}` — **emitted by Backend B1**.
> **Produces:** rows in `match_results` — **read by Backend B2's `match_results` repository**.

---

## WORKSTREAM A-III — RAG-grounded interview questions (reconciles fit-Mismatch 1 + 2)

### A9 — Two-tier cited question plan
**Files:**
- `src/ai-agents/app/model/interview.py` — add `SourceCitation{title, url, snippet}`,
  `source_citations: list[SourceCitation] = []` on `CompetencyArea` + `InterviewBlueprint`, and a
  `JobQuestionPlan{job_id, competencies[], seed_questions[], source_citations[]}` model.
- `src/ai-agents/app/resources/blueprint.py` — split into:
  - `build_job_question_plan(jd_text, *, capability, llm) -> JobQuestionPlan` — extract tech topics
    from the JD → per-topic `capability.kb_search(topic)` → ground seed questions + attach citations.
  - `build_blueprint(jd_text, profile, *, llm, question_plan=None) -> InterviewBlueprint` — if
    `question_plan` is provided, **load** its cited seeds and **adapt** to the candidate profile;
    **never** call `kb_search`.
- `src/ai-agents/app/resources/handlers.py` — `handle_job_published` gains `capability`, calls
  `build_job_question_plan`, persists via new mcp-data `save_question_plan(job_id, plan)`. **Keep
  the existing aptitude-bank build + `aptitude.ready` emit intact** — the cited plan is additive.
- `src/ai-agents/app/routes/worker.py` — forward `capability=capability` to `handle_job_published`
  (currently it's passed only to `handle_profile_parse`).
- `src/mcp-data/app/{tools.py,server.py}` — `save_question_plan(job_id, plan)` /
  `get_question_plan(job_id)` on a `job_question_plans` collection; `get_interview_setup` **also
  returns** the cached `question_plan`.
- `src/ai-agents/app/infra/mcp_data.py` — gateway for the two new tools.
- `src/ai-agents/app/resources/interview_host.py` — `start_interview` passes
  `setup.get("question_plan")` into `build_blueprint`.
- Tests: `tests/test_blueprint.py`, `tests/test_handlers.py`, mcp-data tool tests.
- **Test (offline, fake kb_search):** citations are attached on publish; `build_blueprint` consumes
  a passed plan and issues **zero** `kb_search` calls; assert the interview path
  (`start_interview` + `submit_turn`) never touches `capability` (spy on the fake).
- **Verify:** gate green.
> **Consumes:** `capability.kb_search` (A5). **Touches the live `job.published` handler** — preserve
> the aptitude bank; the cited plan is purely additive.

---

## WORKSTREAM A-IV — Chat assistant (scope-guarded, streamed, cited)
*Chat privacy (§10.3) is the headline P2 risk — build the scope guard + adversarial tests FIRST (A10).*

### A10 — mcp-data chat-scope tools (the privacy boundary)
**Files:** `src/mcp-data/app/{tools.py,server.py}` (+`list_applicants(scope, job_id)`,
`get_application_status(scope, application_id)` where `scope = {comp_id, role, user_id}`);
`src/ai-agents/app/infra/mcp_data.py` (+gateway methods); `src/mcp-data/tests/test_chat_scope.py`.
- **Change:** every call **re-checks** tenant + role + relationship before returning anything:
  - recruiter / company_admin → only applicants to **their own-comp** jobs
    (`application.comp_id == scope.comp_id`).
  - candidate → only **their own** application (`application.candidate_user_id == scope.user_id`).
  - otherwise → empty / denied.
  The application doc already carries `comp_id`, `job_id`, `candidate_user_id`
  ([tools.py:65-83](src/mcp-data/app/tools.py)), so no schema change is needed.
- **Test (adversarial — this is §10.3):** recruiter asking for a non-applicant → empty/denied;
  candidate asking for another candidate's status → denied; any cross-tenant request → denied.
- **Verify:** gate green.

### A11 — Assistant agent (planner-routed)
**Files:** new `src/ai-agents/app/resources/assistant.py`; `tests/test_assistant.py`.
- **Change:** `assistant_turn(messages, scope, *, llm, data, capability) -> {text, citations[]}` — a
  planner LLM routes to one tool: job-question → `capability.kb_search` (cited); application status →
  `data.get_application_status(scope, …)`; candidate ranking → `data.list_applicants(scope, …)`. The
  `scope` is threaded into **every** data call; all untrusted text (messages, retrieved chunks) is
  **fenced** (`_prompt_safety.fence`); answers carry citations.
- **Test:** routing picks the correct tool per intent; the scope ctx reaches every data call; an
  injected "ignore previous instructions" message ends up fenced.
- **Verify:** gate green.

### A12 — `/chat/turn` SSE endpoint (reconciles fit-Mismatch 5)
**Files:** `src/ai-agents/app/routes/interview_api.py` (or new `routes/chat_api.py`) — add
`_caller_identity(request) -> {user_id, role, comp_id}` reading all three access-token claims (the
existing `_caller_user_id` returns only `claims["sub"]` at
[interview_api.py:33](src/ai-agents/app/routes/interview_api.py)); add `POST /chat/turn` streaming
`assistant_turn` as **SSE**; optional `chat_sessions`/`chat_messages` persistence via mcp-data;
`tests/test_chat_api.py`.
- **Change:** authenticate → build the scope ctx from the JWT claims → stream `assistant_turn`
  chunks as SSE `{text}` / `{citation}` events.
- **Test:** 401 without a token; scope is derived from claims (role + comp_id present, not just sub);
  the stream emits text + citation events; **end-to-end privacy** — a recruiter token cannot retrieve
  a non-applicant through the endpoint (exercises A10 through the route).
- **Verify:** gate green.
> **Produces:** `POST /chat/turn` (Bearer access token; SSE of `{text}` / `{citation}` events) —
> **consumed by Frontend F4**.

---

## WORKSTREAM A-V — JD assistant (agent half of polish)

### A13 — JD-assistant agent + REST entry
**Files:** new `src/ai-agents/app/resources/jd_assistant.py` (`improve_jd(brief_or_draft, *, llm) ->
{jd_text, suggestions[]}`, untrusted input **fenced**); a `POST /jd/improve` route on the ai-agents
app (recruiter Bearer token; mirrors the interview REST surface — the company app calls ai-agents
directly, avoiding an admin→ai-agents sync hop); `tests/test_jd_assistant.py` + route test.
- **Test:** returns improved JD text; an injection in the brief is fenced; 401 without a token.
- **Verify:** gate green.
> **Produces:** `POST /jd/improve` — **consumed by Frontend F5**.

---

## Build order (within this plane)
```
A1 → A2 → A3 → A4 → A5        (RAG foundation — gates A9, A11)
A6 → A7 → A8                  (matcher pipeline; A8 consumes Backend B1's match.run)
A9                            (two-tier cited questions; needs A4)
A10 → A11 → A12               (chat — privacy guard A10 FIRST; needs A4 + A10)
A13                          (JD assistant — independent)
```

## Cross-side handoffs (contracts other plans rely on)
| This plan produces | Consumed by |
|---|---|
| `match.run` **consumer** binding + `match_results` rows (A7/A8) | Backend B2 reads `match_results` |
| `match.run` event **shape** `{comp_id, job_id, candidate_user_id}` (A8) | Backend B1 emits it |
| `job_question_plans` written on publish (A9) | (internal — interview start) |
| `POST /chat/turn` SSE (A12) | Frontend F4 |
| `POST /jd/improve` (A13) | Frontend F5 |

## Verification
1. Per task: `bash scripts/check.sh` → GATE PASSED (test count grows from 263).
2. **Chat-privacy adversarial suite (A10 + A12) green — the critical P2 gate (§10.3).**
3. **Matching determinism (A6) green (§10.1).**
4. §10.5 P1 regression green throughout.
5. Both services still `import app.main` cleanly after the worker/handler signature changes.
6. Deferred to live (Gemini key + Qdrant): retrieval quality §10.2, real-Gemini matching/chat/RAG
   answers, a Qdrant integration run.
