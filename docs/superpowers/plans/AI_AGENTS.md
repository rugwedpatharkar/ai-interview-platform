# AI-AGENTS SERVICE

> The **multi-agent brain**: Planner → domain specialists → Summary, over Gemini,
> orchestrated with LangGraph. Stateless compute — reaches all platform data and
> external capabilities **only via MCP**. See `ARCHITECTURE.md` for the system view
> and `MCP_SERVERS.md` for the tools it consumes.

## 1. Technologies

| Concern | Choice | Why |
|---|---|---|
| Orchestration | **LangGraph** | Stateful graphs, conditional edges, checkpointing — fits "adaptive within a plan" + resumable interviews |
| LLM | **Google Gemini** behind an `LLMClient` factory (`langchain-google-genai`) | Generous free tier, strong reasoning, native structured output; provider-swappable |
| Model routing | **fast model** (Gemini Flash-Lite/Groq) for Planner/simple; **strong** for scoring | Latency + cost control |
| Structured I/O | **Pydantic** models | Typed agent contracts; validation on every hop |
| Async jobs | **RabbitMQ** consumers via **aio-pika** (corelib `Consumer`) | Resume parse, MCQ gen, scoring, matching, crawl |
| Live RPC | **FastAPI** HTTP server (`/interview/turn`) | Low-latency per-turn interview calls from admin-service |
| Checkpointer | **Redis** (LangGraph checkpointer) | Resumable interview state across disconnects |
| Tools | **MCP** via `langchain_mcp_adapters` | `mcp-data` (platform) + `mcp-capability` (external) |
| Caching | **Redis** multi-tier (exact + semantic) | Cache repeatable LLM calls (rubric/MCQ per job, embeddings) |
| Observability | LangSmith tracing + structured logs (`comp_id`/`user_id`) | Cost/token tracing, debugging multi-agent flows |
| Tests | **pytest** | Agents tested offline with a fake LLM + fake MCP tools |

Config: `pydantic-settings` env envelope + singleton `get_config()`, lazy SDK init.

## 2. Architecture

```
ai-agents/
  service/
    rpc.py             # FastAPI: POST /interview/turn (+ /chat/turn P2/3)
    workers.py         # RabbitMQ consumers per async task
  llm/
    client.py          # get_chat_model(ChatModelOptions) → provider-agnostic
    routing.py         # task → model tier
    cache.py           # exact + semantic cache (Redis)
  agents/
    planner.py         # orchestrator: classify + route/decompose
    profile.py         # resume → structured profile
    blueprint.py       # JD + profile → rubric, topics, plan, time budget
    aptitude_setter.py # JD + topics → MCQ bank (+ answer keys)
    interviewer.py     # STATEFUL LangGraph graph (Redis checkpointer)
    evaluator.py       # transcript → per-competency scores + evidence
    report_writer.py   # scores + structured data → summary + Excel row
    matcher.py         # (P2) embeddings → match score + recs
    assistant.py       # (P2/3) chat entry point
    summary.py         # synthesize specialist outputs
  prompts/             # PromptRegistry (DB-backed + cached), not inlined
  tools/               # MCP client wrappers (mcp-data, mcp-capability)
  schemas/             # Pydantic contracts shared in spirit with admin-service
  tests/
```

**Agent contracts (strict Pydantic I/O):**

| Agent | Input → Output |
|---|---|
| Planner | task envelope → routing decision / subtask list |
| Profile | resume text/bytes → `{education[], experience[], skills[], ...}` |
| Blueprint | JD + profile → `{rubric, required_topics[], question_plan[], time_budget}` |
| Aptitude-Setter | JD + topics + N → `{questions[{q,options,correct,topic}]}` |
| Interviewer | plan + answer + state → `{next_question | probe | wrap}, structured_data` |
| Evaluator | transcript + rubric → `{per_competency[{name,score,evidence}], overall, rec}` |
| Report-Writer | scores + structured_data → `{summary, excel_row}` |
| Matcher (P2) | profile + JD vectors → `{score, reasons[]}` |
| Assistant (P2/3) | user query + scope → streamed grounded answer |

**The interview graph (LangGraph):** nodes `ask → listen → decide` with conditional
edges (`probe_deeper? / next_topic? / wrap_up?`), bounded by required-topic coverage
+ time budget; shared typed state; **Redis checkpointer** → resume mid-interview.
It is a **single agent**, never a fan-out.

**Parallelism:** Evaluator may fan out per-competency sub-evaluations; Matcher and
batch parsing parallelize. Planner spawns parallel workers only for independent
subtasks (don't over-spawn; multi-agent ≈ 15× tokens).

## 3. Functionalities (by epic / phase)

| Epic | Functionality | Phase |
|---|---|---|
| F | Adaptive **Interviewer** graph (text) + structured-data capture (CTC, notice, exp) | P1 |
| E | **Aptitude-Setter** MCQ generation | P1 |
| C | **Profile** agent: resume → structured profile (via `parse_document`) | P1 |
| F | **Blueprint/Planner**: rubric + question plan from JD (+ profile) | P1 |
| G | **Evaluator** (evidence-backed scores) + **Report-Writer** | P1 |
| — | **Planner/Orchestrator** routing + model routing + caching | P1 (minimal) → P2 |
| K | RAG-grounded question generation via `kb_search`; crawl/ingest workers | P2 |
| H | **Matcher** (embeddings) | P2 |
| L | **Assistant** chat agent (tenant/role-scoped, cited) | P2/3 |
| F | Voice/video interview turns (same graph, new transport) | P3/P4 |

## 4. Interfaces / Connections

### Exposes
- **HTTP RPC** (internal only): `POST /interview/turn` `{session_id, answer}` →
  `{question|done, meta}`; `POST /chat/turn` (P2/3, streaming).
- **RabbitMQ consumers** for: `application.created` (serve/prepare aptitude),
  `aptitude.submitted` (grade), `interview.completed` (score → report),
  `profile.parse`, `blueprint.build`, `match.run` (P2).

### Calls (out)
- **MCP `mcp-data`**: `get_candidate_profile`, `get_job`, `get_job_rubric`,
  `save_aptitude_bank`, `save_aptitude_result`, `save_interview`, `save_score`,
  `save_profile` — the ONLY way it reads/writes platform data.
- **MCP `mcp-capability`**: `parse_document` (P1 resume/cert), `web_search`,
  `web_fetch`, `kb_search`, `embed` (P2).
- **LLM** provider (Gemini) via `LLMClient`.

### Emits (RabbitMQ)
`profile.parsed`, `blueprint.ready`, `aptitude.graded`, `scoring.completed`,
`match.completed` → admin-service funnel advances.

### Does NOT
- Touch MongoDB directly. Hold auth (admin-service owns it). Crawl in the interview
  hot path (crawl is offline at blueprint time, P2).

## 5. Phasing

- **P1:** Profile, Blueprint, Aptitude-Setter, Interviewer (text), Evaluator,
  Report-Writer, a minimal Planner; LLMClient + routing + cache scaffolding; RPC +
  workers; Redis checkpointer.
- **P2:** Matcher + embeddings; RAG-grounded Blueprint via `kb_search`; crawl/ingest
  workers; Assistant chat agent; richer Planner.
- **P3:** Interviewer turns over voice (STT/TTS) — same graph, new transport.
- **P4:** video signaling; vision cues (bias-sensitive, optional).
- **P5:** advanced anti-cheat signals (AI-answer detection), scaling, eval harness.

## 6. Conventions (mirrors andromeda)
- Provider-agnostic `get_chat_model(ChatModelOptions)`; model ids `"<provider>:<model>"`.
- Supervisor + tool-wrapped specialists; per-turn state built fresh; history
  truncation; tool-result size caps.
- Prompts in a registry (DB + cached), versioned, not inlined.
- Specialists get self-contained briefs + own context; no mid-task coordination.
- Offline tests: fake `LLMClient` + fake MCP tools; assert topic coverage,
  time-budget stop, evaluator independence from conduct.
