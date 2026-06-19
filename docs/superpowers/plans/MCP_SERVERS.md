# MCP SERVERS

> Two MCP servers expose the **tools** the AI agents use. `mcp-data` is the agents'
> **sole gateway to platform data** (tenant/role-scoped, auditable); `mcp-capability`
> exposes **external capabilities** (web, embeddings, RAG, document parsing).
> See `ARCHITECTURE.md` and `AI_AGENTS.md`.

## 1. Technologies

| Concern | Choice | Why |
|---|---|---|
| Protocol | **MCP** (Model Context Protocol) | Standardized agent↔tool contract; dynamic discovery; matches andromeda |
| Server SDK | Python MCP server | Same language as ai-agents/admin |
| Client | `langchain_mcp_adapters` (in ai-agents) | LangGraph tool integration |
| `mcp-data` DB | **PyMongo `AsyncMongoClient`** (same MongoDB as admin) | Single source of truth |
| `mcp-capability` vector | **Qdrant** (hybrid: Gemini dense + FastEmbed BM25, RRF) | RAG knowledge base (P2) |
| `mcp-capability` crawl | tiered: **httpx + BeautifulSoup → Playwright**; LLM (Gemini) extraction | Reliable fetch incl. JS sites |
| `mcp-capability` parse | **pdfplumber + pypdf** (+ Gemini Vision OCR), **python-docx** | Resume/cert extraction |
| Cache | **Redis** | `kb_search` result cache; `web_fetch` cache |

## 2. Architecture

```
mcp-data/                       mcp-capability/
  server.py   # MCP server        server.py   # MCP server
  tools/                          tools/
    profiles.py                     web.py        # web_search, web_fetch
    jobs.py                         kb.py         # kb_search (Qdrant hybrid)
    applications.py                 ingest.py     # crawl→chunk→embed→upsert
    aptitude.py                     parse.py      # parse_document
    scores.py                       embed.py      # embed
  scope.py    # comp_id+role+      qdrant/        # client, hybrid search, BM25
              # relationship guard chunking.py    # semantic chunking (1024/128)
  db.py                            crawl/         # tiered fetcher
```

### `mcp-data` — the controlled data gateway
Every tool **requires a caller context** (`comp_id`, `user_id`, `role`) and
**re-enforces scope** before any query (defense-in-depth; the admin service already
authenticated the user, but the MCP layer must not be promptable into leaking
cross-tenant data — critical for the chat assistant). Every write emits/links an
`audit_log`.

### `mcp-capability` — external capabilities
Stateless tools over web + Qdrant. **Crawling/ingestion runs offline** (blueprint
time / scheduled), never in the interview hot path. `kb_search` is hybrid
(dense+sparse, RRF) with Redis caching and **source citations** in results.

## 3. Functionalities → tool catalog

### `mcp-data` tools (P1 unless noted)
| Tool | Signature (concept) | Notes |
|---|---|---|
| `get_candidate_profile` | `(ctx, user_id) → profile` | scope: self, or recruiter↔applicant |
| `get_job` / `get_job_rubric` | `(ctx, job_id) → job/rubric` | scope: comp_id |
| `save_profile` | `(ctx, user_id, fields) → ok` | from Profile agent |
| `save_aptitude_bank` | `(ctx, job_id, questions) → ok` | from Aptitude-Setter |
| `save_aptitude_result` | `(ctx, application_id, score, passed) → ok` | grading |
| `save_interview` | `(ctx, application_id, transcript, structured) → ok` | |
| `save_score` | `(ctx, interview_id, per_competency, overall, rec) → ok` | |
| `list_applicants` | `(ctx, job_id, filters) → [candidate summaries]` | recruiter chat (applicants-only) |
| `get_application_status` | `(ctx, application_id) → status` | candidate chat |

### `mcp-capability` tools
| Tool | Signature (concept) | Phase |
|---|---|---|
| `parse_document` | `(bytes, kind) → {text, structured}` | **P1** (resume/cert) |
| `web_search` | `(query, k) → [results]` | P2 |
| `web_fetch` | `(url) → markdown+structured` (tiered, cached) | P2 |
| `kb_search` | `(query, filters, k) → [chunks+citations]` (hybrid) | P2 |
| `embed` | `(texts) → vectors` (Gemini) | P2 |
| `ingest` | `(sources) → upserted` (crawl→chunk→embed→Qdrant) | P2 (offline) |
| `run_code` | sandboxed exec | P5 (coding aptitude) |

## 4. Interfaces / Connections
- **Consumed by:** ai-agents (only). MCP servers are internal; not exposed to FE.
- **`mcp-data` connects to:** the same **MongoDB** the admin service owns.
- **`mcp-capability` connects to:** Qdrant, Redis, the web, and the LLM (for
  extraction/embeddings).
- **Caller context** is passed by ai-agents from the originating funnel job /
  interview session (propagated from admin-service); MCP servers **trust internal
  network only** and re-validate scope.

## 5. Phasing
- **P1:** `mcp-data` with the platform read/write tools above; `mcp-capability` with
  just `parse_document` (resume extraction). (P1 can also start with `mcp-data` as a
  thin internal library if running a separate process is overkill early — but the
  tool contracts stay identical so it lifts out cleanly.)
- **P2:** full `mcp-capability` (web/kb/embed/ingest) + Qdrant; `list_applicants`,
  `get_application_status` for chat.
- **P5:** `run_code` sandbox; per-tool rate limits + audit hardening.

## 6. Security & conventions
- **No agent ever bypasses `mcp-data`** to reach Mongo — the single auditable seam.
- Scope check (`comp_id`+role+relationship) on **every** `mcp-data` call.
- `kb_search`/`web_fetch` results carry **source citations** for auditability.
- Robots.txt/ToS respected by the crawler; official-docs/search-API sources preferred.
