# PHASE 2 — Intelligence & Polish

> Adds the "smart" layer on top of the working P1 funnel: AI matching, a RAG tech
> knowledge base + crawl ingestion feeding source-cited interview questions, the
> conversational assistant, and recruiter/candidate polish. See `../ARCHITECTURE.md`,
> `../AI_AGENTS.md`, `../MCP_SERVERS.md`.

## 1. Goal & scope
Make the platform *intelligent*: two-sided AI matching, RAG-grounded question
generation, a tenant/role-scoped chat assistant, plus JD-Assistant, editable rubric
library, talent pool, bias dashboard, funnel analytics, practice mode, and SSO.

**Epics:** H (matching), K (RAG/knowledge), L (chat) + B/C polish.
**Brings online:** `mcp-capability` full toolset + **Qdrant**.

## 2. Services in play
- **ai-agents** — Matcher, Assistant, richer Planner; RAG-grounded Blueprint;
  crawl/ingest workers.
- **mcp-capability** — `web_search`, `web_fetch`, `kb_search`, `embed`, `ingest`.
- **mcp-data** — `list_applicants`, `get_application_status` (chat scope).
- **admin-service** — recommendations endpoints, chat WS host, analytics, SSO.
- **frontend** — recommendations surfaces, chat UI (streaming), dashboards.
- **infra** — **Qdrant** added to docker-compose.

## 3. Data model additions
- `embeddings` handled in Qdrant (collections tenant/topic-scoped); store vector refs
  + `content_hash` on chunks.
- `match_results` `{ comp_id, job_id, candidate_user_id, score, reasons[], at }`.
- `kb_sources` `{ topic, url, fetched_at, citation, content_hash }` (provenance).
- `chat_sessions` / `chat_messages` (scoped) for the assistant.
- `jobs.question_plan` gains `source_citations[]` (RAG provenance).

## 4. Flows added
- **RAG question generation** (ARCHITECTURE §7.4): `job.published` → Blueprint
  extracts tech stack → `kb_search` (on-demand `ingest` if unseen, cached) → cited
  question plan stored on the job. Offline; never in interview hot path.
- **Matching:** embed profiles + JDs → `match.run` → `match_results` → candidate
  recommendations + recruiter ranking.
- **Chat** (ARCHITECTURE §7.5): user→Admin WS→Assistant→(Matcher/`mcp-data`/
  `kb_search`), every fetch scoped by `comp_id`+role+relationship; streamed + cited.

## 5. Module / file additions
```
ai-agents/agents/ matcher.py assistant.py ; agents/blueprint.py (+kb_search)
ai-agents/service/ rpc.py (+/chat/turn) ; workers.py (+match.run, +ingest)
mcp-capability/ web.py kb.py ingest.py embed.py ; qdrant/ ; chunking.py ; crawl/
mcp-data/ tools/ applicants.py status.py
admin-service/api/ recommendations.py chat_ws.py analytics.py ; auth/sso.py
frontend/apps/* chat UI, recommendations, analytics dashboards ; packages/ws chat hook
```

## 6. Service-by-service breakdown
- **mcp-capability:** Qdrant client (hybrid dense+BM25+RRF), semantic chunking
  (1024/128), tiered crawler (httpx/BS4→Playwright) + Gemini extraction, Redis-cached
  `kb_search`, `embed`, `ingest`.
- **ai-agents:** Matcher (embeddings + ranking); Blueprint upgraded to ground
  questions via `kb_search`; Assistant agent (Planner-routed, scoped, cited);
  `ingest` + `match.run` workers.
- **mcp-data:** `list_applicants` (applicants-to-their-jobs only),
  `get_application_status`.
- **admin-service:** recommendation endpoints (consume `match_results`), chat WS host
  (scope context propagation), funnel analytics queries, SSO (Google/Microsoft).
- **frontend:** candidate recommendations + chat; recruiter chat + analytics; SSO login.

## 7. Interfaces / events added
- Events: `match.run`/`match.completed`, `kb.ingest`/`kb.ingested`.
- RPC: `POST /chat/turn` (streaming).
- REST: `GET /candidates/me/recommendations`, `GET /jobs/{id}/ranked-candidates`,
  `GET /companies/{id}/analytics`; chat WS.
- MCP: full `mcp-capability` catalog + `mcp-data` chat-scope tools.

## 8. Ordered build sequence
1. Qdrant infra + `mcp-capability` embed/kb_search/ingest + crawler.
2. Matcher agent + `match.run` worker + recommendation/ranking endpoints + FE surfaces.
3. RAG-grounded Blueprint (cite sources) + provenance on question plans.
4. Assistant agent + chat WS + `mcp-data` chat-scope tools + FE chat (streaming).
5. JD-Assistant, editable rubric/competency library, talent pool, bias dashboard.
6. Funnel analytics + SSO.

## 9. Dependencies / prereqs (from P1)
- Stable agent contracts + `mcp-data` tools; working funnel + scores (matching/chat
  read P1 data); `LLMClient` + cache scaffolding.

## 10. Acceptance / verification
1. **Matching:** recommendations + recruiter ranking are deterministic for fixed
   inputs; embeddings cached; tenant-scoped.
2. **RAG:** question plans cite real sources; `kb_search` hybrid beats pure-vector on
   a keyword-heavy probe set; no crawl occurs during a live interview.
3. **Chat privacy (critical):** recruiter chat NEVER returns non-applicant PII;
   candidate chat only returns own data — verified by adversarial prompt tests at the
   `mcp-data` layer.
4. **Grounding:** chat/feedback answers are cited; "why rejected" reflects the actual
   audit/score, not hallucination.
5. **Regression:** all P1 acceptance tests still pass.

## 11. Exit criteria → Phase 3
Matching + RAG + chat reliable and scoped; tech KB ingestion stable; ready to add the
voice transport to the (unchanged) interview graph.
