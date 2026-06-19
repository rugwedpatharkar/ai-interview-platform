# Candidate Growth (Inc 5, Pillar D) — Practice Mode + Skill-Gap Feedback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this task-by-task. Steps use `- [ ]`
> checkboxes. Spec: `docs/superpowers/v2/2026-06-19-candidate-growth-design.md`.

**Goal:** Add **Practice Mode** — a candidate-initiated, self-serve AI interview that **reuses the
interview brain unchanged** (`build_blueprint` → `next_question` → `evaluate_interview`) but is
**detached from any application/job**: no `comp_id`, no funnel event, no recruiter visibility. Plus
**skill-gap feedback**: render the evaluator's existing per-competency output as candidate-facing
growth feedback, shown **only for practice or post-decision — never mid-funnel** (a hard rule). No new
scoring.

**Architecture:** A new `app/resources/practice.py` clones the thin `interview_host` orchestration
(`start`/`turn`/`finalize`) **minus the funnel wiring** — it takes **no `publisher`**, so emitting a
funnel event from practice is impossible by type. It drives the same per-turn `next_question` loop,
finalizes by running `evaluate_interview` + a new `feedback_writer` **inline for the candidate**, and
persists a `PracticeSummary` via mcp-data into a `practice_sessions` collection **keyed by `user_id`**.
In-flight sessions live in a `RedisPracticeStore` (copy of `RedisInterviewStore`, namespace
`practice`). New REST endpoints mirror `interview_api.py`. The frontend gets a `/practice` route
reusing the interview chat UI + a growth-feedback panel. `practice_sessions` joins the Inc 0 erasure
cascade.

## Global Constraints

- **LOCAL-ONLY — never run git/gh.** The skill's "commit" steps are replaced by **"run the gate"**:
  `bash scripts/check.sh` (ruff format+lint S-rules line-88, pip-audit, pytest) must stay green;
  baseline today is **423 tests**. Frontend verified by
  `npx pnpm@9.15.0 --filter @ip/candidate build` + `--filter @ip/{ui,shared,api-client} typecheck`.
  Never `next build` while `pnpm dev` is live.
- **Reuse the brain UNCHANGED.** Do not modify `blueprint.py`, `interviewer.py` (`next_question`),
  `evaluator.py`, `report_writer.py`, `interview_host.py`, or the funnel. The real interview path is
  the regression baseline.
- **Detached invariant (the whole point):** practice carries **no `comp_id`, no `job_id`**, and
  **publishes nothing** to RabbitMQ. The practice resource takes **no `publisher` argument** — this is
  a type-level guarantee, not a convention. A test asserts no event is emitted on finalize.
- **Never-mid-funnel guard (hard rule):** skill-gap feedback renders only for (a) a practice session,
  or (b) a real application in a **terminal** funnel state. Real-application feedback is **default-deny**:
  allowed only for an explicit terminal-state allowlist; every non-terminal state → `403`. Test-locked
  over the `ApplicationState` enum.
- **No new scoring:** feedback consumes the existing `Evaluation`; `feedback_writer` adds zero scoring.
  The candidate never sees a hire/reject verdict from practice.
- **Robustness bar (per `docs/superpowers/plans/PRODUCTION_STANDARDS.md` + `~/.claude/CLAUDE.md`):**
  validate at boundaries (candidate input: topic/jd_text, answer); fence untrusted text with
  `_prompt_safety.fence`/`UNTRUSTED_NOTICE`; structured `get_logger` logs with aggregate metrics;
  trust internal typed calls (no defensive coercion); minimal code. Ownership checked in the resource.
- **Offline gate:** all new logic sits behind the injected LLM seam + in-memory fakes; the real
  Gemini/Mongo/Redis seams are never hit in unit tests.

---

## File structure (new + modified)

```
src/ai-agents/app/
  model/practice.py                        (NEW — PracticeSession, GrowthFeedback, PracticeSummary)
  resources/practice.py                    (NEW — start_practice / submit_practice_turn / build_feedback / finalize)
  resources/feedback_writer.py             (NEW — Evaluation -> GrowthFeedback, candidate-tone; ~30 lines)
  infra/practice_sessions.py               (NEW — RedisPracticeStore; copy of RedisInterviewStore, ns="practice")
  infra/mcp_data.py                        (+save_practice_summary/get_practice_summary/list_practice_summaries)
  routes/interview_api.py                  (+POST /practice/start, /practice/{id}/turn, GET /practice/{id}/feedback,
                                            +GET /practice/sessions (owner-scoped history list, R5),
                                            +GET /application/{id}/feedback with terminal-state guard)
  main.py                                  (+practice_sessions store in create_app deps)

src/ai-agents/tests/
  test_practice.py                         (NEW — resource: start/turn/finalize/ownership/no-event, fakes)
  test_feedback_writer.py                  (NEW — Evaluation -> GrowthFeedback, no verdict)
  test_practice_api.py                     (NEW — endpoints: 200/401/403/404/409/400)
  test_feedback_guard.py                   (NEW — never-mid-funnel: parametrized over ApplicationState)
  conftest.py                              (+fake_practice_sessions; extend fake_data practice methods)

src/mcp-data/app/
  tools.py / server.py                     (+save_practice_summary/get_practice_summary/list_practice_summaries)
  infra/db.py                              (+practice_sessions indexes: (user_id), (user_id, practice_id))
  tests/                                   (+practice tool tests)

src/admin/app/
  resources/compliance.py                  (CandidateEraser: +practice repo + delete_by_user in erase())
  infra/repositories/practice.py           (NEW — practice_sessions repo: delete_by_user / list_by_user)
  tests/test_resources_compliance.py       (+practice rows erased)

frontend/packages/shared/src/
  practice.ts                              (NEW — makePracticeClient(aiagentsUrl, store); mirrors interview.ts)
  index.ts                                 (+export makePracticeClient + types)
frontend/apps/candidate/
  lib/auth.tsx                             (+export practice = makePracticeClient(AIAGENTS_URL, store))
  app/practice/page.tsx                    (NEW — route shell: start form ↔ runner + history list; never-mid-funnel gate)
  app/feedback/[applicationId]/page.tsx    (NEW — post-decision application feedback page, terminal-state-gated, R4)
  components/practice-start-form.tsx       (NEW — topic/JD picker, exactly-one-required, start mutation)
  components/practice-runner.tsx           (NEW — interview chat turn-loop clone + finalizing/feedback)
  components/growth-feedback-panel.tsx     (NEW — summary / strengths / gaps / suggested topics; NO verdict)
  components/candidate-shell.tsx           (+"Practice" NAV entry) ; components/dashboard.tsx (+practice entry card,
                                            +"View feedback" link gated on TERMINAL.has(app.state) → /feedback/[id])
```

**Responsibilities (one job each):** `practice.py` = the detached host loop (imports the brain, holds
no LLM/Mongo/Redis deps directly). `feedback_writer.py` = `Evaluation`→`GrowthFeedback` rendering only.
`infra/practice_sessions.py` = the Redis checkpointer. The endpoints are thin transport. This keeps the
funnel-critical real path completely untouched.

---

## Resolved gaps (completeness audit 2026-06-19)

Resolves the **Inc 5** row of `docs/superpowers/v2/2026-06-19-v2-completeness-audit.md` (Part B →
🟠 High). Full design rationale lives in the design doc **§7a** (`2026-06-19-candidate-growth-design.md`);
this block lists the concrete, pinned facts each task below must honor (numbers are ground-truth
from `src/ai-agents`, not invented):

- **R1 — feedback calc thresholds.** `feedback_writer.py` defines `_STRENGTH_BAND = 0.70` and
  `_GAP_BAND = 0.50` over `CompetencyScore.score` (a float `0.0..1.0`; ground truth
  `app/model/scoring.py`). A pure `_classify(evaluation)` buckets each competency: `score >= 0.70`
  → strength, `score < 0.50` → gap (+ a suggested study topic), `[0.50, 0.70)` → neither. The LLM
  phrases the **pre-computed** sets; it never decides membership. `suggested_topics` derive from the
  gap set (model-only grounding for Inc 5). Worked `Evaluation`→`GrowthFeedback` example: design §7a R1.
- **R2 — topic→JD synthesis.** When `start_practice` gets `topic` (not `jd_text`), a tiny
  `_topic_to_jd_prompt` + `_SynthJD` schema call synthesizes a 4–6 sentence JD, fenced with
  `fence('topic', topic)` + `UNTRUSTED_NOTICE` (`app/resources/_prompt_safety.py`). Pasted `jd_text`
  skips it. Exact prompt: design §7a R2.
- **R3 — practice time budget.** **Reuse `_MAX_BUDGET_MIN = 180`** from `app/resources/blueprint.py`
  — practice adds **no new budget constant**: `build_blueprint._validate` already clamps
  `time_budget_min` to that cap before the session persists, and `RedisPracticeStore` derives its TTL
  from the clamped budget (`time_budget_min*60 + reaper margin`, mirror `app/infra/sessions.py`).
- **R4 — feedback UX surface.** Two surfaces: (a) the **practice** `GrowthFeedbackPanel` inside
  `practice-runner.tsx` (always reachable, detached); (b) a **NEW** post-decision page
  `app/feedback/[applicationId]/page.tsx`, **terminal-state-gated**, reached only from terminal
  application cards. Server `GET /application/{id}/feedback` is default-deny over `ApplicationState`
  (§4.4). Reaffirm never-mid-funnel across both.
- **R5 — practice history.** Scope a minimal list **in**: add route `GET /practice/sessions`
  (owner-scoped, compact `{practice_id, role_label, created_at}`) over the existing
  `list_practice_summaries`; a "past runs" list on `/practice` links each row to its read-only
  `GrowthFeedbackPanel` (reuse `GET /practice/{id}/feedback` — no new detail endpoint).
- **R6 — status-transition order.** In `_finalize`, set `session.status = "completed"` **LAST**
  (after `save_practice_summary`, then `sessions.save`) — exactly like the real
  `interview_host._finalize`. A failed summary-write leaves the session `in_progress` so the next
  `/turn` re-finalizes idempotently (upsert keyed by `(user_id, practice_id)`).
- **R7 — practice indexes.** `practice_sessions` (keyed by `user_id`, never `comp_id`) declares
  `(user_id)` — powers **both** history `find({user_id}).sort(created_at)` and the erasure
  `delete_by_user(user_id)` — and `(user_id, practice_id)` for single-run reads. Both in the single
  index authority `src/mcp-data/app/infra/db.py`. The `(user_id)` index joins the Inc 0 erasure
  cascade (Task 9).
- **Terminal-state allowlist (canonical, ground truth `src/admin/app/model/application.py`):**
  **terminal/allowed** = `hired, rejected, shortlisted, gated_out, expired, withdrawn, abandoned`;
  **non-terminal/denied** = `applied, aptitude_pending, interview_pending, interviewed, scored`
  (note: **`scored` is denied** — a score exists but no decision yet). Default-deny for any
  unlisted/new state.

## TIER A — practice brain loop (reuse the interview brain, detached)

### Task 1 — practice models (TDD)
**Files:** Create `src/ai-agents/app/model/practice.py`; Test `src/ai-agents/tests/test_practice.py`
(model assertions to start).
**Interfaces — Produces:** `PracticeSession`, `GrowthFeedback`, `PracticeSummary` (see spec §4.1).

- [ ] **Step 1 — failing test:** assert a `PracticeSession` has `user_id` and **no `comp_id`/`job_id`
  fields** (e.g. `assert "comp_id" not in PracticeSession.model_fields`), defaults `status ==
  "in_progress"`, and reuses `InterviewBlueprint`/`Transcript`. Assert `GrowthFeedback` has
  `summary/strengths/gaps/suggested_topics` and **no `recommendation`/score field**.
- [ ] **Step 2 — run** `(cd src/ai-agents && ../../.venv/bin/python -m pytest tests/test_practice.py -v)` → FAIL (module missing).
- [ ] **Step 3 — implement** `model/practice.py` exactly as spec §4.1 (reuse `InterviewBlueprint`,
  `Transcript`, `Evaluation`; new `PracticeSession`/`GrowthFeedback`/`PracticeSummary`).
- [ ] **Step 4 — run → PASS.**
- [ ] **Step 5 — gate:** `bash scripts/check.sh` green.

### Task 2 — RedisPracticeStore (TDD)
**Files:** Create `src/ai-agents/app/infra/practice_sessions.py`; Modify
`src/ai-agents/tests/conftest.py` (+`fake_practice_sessions`); Test in `test_practice.py`.
**Interfaces — Produces:** `RedisPracticeStore(redis, namespace="practice", ttl_seconds=7200)` with
`save(session)` / `get(practice_id)` / `list_in_progress()` (same shape as `RedisInterviewStore`).

- [ ] **Step 1 — `fake_practice_sessions`** in `conftest.py`: in-memory `save`/`get`/`list_in_progress`
  keyed by `practice_id`, mirroring `fake_sessions`.
- [ ] **Step 2 — implement** `RedisPracticeStore` as a copy of `RedisInterviewStore` with key
  `practice:{practice_id}` and the same TTL discipline (TTL ≥ `blueprint.time_budget_min*60 +
  reaper margin`). (No unit test on Redis itself — infra; logic is exercised via the fake in Task 3.)
- [ ] **Step 3 — gate green.**

### Task 3 — practice resource: start + turn + finalize (TDD — the core)
**Files:** Create `src/ai-agents/app/resources/practice.py`; Test `src/ai-agents/tests/test_practice.py`.
**Interfaces — Consumes:** `build_blueprint`, `next_question`, `evaluate_interview` (brain, unchanged),
`build_feedback` (Task 4 — stub a trivial passthrough first, or land Task 4 before this step).
**Produces:** `start_practice(user_id, *, topic=None, jd_text=None, data, sessions, llm, clock)` →
`{practice_id, question}`; `submit_practice_turn(practice_id, answer, *, user_id, sessions, data, llm,
clock)` → `InterviewTurnDecision`-shaped. **NO `publisher` parameter anywhere.**

- [ ] **Step 1 — failing tests** (fakes only — `fake_llm_by_schema`, `fake_data`,
  `fake_practice_sessions`):
```python
async def test_start_practice_builds_blueprint_and_first_question(
    fake_llm_by_schema, fake_data, fake_practice_sessions
):
    llm = fake_llm_by_schema({
        InterviewBlueprint: InterviewBlueprint(
            competencies=[CompetencyArea(name="Python")], time_budget_min=20),
        InterviewTurnDecision: InterviewTurnDecision(question="Tell me about asyncio."),
    })
    out = await start_practice(
        "u1", topic="Backend Python", jd_text=None,
        data=fake_data(profile={"headline": "Backend dev", "skills": ["python"]}),
        sessions=(s := fake_practice_sessions()), llm=llm)
    assert out["question"] == "Tell me about asyncio."
    saved = await s.get(out["practice_id"])
    assert saved.user_id == "u1"
    assert not getattr(saved, "comp_id", "")          # detached: no comp_id
    assert not getattr(saved, "job_id", "")

async def test_finalize_evaluates_for_candidate_and_emits_no_event(
    fake_llm_by_schema, fake_data, fake_practice_sessions
):
    # drive one turn to done; finalize runs evaluate_interview + build_feedback INLINE,
    # persists a PracticeSummary, and (critically) publishes NOTHING — there is no
    # publisher in the signature to call. Assert the summary landed in fake_data.
    ...
    assert data.saved_practice_summaries["u1"]        # summary persisted via mcp-data
    # (no publisher fixture is passed at all — the funnel cannot hear about practice)
```
- [ ] **Step 2 — run → FAIL.**
- [ ] **Step 3 — implement** `practice.py` mirroring `interview_host.py`:
  - `start_practice`: validate exactly one of `topic`/`jd_text` (boundary check, else
    `ValidationError`); derive `jd_text` (verbatim, or synthesize a short JD from `topic` via a tiny
    fenced prompt); build a `CandidateProfile` from `data.get_profile(user_id)` (fallback to a minimal
    profile if none); `blueprint = await build_blueprint(jd_text, profile, llm=llm)` (**no
    `question_plan`** — practice never crawls); `decision = await next_question(blueprint,
    Transcript(), llm=llm)`; persist a `PracticeSession` (new uuid `practice_id`, `started_at`);
    return `{practice_id, question}`.
    - [ ] **R2 — topic→JD synthesis:** when only `topic` is given, call a tiny
      `_synthesize_jd(topic, llm=llm)` (local `_topic_to_jd_prompt` + `_SynthJD(BaseModel){jd_text}`,
      4–6 sentence JD) and fence the raw `topic` with `fence('topic', topic)` + `UNTRUSTED_NOTICE`.
      Pasted `jd_text` is used verbatim (skips synthesis). Exact prompt: design §7a R2.
    - [ ] **R3 — budget reuse:** do **not** define a practice budget constant — `build_blueprint`'s
      `_validate` already clamps `time_budget_min` to `_MAX_BUDGET_MIN = 180` (`blueprint.py`). Confirm
      no new cap is introduced; the session's budget is the already-clamped blueprint value.
  - `submit_practice_turn`: load session; `404` if missing, `ForbiddenError` if `session.user_id !=
    user_id`, reject if `status != "in_progress"`; append turn; `_budget_exhausted` hard stop →
    finalize; else `next_question` → if `done` finalize, else save + return.
  - `_finalize(session, *, sessions, data, llm)`: `evaluate_interview(transcript, [c.name for c in
    blueprint.competencies], session.jd_text, llm=llm)` → `build_feedback(evaluation, llm=llm)` →
    build `PracticeSummary` → `data.save_practice_summary(user_id, summary.model_dump())` → flip
    `status="completed"` **LAST** → save. **No publish.** Reuse `interview_host`'s `_budget_exhausted`
    (import it or copy the 3-line helper).
    - [ ] **R6 — status order (explicit, mirror real path):** the order is **(1)**
      `save_practice_summary` (durable write FIRST), **(2)** `session.status = "completed"` +
      `current_question = ""`, **(3)** `sessions.save(session)` (persist the flip LAST). Same as
      `interview_host._finalize` minus publish. A failed step (1) must leave the session
      `in_progress` so the next `/turn` re-finalizes; the upsert keyed by `(user_id, practice_id)`
      makes the retry idempotent (never double-persist, never strand completed-but-unsaved).
    - [ ] **R6 test:** inject a `save_practice_summary` that raises once → assert session stays
      `in_progress` → a second `turn` finalizes cleanly and the summary lands exactly once.
  - Use `get_logger(component="resource.practice")`; log finalize with the turn count (aggregate
    metric).
- [ ] **Step 4 — run → PASS**; add tests: ownership `403`; double-submit after `completed` rejected;
  budget exhaustion finalizes; `max_questions` terminator finalizes; **neither topic-nor-jd →
  ValidationError**.
  - [ ] **R2 synthesis test:** `start_practice(topic="backend engineer")` with
    `fake_llm_by_schema({_SynthJD: _SynthJD(jd_text="...backend role..."), InterviewBlueprint: ...,
    InterviewTurnDecision: ...})` → the persisted session's `jd_text` is the synthesized text; a
    `topic` containing the sentinel chars `«`/`»` (or an injection string) is stripped/neutralized
    by `fence` before reaching the model.
- [ ] **Step 5 — gate green.**

---

## TIER B — skill-gap feedback (render the Evaluation; no new scoring)

### Task 4 — feedback_writer (TDD)
**Files:** Create `src/ai-agents/app/resources/feedback_writer.py`; Test
`src/ai-agents/tests/test_feedback_writer.py`.
**Interfaces — Consumes:** an existing `Evaluation`. **Produces:** `build_feedback(evaluation, *, llm)
-> GrowthFeedback`.

- [ ] **Step 1 — failing test:** given a fixed `Evaluation` (one low-scoring + one high-scoring
  competency, some strengths/concerns), a `fake_llm(GrowthFeedback(...))` returns it; assert
  `build_feedback` returns a `GrowthFeedback` whose **output carries no hire/reject verdict** (no
  `recommendation` text echoed) and surfaces gaps. (The LLM is faked; the test pins the *contract* —
  shape + no-verdict — not the model's words.)
  - [ ] **R1 classifier test (deterministic, no LLM):** use the §7a R1 worked `Evaluation`
    (`Python fundamentals`=0.82, `Concurrency`=0.41, `System design`=0.63). Assert `_classify`
    returns `Concurrency` in **gaps** (`< 0.50`), `Python fundamentals` in **strengths** (`>= 0.70`),
    and `System design` in **neither** (middle band). This is a pure-function test — no fake LLM
    needed for `_classify` itself.
- [ ] **Step 2 — run → FAIL.**
- [ ] **Step 3 — implement** `feedback_writer.py` mirroring `report_writer.py` shape:
  - [ ] **R1 bands + classifier:** module constants `_STRENGTH_BAND = 0.70`, `_GAP_BAND = 0.50`;
    a pure `_classify(evaluation) -> (strengths, gaps)` over `competency_scores` (`>= 0.70` strength,
    `< 0.50` gap, middle band neither). `build_feedback` calls `_classify` **first**, then passes
    only those competency sets (name + rationale) into the writer prompt so the LLM phrases
    pre-computed buckets. `suggested_topics` derive from the gap set (one+ topic per gap competency).
  - a `_prompt` that feeds the **classified** competency sets + strengths/concerns (fenced via
    `_prompt_safety.fence`, format like `report_writer`'s `f"- {cs.competency}: {cs.score:.2f}
    ({cs.rationale})"`) and asks for an **encouraging, second-person growth** summary — strengths to
    keep, gaps to improve, concrete topics to study. `build_feedback` calls
    `llm.structured(_prompt(evaluation), GrowthFeedback)` and returns it. **No scoring; no
    `recommendation` in the output.** `get_logger(component="resource.feedback_writer")`.
- [ ] **Step 4 — run → PASS.**
- [ ] **Step 5 — gate green.** (If Task 3 used a passthrough stub, replace it with this `build_feedback`.)

---

## TIER C — REST endpoints + the never-mid-funnel guard

### Task 5 — practice REST endpoints (TDD)
**Files:** Modify `src/ai-agents/app/routes/interview_api.py`, `src/ai-agents/app/main.py`; Test
`src/ai-agents/tests/test_practice_api.py`.
**Interfaces — Produces:** `POST /practice/start` `{topic?,jd_text?}` → `{practice_id, question}`;
`POST /practice/{practice_id}/turn` `{answer}` → `{done, question}`; `GET
/practice/{practice_id}/feedback` → `{evaluation_summary, feedback}`.

- [ ] **Step 1 — failing endpoint tests** (FastAPI `TestClient`, mirror `interview_api` tests, fakes on
  `app.state.deps`): `200` start/turn for the owner; `401` no/invalid token; `403` driving another
  user's practice; `404` unknown `practice_id`; `409` feedback before `completed`; `400` when neither
  `topic` nor `jd_text` (and `400`/empty when both blank).
- [ ] **Step 2 — run → FAIL.**
- [ ] **Step 3 — implement** the routes thin-transport style (reuse `_caller_user_id`; map
  `NotFoundError`→404 / `ForbiddenError`→403 / `ValidationError`→400 like the existing routes). Pass
  `deps["practice_sessions"]`, `deps["data"]`, `deps["llm"]` — **never `deps["publisher"]`** into the
  practice calls. `GET feedback` loads the completed `PracticeSummary` via
  `data.get_practice_summary(user_id, practice_id)` and returns the `GrowthFeedback` (+ a brief
  evaluation summary), `409` if the session is still in progress.
  - [ ] **R5 — history route:** add `GET /practice/sessions` →
    `{sessions: [{practice_id, role_label, created_at}]}` over `data.list_practice_summaries(user_id)`,
    **owner-scoped** (the `user_id` is `_caller_user_id`, never a client param; no `comp_id`). Compact
    projection only — list rows do not ship the transcript/evaluation; detail comes from the per-id
    `GET /practice/{id}/feedback`. Endpoint test: `200` returns only the caller's runs; a second
    user sees none.
- [ ] **Step 4 — wire deps** in `main.py`'s `create_app({...})`: add
  `"practice_sessions": RedisPracticeStore(redis)` (build it next to `sessions_store`).
- [ ] **Step 5 — run → PASS; gate green.**

### Task 6 — mcp-data practice persistence (TDD)
**Files:** Modify `src/ai-agents/app/infra/mcp_data.py`, `src/mcp-data/app/tools.py`,
`src/mcp-data/app/server.py`, `src/mcp-data/app/infra/db.py`; Tests in `src/mcp-data/tests/` +
extend ai-agents `fake_data`.
**Interfaces — Produces:** gateway `save_practice_summary(user_id, summary)` /
`get_practice_summary(user_id, practice_id)` / `list_practice_summaries(user_id)`; mcp-data tools of
the same names over a `practice_sessions` collection **keyed by `user_id`** (NO `comp_id`).

- [ ] **Step 1 — failing mcp-data tool tests:** a summary saved for `user_id` round-trips via
  `get_practice_summary(user_id, practice_id)`; `list_practice_summaries(user_id)` returns the
  user's summaries; a different `user_id` sees none (per-user isolation).
- [ ] **Step 2 — implement** the three tools + collection write/read; declare indexes `(user_id)` and
  `(user_id, practice_id)` in `mcp-data` `infra/db.py` (the single index authority). Add the three
  methods to `McpDataGateway` (mirror `save_interview`/`get_report` exactly).
  - [ ] **R7 — index intent:** `(user_id)` is load-bearing for **both** history
    (`list_practice_summaries` → `find({user_id}).sort(created_at)`) **and** the erasure cascade
    (`delete_by_user(user_id)`, Task 9); `(user_id, practice_id)` powers `get_practice_summary`
    single-run reads and enforces per-user isolation at the query layer. Collection keyed by
    `user_id`, **never `comp_id`**. (Optional `(user_id, created_at)` only if history sorts
    server-side at scale — omit for Inc 5 volumes.)
- [ ] **Step 3 — extend `fake_data`** in ai-agents `conftest.py` with `save_practice_summary` /
  `get_practice_summary` / `list_practice_summaries` over an in-memory dict (`saved_practice_summaries`).
- [ ] **Step 4 — run → PASS; gate green.**

### Task 7 — never-mid-funnel guard for real-application feedback (TDD — hard rule)
**Files:** Modify `src/ai-agents/app/routes/interview_api.py` (+`GET /application/{application_id}/feedback`);
Test `src/ai-agents/tests/test_feedback_guard.py`.
**Interfaces — Produces:** `_feedback_allowed(application_state) -> bool` (terminal-state allowlist,
default-deny) + the gated endpoint that renders the **already-persisted** recruiter `Evaluation`
through `build_feedback` only when terminal.

- [ ] **Step 1 — failing parametrized test** over `ApplicationState`: `_feedback_allowed` is `True`
  **only** for terminal states and `False` for every in-progress state; an unknown/new state defaults
  to `False`. Endpoint test: terminal state → `200` with `GrowthFeedback`; non-terminal → `403
  feedback not available yet`.
  - [ ] **R4 — canonical allowlist (ground truth `src/admin/app/model/application.py`):**
    **terminal/`True`** = `{hired, rejected, shortlisted, gated_out, expired, withdrawn, abandoned}`;
    **non-terminal/`False`** = `{applied, aptitude_pending, interview_pending, interviewed, scored}`.
    **`scored` is explicitly denied** — a score exists but no decision has been made, so feedback
    there would coach the candidate between scoring and the recruiter's call. The state is read via
    the existing `data.get_application_status(scope, application_id)` (returns `{"state": ...}`).
- [ ] **Step 2 — run → FAIL.**
- [ ] **Step 3 — implement** the guard + endpoint: load the application's current funnel state
  (comp-scoped read via `data.get_application_status`), `_feedback_allowed(state)` else `403`; on
  terminal, fetch the persisted `Evaluation` (recruiter scoring artifact — **no re-scoring**) and
  render `build_feedback`. Default-deny: the allowlist is explicit; unlisted states are non-terminal.
- [ ] **Step 4 — run → PASS; gate green.** (This test is the lock: adding a funnel state without
  classifying it fails here rather than leaking mid-funnel feedback.)

---

## TIER D — frontend /practice + erasure cascade + gate green

> **Frontend grounding (read before writing FE code).** Mirror these verbatim — do not invent new
> conventions:
> - **Client shape:** `frontend/packages/shared/src/interview.ts` (`makeInterviewClient`) and
>   `jd.ts` (`createJdClient`) — both use `restAuthFor(store)` + `authedFetch` + the `post<T>` helper
>   that parses `{detail}` and throws `HttpError(status, detail)`. Index barrel:
>   `frontend/packages/shared/src/index.ts`.
> - **Chat turn-loop UI to clone:** `frontend/apps/candidate/app/interview/[applicationId]/page.tsx`
>   — the `phase`/`turns`/`current`/`answer`/`busy`/`error`/`ended` state machine, the **`inFlight`
>   `useRef` latch** (survives StrictMode double-invoke + same-tick double-Enter), the
>   `isSessionEnded` 409/410 terminal check, the error→retry `Alert`, the `beforeunload` warning, the
>   `role="log"`/`aria-live="polite"` transcript, the `role="status"` current-question, the
>   `⌘/Ctrl+Enter` `onKeyDown`.
> - **`@ip/ui` exports available** (`frontend/packages/ui/src/index.ts`): `Field` (label+hint+error
>   wrapper), `Select`/`SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem`, `Textarea`,
>   `Button` (`loading`/`leadingIcon` props), `Card`/`CardHeader`/`CardTitle`/`CardContent`,
>   `Badge` (`tone`/`variant`), `Progress` (0–100 or indeterminate), `Alert` (`tone`), `Spinner`,
>   `EmptyState`/`ErrorState`/`LoadingState` (icon/message/retry). Tokens: `text-foreground`,
>   `text-muted-foreground`, `bg-surface-muted`, `bg-primary`, `border-l-brand-500`, `text-success`,
>   `text-danger`, `font-display`.
> - **Query/mutation patterns:** `frontend/apps/candidate/components/dashboard.tsx` +
>   `recommended-roles.tsx` — `useQuery`/`useMutation`, `errorMessage(err)` for copy,
>   `enabled`-gating, the `inFlight` latch on mutations. Query client config:
>   `frontend/packages/shared/src/query.ts` (`retry:false`, `refetchUntil`).
> - **Auth wiring:** `frontend/apps/candidate/lib/auth.tsx` — `makeXClient(AIAGENTS_URL, store)`
>   sharing the candidate token store; `useAuth()`/`useRequireAuth`/`useRequireRole`.
> - **FE gotchas (from memory):** `lucide-react` icons must be imported **in the app**, never
>   re-exported through `@ip/ui`; never `next build` while `pnpm dev` is live.

### Task 8 — shared practice client + candidate /practice route
**Files:** Create `frontend/packages/shared/src/practice.ts` (+export in `index.ts`); Modify
`frontend/apps/candidate/lib/auth.tsx`; Create `frontend/apps/candidate/app/practice/page.tsx`,
`frontend/apps/candidate/components/practice-runner.tsx`,
`frontend/apps/candidate/components/practice-start-form.tsx`,
`frontend/apps/candidate/components/growth-feedback-panel.tsx`; add a "Practice" nav entry in
`frontend/apps/candidate/components/candidate-shell.tsx` (`NAV` array) and an entry-point card in
`dashboard.tsx`.

**Interfaces — Produces:** `makePracticeClient(aiagentsUrl, store)` with
`start({ topic?, jd_text? })` → `{ practice_id, question }`, `turn(practiceId, answer)` →
`PracticeTurn { done, question }`, `feedback(practiceId)` → `PracticeFeedbackResult
{ evaluation_summary: string; feedback: GrowthFeedbackView }`, and `list()` →
`{ sessions: PracticeSummaryRow[] }` (the in-scope history list, R5). Types `GrowthFeedbackView`
(`{ summary; strengths: string[]; gaps: string[]; suggested_topics: string[] }`) and
`PracticeTurn` exported from `index.ts`. **The practice client takes no `comp_id`/`applicationId`
in any signature** — the detached invariant reaches the client surface too. (The post-decision
`GET /application/{applicationId}/feedback` read used by the R4 `/feedback/[applicationId]` page is
a **separate** real-application surface — keep it off `makePracticeClient`; reuse the existing
application/interview client that is already comp-scoped, so practice stays detached by type.)

#### Step 1 — `@ip/shared/practice.ts` (the REST client)
- [ ] Mirror `interview.ts` exactly: `restAuthFor(store)` → a `post<T>(path, body?)` /
  `get<T>(path)` pair via `authedFetch` (silent 401-refresh against the admin origin), parsing
  `{ detail }` and throwing `HttpError(res.status, detail ?? "Request failed (status)")` on non-2xx.
- [ ] Methods (paths must match Task 5 routes):
  - `start({ topic, jd_text })` → `post<{ practice_id: string; question: string }>("/practice/start", { topic, jd_text })`.
  - `turn(practiceId, answer)` → `post<PracticeTurn>(\`/practice/${practiceId}/turn\`, { answer })`.
  - `feedback(practiceId)` → `get<PracticeFeedbackResult>(\`/practice/${practiceId}/feedback\`)`
    (a `409` while still in progress surfaces as `HttpError(409)` — the UI treats it as
    "still finalizing", see Step 4).
  - `list()` → `get<{ sessions: PracticeSummaryRow[] }>("/practice/sessions")` — the owner-scoped
    history list (R5; the route is scoped into Inc 5 via Task 5/6, so this method is **in**, not
    optional). Paths must match the Task 5 routes.
- [ ] Export `makePracticeClient`, `type PracticeTurn`, `type GrowthFeedbackView`,
  `type PracticeFeedbackResult`, `type PracticeSummaryRow` from `index.ts` next to the
  `makeInterviewClient` export.

#### Step 2 — `auth.tsx` wiring
- [ ] `import { makePracticeClient } from "@ip/shared";` then
  `export const practice = makePracticeClient(AIAGENTS_URL, store);` directly under the existing
  `interview` export — reuses the same candidate token store (no second auth surface).

#### Step 3 — `practice-start-form.tsx` (the start form; **states: empty / starting / error+retry**)
- [ ] `"use client"`. Props: `onStarted(res: { practice_id: string; question: string }): void`.
  Local state: `mode: "topic" | "jd"` (a `@ip/ui` `Select` or `Tabs` toggle), `topic: string`,
  `jdText: string`, plus a `useMutation` for `practice.start`.
- [ ] **Exactly-one-required rule, enforced client-side** (mirrors the backend boundary check in
  Task 3/5 — UI guard is the *second* layer, server stays authoritative): the Start button is
  `disabled` unless the active mode's field is non-empty after `trim()`; the inactive field is
  ignored. Send only the active field (`mode === "topic" ? { topic } : { jd_text: jdText }`) so the
  "exactly one" server contract is never violated by the client.
- [ ] Layout with `@ip/ui`: a `Card` titled "Practice interview"; a mode toggle; `Field`
  (label "Role or topic", hint "e.g. Senior Backend Engineer — Python") wrapping an `Input` for
  topic mode, or `Field` (label "Paste a job description") wrapping a `Textarea rows={8}` for JD
  mode; a primary `Button` (`loading={start.isPending}`, `leadingIcon={Sparkles}`,
  label "Start practice" / "Starting…"). Include a one-line `Alert tone="info"` framing it as
  private ("Practice is just for you — it's never shared with any employer or recruiter.") to make
  the **detached** nature legible to the candidate.
- [ ] **`inFlight` `useRef` latch** on submit (copy the dashboard pattern) so a double-click/StrictMode
  re-invoke can't fire two `start` calls. On error, render an inline `Alert tone="danger"` with the
  `errorMessage(err)` text and a `Button variant="outline"` Retry (re-submits the same field); keep
  the typed input intact on failure. On success, call `onStarted(res)`.
- [ ] a11y: `Field` already wires `<Label htmlFor>`; give the mode toggle an `aria-label`; the
  submit `Button` is keyboard-reachable; `Alert` carries the error text inline (not a vanishing toast).

#### Step 4 — `practice-runner.tsx` (the turn loop + feedback; **states: in-progress / finalizing / feedback-ready / error+retry / ended**)
- [ ] `"use client"`. Props: `practiceId: string; firstQuestion: string`. **Clone the
  `interview/[applicationId]/page.tsx` state machine** but drop the application-specific pieces:
  - Reuse: `turns: {question,answer}[]`, `current`, `answer`, `busy`, `error`, `ended`, the
    `inFlight` `useRef`, `isSessionEnded` (409/410 → terminal `ended`), the `beforeunload` warning
    while a turn loop is active, the `role="log" aria-live="polite"` transcript, the
    `role="status" aria-live="polite"` current question, the `⌘/Ctrl+Enter` `onKeyDown`, the
    error→Retry `Alert` that re-runs the last action with the answer preserved.
  - **Omit entirely:** the proctoring `useEffect` + `startProctoring`/`proctor.send`, the consent
    checkboxes/localStorage (`consentKey`/`proctorKey`), and the `intro` phase's consent gate.
    Practice is private and detached — **no consent, no proctoring** (matches Task 8 Step-3 note and
    spec §3/§4). The runner starts already `active` (it's handed `firstQuestion` by the start form).
  - `phase: "active" | "finalizing" | "done"`. `send()` calls `practice.turn(practiceId, text)`;
    on `res.done` flip `phase="finalizing"` and trigger the feedback query (below); else set
    `current = res.question`.
- [ ] **Feedback fetch (finalizing → feedback-ready):** a `useQuery({ queryKey: ["practice-feedback",
  practiceId], queryFn: () => practice.feedback(practiceId), enabled: phase !== "active", retry: …})`.
  Because finalize runs `evaluate_interview` + `build_feedback` server-side, the first `GET
  /feedback` can race the `completed` flip and return **`409`**; use `refetchUntil`-style polling OR
  a bounded retry that treats `HttpError(409)` as "not ready, poll again" (≈2.5s, like
  `refetchUntil`) and any other status as a real error. While pending, render a `finalizing` state:
  a `Card` with `Spinner` + "Scoring your practice interview…" and an indeterminate `Progress`.
- [ ] On success, render `<GrowthFeedbackPanel result={data} />` (Step 5). On feedback error
  (non-409), show `ErrorState message={errorMessage(error)} retry={() => refetch()}` — the transcript
  is already persisted server-side, so retry is safe and idempotent.
- [ ] **`ended` (409/410 on a turn):** the session expired/already-completed mid-loop — show the same
  terminal `Alert tone="warning"` ("This practice session has ended…") with a link back to
  `/practice` to start a new one (no resume).

#### Step 5 — `growth-feedback-panel.tsx` (render `GrowthFeedback`; **NO verdict**)
- [ ] `"use client"`. Props: `result: PracticeFeedbackResult` (`{ evaluation_summary, feedback }`).
  Renders **only** growth content — there is **no hire/reject/pass-fail verdict, no numeric score,
  no `recommendation`** anywhere in this component (enforces spec §4.1/§4.3 at the render layer; the
  server already strips `recommendation` from `GrowthFeedback`, this is the visual guarantee).
- [ ] Layout with `@ip/ui`:
  - A header `Card` with `CardTitle` "Your growth feedback" + the `feedback.summary` paragraph and
    the `evaluation_summary` as muted sub-copy.
  - **Strengths**: a `Card` (heading + `CheckCircle2` lucide icon, `text-success`) listing
    `feedback.strengths` as a `<ul>` of check-prefixed items (reuse the `recommended-roles.tsx`
    bulleted-reasons pattern). Empty list → omit the card (or a soft "No standout strengths captured
    this round").
  - **Gaps / areas to grow**: a `Card` listing `feedback.gaps` with a neutral/`info` `Badge` per gap
    or a `TrendingUp`-style icon — framed as "areas to grow", never "failures".
  - **Suggested topics to study**: `feedback.suggested_topics` rendered as a row of
    `Badge tone="info" variant="soft"` chips inside a `Card`.
  - *(optional)* a `Progress` bar can visualize "competencies covered" **only** as a neutral coverage
    indicator — **never** a score gauge; if it risks reading as a grade, omit it.
  - A footer `Button`/`Link` "Practice again" → `/practice` and "Back to dashboard" → `/`.
- [ ] All lucide icons imported **in this file** (FE gotcha). `aria-hidden` on decorative icons;
  lists are semantic `<ul>/<li>`; the panel is readable in dark mode (uses tokens, no hard-coded
  colors) and responsive (single-column on mobile, `sm:` grid for the strengths/gaps pair).

#### Step 6 — `app/practice/page.tsx` (the route shell + **never-mid-funnel UI gate**)
- [ ] `"use client"`, `useRequireAuth(token, ready)` + `useRequireRole(... ["candidate"] ...)` like
  `app/page.tsx`; wrap in `<CandidateShell>`. `PageHeader`/`h1` "Practice".
- [ ] Local `started: { practice_id, question } | null`. Render `<PracticeStartForm
  onStarted={setStarted} />` when `null`, else `<PracticeRunner practiceId={…} firstQuestion={…} />`.
  A "Start another" affordance resets `started` to `null`.
- [ ] **Never-mid-funnel UI gate (enforce the hard rule in the FE too):** this page renders
  **practice** feedback only — which is *always* allowed (detached, no funnel). The **real-application**
  `GrowthFeedbackPanel` must render **only** from a post-decision surface: gate it behind a
  `TERMINAL` application-state check (reuse the `dashboard.tsx` `TERMINAL` set:
  `withdrawn/hired/rejected/expired/abandoned`) before ever calling `GET /application/{id}/feedback`.
  Concretely: do **not** add any "view feedback" entry point on a non-terminal application card; the
  link/panel appears only when `TERMINAL.has(app.state)`. The server `403`s anyway (Task 7,
  default-deny), so this is the UI matching the server contract — never the only guard, but never
  contradicting it. Add a short code comment citing the never-mid-funnel rule at the gate.
- [ ] **Entry points:** add `{ href: "/practice", label: "Practice" }` to `candidate-shell.tsx`'s
  `NAV`; add a small "Practice for an interview" `Card` (with a `Sparkles`/`Dumbbell` icon and a
  `Link` to `/practice`) to `dashboard.tsx`, framed as private/no-pressure.

#### Step 6b — `app/feedback/[applicationId]/page.tsx` (NEW — post-decision feedback page, R4)
- [ ] `"use client"`. The **second** feedback surface (the practice panel is the first): a page keyed
  by `applicationId` that renders the **real-application** `GrowthFeedbackPanel`. `useRequireAuth` +
  `useRequireRole(["candidate"])`, wrapped in `<CandidateShell>`, `PageHeader`/`h1` "Interview feedback".
- [ ] **Terminal-state gate (the UI half of never-mid-funnel):** read the application's current state
  (reuse the dashboard application query); if `!TERMINAL.has(app.state)` render an `EmptyState`
  ("Feedback unlocks once a final decision is made") and **do not** call the feedback endpoint. Only
  when terminal, `useQuery` → `GET /application/{applicationId}/feedback` and render
  `<GrowthFeedbackPanel result={data} />`. The server is `403` default-deny anyway (Task 7) — this is
  the UI matching the contract, never the only guard. Add a code comment citing the never-mid-funnel rule.
- [ ] **Entry point (gated):** in `dashboard.tsx`, the per-application card shows a "View feedback"
  `Link` to `/feedback/{app.application_id}` **only** when `TERMINAL.has(app.state)` (reuse the
  existing `TERMINAL` set: `withdrawn, hired, rejected, expired, abandoned`); absent on every
  non-terminal card so a candidate cannot navigate to mid-funnel feedback. (Note: the server allowlist
  R4 additionally treats `shortlisted`/`gated_out` as terminal; the FE `TERMINAL` set governs only
  whether the *candidate-visible* link appears — the server stays authoritative for the read.)
- [ ] a11y/dark/responsive parity with the practice panel; lucide icons imported in-file.

#### Step 7 — practice history list (scoped in, R5)
- [ ] **In scope** (Task 6 exposes `GET /practice/sessions` per R5): a `usePracticeHistory`
  `useQuery({ queryKey: ["practice-history"], queryFn: () => practice.list() })` rendering a compact
  list of past runs (`role_label` + `created_at`) on `/practice` with `EmptyState` ("No practice runs
  yet"), `LoadingState`, `ErrorState`. Each row links to its read-only `GrowthFeedbackPanel` (reuse
  `GET /practice/{id}/feedback` — no new detail endpoint). `makePracticeClient` gains `list()` →
  `get<{ sessions: PracticeSummaryRow[] }>("/practice/sessions")`. (Rich history — filters, search,
  re-take — stays a follow-up.)

#### Step 8 — verify (FE gate)
- [ ] `npx pnpm@9.15.0 --filter @ip/candidate build` green; `npx pnpm@9.15.0 --filter
  @ip/{ui,shared,api-client} typecheck` green. **Do not `next build` while `pnpm dev` is live.**
- [ ] Responsive + dark sanity: the start form, runner, and feedback panel read correctly at mobile
  width and in dark theme (token-driven, no hard-coded colors).

#### Step 9 — manual (Chrome via preview)
- [ ] Sign in → `/practice` → pick a topic (and separately, paste a JD) → run a full text practice
  interview to `done` → see the `finalizing` state resolve into `GrowthFeedbackPanel` with
  strengths/gaps/suggested-topics and **no verdict**. Exercise: empty-form disabled state, a forced
  error→Retry, and the 409-while-finalizing poll. No console errors.
- [ ] **History (R5):** after a run, the "past practice runs" list on `/practice` shows the new row
  (`role_label` + `created_at`); clicking it opens the read-only `GrowthFeedbackPanel`.
- [ ] **Post-decision feedback (R4):** a terminal application card shows "View feedback" → opens
  `/feedback/[applicationId]` with the panel; a **non-terminal** application card shows **no** link
  and the page renders the locked `EmptyState` (and the server `403`s if hit directly).

### Task 9 — erasure cascade entry (TDD — Inc 0 follow-through)
**Files:** Create `src/admin/app/infra/repositories/practice.py`; Modify
`src/admin/app/resources/compliance.py` (`CandidateEraser`), the `CandidateEraser` wiring
(`admin` route/factory that constructs it), and `src/admin/tests/test_resources_compliance.py`.

- [ ] **Step 1 — failing test:** `CandidateEraser.erase(user_id)` calls `practice.delete_by_user(user_id)`
  (assert the candidate's `practice_sessions` rows are deleted) alongside the existing
  reports/interviews/attempts/consents deletions.
- [ ] **Step 2 — run → FAIL.**
- [ ] **Step 3 — implement** a `PracticeRepository` (`delete_by_user(user_id)` / `list_by_user(user_id)`
  over `practice_sessions`, mirroring `InterviewRepository`); inject it into `CandidateEraser.__init__`
  and call `await self._practice.delete_by_user(user_id)` in `erase()`. Update the eraser's
  construction site to pass the new repo. (Indexes already declared in mcp-data db.py — admin reads the
  same collection through its own repo, consistent with the existing pattern.)
- [ ] **Step 4 — run → PASS; gate green.**

### Task 10 — finalize + regression
- [ ] **Confirm detached invariant:** re-read `practice.py` — no `comp_id`, no `job_id`, no `publisher`
  import or parameter anywhere; the no-event finalize test is green.
- [ ] **Confirm never-mid-funnel:** `test_feedback_guard.py` green; real-application feedback is `403`
  for every non-terminal state.
- [ ] **Regression:** the real interview path (`interview_host` + brain + funnel) tests are untouched
  and green; the text-interview FE page is unchanged.
- [ ] **Full gate** `bash scripts/check.sh` green (grown from **423**); both FE builds + typechecks
  green; update `docs/superpowers/plans/HANDOFF.md` (new "Candidate Growth (Inc 5)" section) + memory;
  flip the spec/plan index row in the architecture overview to authored. Record the open follow-ups
  (practice rate-limit/quota, history UX, topic taxonomy, KB-grounded suggested topics, post-decision
  feedback company opt-in).

---

## Verification (end-to-end)

1. **Per backend task:** `bash scripts/check.sh` GREEN (grows from **423**); all new logic runs offline
   behind the injected LLM seam + in-memory fakes (Gemini/Mongo/Redis never hit in unit tests).
2. **Detached / no-funnel-leak (offline):** `test_practice.py` proves a full practice interview drives
   N turns, finalizes, evaluates **for the candidate**, persists a `PracticeSummary`, and **emits no
   event** (no `publisher` in the signature) — practice never reaches the funnel.
3. **Never-mid-funnel guard:** `test_feedback_guard.py` proves real-application feedback is refused
   (`403`) for every non-terminal `ApplicationState` and allowed only for terminal ones (default-deny).
4. **No new scoring:** `test_feedback_writer.py` proves feedback is a render of an existing `Evaluation`
   with no hire/reject verdict in the candidate-facing output.
5. **Endpoints:** `test_practice_api.py` proves `200/401/403/404/409/400` for start/turn/feedback.
6. **Erasure:** `CandidateEraser.erase(user_id)` deletes the candidate's `practice_sessions`.
7. **Frontend:** `npx pnpm@9.15.0 --filter @ip/candidate build` + `--filter @ip/{ui,shared,api-client}
   typecheck` green; manual `/practice` E2E (pick topic → run interview → growth feedback) in Chrome.
8. **Regression:** the real interview path + brain modules + funnel are unmodified and stay green.

## Risks / re-verify at execution

- **Inc 0 dependency:** the erasure-cascade stub is expected from Inc 0; Task 9 adds the concrete
  `practice_sessions` purge. If Inc 0 hasn't landed, Task 9 still works standalone (it just extends
  `CandidateEraser` directly).
- **Brain reuse stays pure:** double-check that importing `build_blueprint`/`next_question`/
  `evaluate_interview` into `practice.py` requires **zero** edits to those modules. If a temptation to
  add an "is_practice" branch appears, stop — the detached clone is deliberate.
- **`build_blueprint` without `question_plan`:** practice passes no `question_plan`, so the
  blueprint takes the no-RAG `_prompt` branch (no `capability` gateway, no crawl). Confirm
  `build_blueprint`'s `question_plan=None` path is the one exercised.
- **`fake_llm_by_schema` on finalize:** practice finalize calls the LLM twice (Evaluation → GrowthFeedback);
  use the schema-keyed fake so each call returns the right object.
- **`ApplicationState` enum source:** the guard's terminal allowlist must reference the canonical
  funnel-state enum (admin) — re-verify the exact terminal state names at execution (e.g. `hired`,
  `gated_out`, post-`assessment_review` decision) and keep default-deny for anything unlisted.
