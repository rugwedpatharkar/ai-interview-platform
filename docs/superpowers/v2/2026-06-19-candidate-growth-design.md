# Candidate Growth (Inc 5, Pillar D) — Practice Mode + Skill-Gap Feedback — Design

> **Context.** Implements the v2 design's **Pillar D — Candidate Growth**
> (`docs/superpowers/v2/2026-06-19-v2-architecture-overview-design.md` §5, §8 Inc 5). This is the
> **lowest-risk AI surface** in v2: a candidate-initiated, self-serve interview that **reuses the
> interview brain unchanged** but is **detached from any application/job** — no `comp_id`, no funnel
> event, no recruiter visibility. Plus **skill-gap feedback**: render the evaluator's existing
> per-competency output as candidate-facing growth feedback, shown **only for practice or
> post-decision — never mid-funnel**. Personal project, **LOCAL-ONLY — never run git/gh.** No
> production code yet; this is the design awaiting review.

## 1. Goal & scope

**In scope:**
- **Practice Mode** — a candidate picks a role (a topic or a pasted JD) and runs a full AI interview
  exactly like the real one (build a blueprint → adaptive per-turn loop → finalize), then sees an
  **evaluation written for their own eyes**. It is **detached**: no application, no `comp_id`, no
  funnel event, no recruiter ever sees it. This is the "try before you apply" surface that
  deliberately sidesteps the AI-screening compliance surface (NYC LL144 / EU AI Act AEDT scope) —
  there is no employment decision because there is no employer and no application.
- **Skill-Gap Feedback** — the existing `Evaluator` already emits per-competency
  `{competency, score, rationale}` plus `strengths` / `concerns`. Render it as candidate **growth
  feedback** (strengths · gaps · suggested topics to study). Shown **only** for (a) a practice
  session, or (b) **after a final hiring decision** on a real application. **No new scoring.**

**Out of scope (deferred / explicitly cut):**
- **No new scoring or grading.** Practice reuses the same `evaluate_interview`; feedback is a
  *rendering* of that output, not a second judgement.
- **Voice/video practice** — text transport only for Inc 5. Practice is built to drive the same
  per-turn `ask()` loop, so the voice/video transports (Pillar C) plug in later **without touching
  the practice resource**. YAGNI for now.
- **Recruiter visibility / analytics on practice** — practice is private by construction; it never
  appears in any recruiter or analytics surface.
- **Mid-funnel coaching** — feedback during a live screening is a **hard non-goal** (see §4.4): it
  must never coach a candidate through the assessment that is scoring them.

## 2. Where it fits (reuse the brain; detached from the funnel)

The interview "brain" is reused **byte-for-byte** — `blueprint.build_blueprint`,
`interviewer.next_question` (stateless), `evaluator.evaluate_interview`, and `report_writer`
(reused with a candidate-tone prompt). None of these files change.

| Real interview (Inc 6 text path) | Practice mode (this design) | Difference |
|---|---|---|
| `start_interview(application_id, …)` loads `get_interview_setup` (JD + profile + `comp_id` + `job_id`) | `start_practice(user_id, topic\|jd_text)` builds a blueprint from a **candidate-chosen** role/JD | No setup row, **no `comp_id`/`job_id`**, no ownership-against-application check |
| `RedisInterviewStore`, key `interview:{application_id}` | `RedisPracticeStore`, key `practice:{practice_id}` (same shape) | Different namespace; keyed by `practice_id`, scoped to `user_id` |
| Finalize → `save_interview` + **publish `interview.completed`** → Evaluator → funnel `scored` | Finalize → `evaluate_interview` **inline, for the candidate** → persist a **summary** | **No event published; the funnel never hears about practice** |
| Transcript → recruiter `InterviewReport` (xlsx) | Transcript → `Evaluation` → candidate **growth feedback** | Same `Evaluation` shape; candidate-tone rendering |

The single most important structural property: **practice publishes nothing to RabbitMQ and carries
no `comp_id`.** The funnel/CAS state machine is the integration seam for everything that touches an
application; practice deliberately stays off that seam, which is exactly what removes it from the
AEDT/AI-screening risk surface. The architecture overview's data-ownership rule still holds —
ai-agents stays stateless and persists the practice summary via **mcp-data** (admin owns Mongo).

## 3. Architecture (components + boundaries)

```
Candidate app  ── POST /practice/start ─────────►┐
(/practice)        {topic|jd_text}               │   ai-agents REST (interview_api pattern)
               ── POST /practice/{id}/turn ──────┤   • _caller_user_id (existing seam, access JWT)
                   {answer}                       │   • NO comp_id, NO recruiter scope
               ── GET  /practice/{id}/feedback ──┘
                                                  │
                                                  ▼
                                   app/resources/practice.py  (NEW)
                                   start_practice / submit_practice_turn / build_feedback
                                   reuses: build_blueprint · next_question ·
                                           evaluate_interview · feedback_writer
                                                  │
                              ┌───────────────────┼────────────────────┐
                              ▼                    ▼                    ▼
                  RedisPracticeStore        injected LLM         McpDataGateway
                  practice:{id}             (fake offline)       save_practice_summary /
                  (in-flight session)                            get_practice_summary
                                                                       │
                                                                       ▼
                                                              mcp-data → Mongo
                                                              practice_sessions  (keyed by user_id)
```

**Components (one job each):**

1. **`app/resources/practice.py`** (NEW, ai-agents) — the practice brain wrapper. Mirrors
   `interview_host.py` (`start_interview` / `submit_turn` / `_finalize`) but **detached**:
   - `start_practice(user_id, *, topic=None, jd_text=None, data, sessions, llm, clock)` — derive a JD
     (use `jd_text` verbatim, or synthesize a short JD from `topic` via a tiny prompt), build a
     minimal `CandidateProfile` from the candidate's own stored profile (reuse `data.get_profile`) so
     the blueprint can tailor; call **`build_blueprint`** (no `question_plan` — practice never crawls
     the KB) then **`next_question`** for the first question; persist a `PracticeSession`; return
     `{practice_id, question}`.
   - `submit_practice_turn(practice_id, answer, *, user_id, sessions, data, llm, clock)` — same
     per-turn loop as `submit_turn` (append turn, budget check, `next_question`, finalize). The **only
     differences** vs the real path: keyed by `practice_id`; ownership is `session.user_id == user_id`;
     **finalize does NOT publish** — it runs `evaluate_interview` inline and persists a summary.
   - `build_feedback(...)` — turn an `Evaluation` into candidate-facing `GrowthFeedback` (see §4.3).
   - Reuses `_prompt_safety.fence` / `UNTRUSTED_NOTICE` for any candidate/JD text in prompts.

2. **`POST /practice/start`, `POST /practice/{practice_id}/turn`, `GET /practice/{practice_id}/feedback`**
   — new routes mirroring `interview_api.py`'s thin-transport pattern (`_caller_user_id`, domain
   errors → HTTP, fakes injected via `app.state.deps`). **No recruiter scope, no `comp_id`.** A
   candidate may only drive/read **their own** practice (ownership check in the resource, `403` else).

3. **`RedisPracticeStore`** (NEW, `app/infra/practice_sessions.py`) — copy of `RedisInterviewStore`
   with namespace `practice` and key `practice:{practice_id}`; same TTL discipline (TTL ≥ time budget
   + reaper margin). Holds the in-flight `PracticeSession` between turns so the agents stay stateless.

4. **mcp-data**: `save_practice_summary(user_id, summary)` / `get_practice_summary(user_id,
   practice_id)` / `list_practice_summaries(user_id)` + a **`practice_sessions`** Mongo collection,
   **keyed by `user_id`** (NOT `comp_id` — there is none). Index `(user_id)` and
   `(user_id, practice_id)` declared in `admin/infra/db.py` (the single index authority). The
   completed summary (final transcript + `Evaluation` + `GrowthFeedback` + `created_at`) is persisted
   so a candidate can revisit prior practice runs; the **in-flight** session lives only in Redis.

5. **Frontend `/practice`** (candidate app) — reuses the interview chat UI. A small role-picker
   (topic input or JD paste) → start → the **same Q/A chat loop** as
   `app/interview/[applicationId]/page.tsx` → on completion a **GrowthFeedbackPanel** (strengths /
   gaps / suggested topics). A `makePracticeClient(aiagentsUrl, store)` in `@ip/shared` mirrors
   `makeInterviewClient` (uses `authedFetch` for silent token refresh).

## 4. Design detail

### 4.1 Practice models (`app/model/practice.py`, NEW)

Reuse `InterviewBlueprint` / `Transcript` / `TranscriptTurn` / `Evaluation` verbatim. New types:

```python
class PracticeSession(BaseModel):
    practice_id: str
    user_id: str = ""                 # the candidate's own id; NO comp_id, NO job_id
    role_label: str = ""              # topic or a short JD label, for the candidate's history list
    jd_text: str = ""                 # verbatim JD (pasted) or synthesized-from-topic, for the evaluator
    blueprint: InterviewBlueprint = Field(default_factory=InterviewBlueprint)
    transcript: Transcript = Field(default_factory=Transcript)
    current_question: str = ""
    started_at: str = ""              # ISO; anchors the time-budget clock (reuse _budget_exhausted)
    status: str = "in_progress"       # in_progress | completed

class GrowthFeedback(BaseModel):
    """Candidate-facing rendering of an Evaluation — growth tone, NO hire/reject verdict."""
    summary: str = ""
    strengths: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)          # competencies scoring low + why
    suggested_topics: list[str] = Field(default_factory=list)

class PracticeSummary(BaseModel):
    practice_id: str
    user_id: str = ""
    role_label: str = ""
    transcript: Transcript = Field(default_factory=Transcript)
    evaluation: Evaluation = Field(default_factory=Evaluation)
    feedback: GrowthFeedback = Field(default_factory=GrowthFeedback)
    created_at: str = ""
```

> **No recommendation leaks to the candidate.** `Evaluation.recommendation` (advance/hold/reject) is
> kept server-side in the summary for the candidate's *own* history but is **not** surfaced as a
> verdict in `GrowthFeedback` — practice coaches, it does not judge. The numeric scores drive the
> *gaps* (low-scoring competencies) without showing a pass/fail.

### 4.2 The per-turn loop (reuse, detached)

`start_practice` / `submit_practice_turn` are deliberately near-clones of `interview_host`'s
`start_interview` / `submit_turn`, minus the funnel wiring. The loop calls the **same**
`next_question(blueprint, transcript, llm=...)` with its `max_questions=8` terminator and the **same**
`_budget_exhausted` time-budget hard stop (the blueprint's `time_budget_min`, capped at
`_MAX_BUDGET_MIN`). Finalize:

```
finalize(session):
    evaluation = await evaluate_interview(session.transcript,
                                          [c.name for c in session.blueprint.competencies],
                                          session.jd_text, llm=llm)
    feedback   = await build_feedback(evaluation, llm=llm)
    summary    = PracticeSummary(practice_id=…, user_id=…, role_label=…,
                                 transcript=…, evaluation=evaluation, feedback=feedback,
                                 created_at=clock().isoformat())
    await data.save_practice_summary(session.user_id, summary.model_dump())   # via mcp-data
    session.status = "completed"; session.current_question = ""
    await sessions.save(session)                                              # status LAST (mirror real path)
    return done
```

No `publisher` is injected into the practice resource **at all** — the type signature itself makes it
impossible to emit a funnel event from practice (trust-the-system: the absence of the collaborator is
the guarantee). The status flip stays **last** so a save failure leaves the session resumable on the
candidate's next `/turn` (same idempotency reasoning as `_finalize`).

### 4.3 Skill-gap feedback (`feedback_writer`, no new scoring)

Minimal new work: a **`feedback_writer` prompt variant** (new `app/resources/feedback_writer.py`, ~30
lines, same shape as `report_writer.py`) that takes the existing `Evaluation` and emits
`GrowthFeedback` in an encouraging, second-person, growth-oriented tone — strengths to keep, gaps to
work on, concrete topics to study. It uses `_prompt_safety.fence` for the (model-authored, but still
fenced) competency rationales. **Decision:** a dedicated tiny writer rather than overloading
`report_writer`, because the audience and tone differ (candidate-growth vs recruiter-decision) and a
separate prompt keeps each single-purpose — but it consumes the **same `Evaluation`** and adds **no
scoring**. (Alternative considered: reuse `report_writer` with a candidate-tone prompt argument — the
overview lists this as acceptable; rejected only to avoid a tone-mode branch inside the
decision-facing writer. Either satisfies "no new scoring.")

Where it renders:
- **Practice:** always — that is the whole point.
- **Real application:** only **after a terminal funnel decision** (hired/rejected). The candidate app
  fetches feedback for a real application only when its funnel state is terminal; otherwise the
  feedback endpoint/component is not reachable. This reuses the **already-persisted recruiter
  `Evaluation`** (no re-scoring) rendered through the same `feedback_writer`.

### 4.4 The "never mid-funnel" guard (hard rule)

This is a **hard invariant**, enforced in depth so no single layer is the only thing standing between
a live screening and a coaching leak:

1. **Architecturally** — practice has **no application and no funnel state**, so there is *nothing*
   mid-funnel to coach. Practice feedback ≠ application feedback; they are different resources over
   different stores.
2. **For real applications** — the feedback path is **gated on terminal funnel state**. A
   `_feedback_allowed(application_state)` guard returns true only for terminal decision states
   (e.g. `hired`, `rejected`/`gated_out`, post-`assessment_review` decision) and false for every
   in-progress state (`interview_pending`, `interview_in_progress`, `scored`-but-undecided, …). The
   real-application feedback endpoint loads the application's current state (comp-scoped read) and
   returns **`403 feedback not available yet`** for any non-terminal state. The default is **deny**:
   an unknown/forgotten new state is non-terminal until explicitly listed.
3. **Test-locked** — a unit test asserts feedback is refused for every non-terminal state and allowed
   only for terminal ones (parametrized over the `ApplicationState` enum), so adding a new funnel
   state without classifying it fails the gate rather than silently leaking feedback.

> Why this matters: the moment a candidate can see "you're weak on X" *during* the assessment that is
> scoring them, the tool stops being a fair screen and starts being a coached exam. Keeping practice
> off the funnel and gating real-application feedback to *after the decision* preserves screening
> integrity while still giving candidates growth value.

### 4.5 Erasure cascade (Inc 0 entry)

`practice_sessions` holds a candidate's transcripts + evaluations keyed by `user_id` — squarely
identifying data. It **joins the erasure cascade** (architecture overview §6: "the single most
important compliance follow-through"). `CandidateEraser` (admin `resources/compliance.py`) gains a
`practice` repository and a `delete_by_user(user_id)` call alongside the existing
reports/interviews/attempts/consents deletions. Inc 0 is expected to land the erasure-cascade stub;
this design adds the concrete `practice_sessions` purge + a test that `erase(user_id)` removes the
candidate's practice rows. (Redis practice sessions self-expire via TTL; the durable Mongo summaries
are what erasure targets.)

## 5. Interfaces / events

- **New REST (ai-agents):**
  - `POST /practice/start` → body `{topic?: str, jd_text?: str}` (exactly one required) →
    `{practice_id, question}`.
  - `POST /practice/{practice_id}/turn` → body `{answer: str}` → `{done, question}` (same shape as
    `/interview/{id}/turn`).
  - `GET /practice/{practice_id}/feedback` → `{evaluation_summary, feedback: GrowthFeedback}` (only
    after the session is `completed`; `409` if still in progress; `403`/`404` for not-yours/missing).
  - *(real-application feedback)* `GET /application/{application_id}/feedback` → gated on terminal
    funnel state per §4.4 (`403` until terminal).
- **New mcp-data tools:** `save_practice_summary`, `get_practice_summary`, `list_practice_summaries`.
- **Events:** **NONE.** Practice publishes nothing to RabbitMQ; the funnel is untouched. (This is a
  feature, not an omission — it is what keeps practice off the AEDT risk surface.)
- **Unchanged:** the entire real-interview path (`interview.completed` → Evaluator → `scoring.completed`
  → funnel `scored`), the brain modules, the funnel state machine, data ownership/tenancy.

## 6. Key decisions & tradeoffs

- **Reuse the brain, clone the host.** `practice.py` duplicates the ~40-line host *orchestration*
  rather than parameterizing `interview_host` with an "is-practice" flag. Tradeoff: a little
  structural repetition vs. keeping the funnel-critical real path free of practice branches. Chosen
  because mixing a no-`comp_id`/no-publish mode into the audited funnel path is exactly the kind of
  conditional that later leaks an event by accident. The shared *brain* functions (blueprint /
  next_question / evaluator) are imported, not copied — only the thin loop is duplicated.
- **No `publisher` in the practice signature.** Makes "practice never touches the funnel" a
  type-level guarantee, not a discipline.
- **Keyed by `user_id`, no `comp_id`.** Practice is cross-tenant-irrelevant: it belongs to a person,
  not a company. This also means no tenant-isolation surface to get wrong.
- **Topic → synthesized JD.** When the candidate gives only a topic, a tiny prompt synthesizes a
  short JD so `build_blueprint` has something to plan against; a pasted JD is used verbatim. Both are
  fenced as untrusted input.
- **Feedback is a render, not a re-score.** Both practice and post-decision feedback consume an
  existing `Evaluation`; `feedback_writer` adds zero scoring authority. The candidate never sees a
  hire/reject verdict from practice.
- **Hard mid-funnel guard, default-deny.** Real-application feedback is allowed *only* for an
  explicit allowlist of terminal states; unknown states are denied and test-locked.
- **Text-only now, transport-ready.** The loop is built around `next_question`/answer turns, so the
  Pillar C voice/video transports drop in later behind the same loop without reopening this resource.

## 7. Testing approach (fake LLM, offline)

All new logic sits behind the **injected LLM seam** and the existing in-memory fakes, so
`bash scripts/check.sh` stays **offline and green** (baseline **423 tests**; this increment grows it).
Reuse the existing ai-agents `conftest.py` fakes: `fake_llm` / `fake_llm_by_schema` (the practice
finalize calls the LLM twice — `Evaluation` then `GrowthFeedback` — so `fake_llm_by_schema` keys each
by output schema), `fake_data` (extend the in-memory gateway with `save/get/list_practice_summary`),
and a new `fake_practice_sessions` mirroring `fake_sessions`.

- **`test_practice.py`** (resource, fakes only):
  - `start_practice` builds a blueprint + returns a first question; persists a `PracticeSession`
    with **no `comp_id`/`job_id`** and `user_id` set.
  - happy path: N turns drive the loop then finalize → persists a `PracticeSummary` →
    **asserts the (absent) publisher was never called** (no funnel event); `get` returns the summary.
  - ownership: another user's `practice_id` → `ForbiddenError`/`403`.
  - budget exhaustion + `max_questions` both finalize (mirror `test_interview_host.py`).
  - double-submit / replay after `completed` → rejected.
- **`test_feedback_writer.py`** — given a fixed `Evaluation`, `build_feedback` returns `GrowthFeedback`
  with gaps drawn from low-scoring competencies and **no hire/reject verdict** in the output.
- **`test_practice_api.py`** (FastAPI `TestClient`, mirror `interview_api` tests): `200` start/turn for
  the owner; `401` no token; `403` not-yours; `409` feedback-before-complete; `400` neither
  topic-nor-jd.
- **Mid-funnel guard** — parametrized test over `ApplicationState`: real-application feedback is
  refused (`403`) for every non-terminal state and allowed only for terminal ones; default-deny for
  an unclassified state.
- **Erasure** — `CandidateEraser.erase(user_id)` deletes the candidate's `practice_sessions`
  (extend the existing erasure test).
- **Regression** — the real interview path's tests are untouched and stay green (the brain modules and
  funnel are not modified).
- **Frontend** — verified by `npx pnpm@9.15.0 --filter @ip/candidate build` +
  `--filter @ip/{ui,shared,api-client} typecheck`. No `next build` while `pnpm dev` is live.

## 8. Open questions

- **Practice rate limiting / quota.** Practice is unauthenticated-of-`comp_id` but still costs LLM
  calls; do we cap practice sessions per candidate per day? (Proposed: a soft per-user daily cap in
  the resource, configurable; out of scope to *enforce* in Inc 5 but flagged.)
- **History UX.** `list_practice_summaries` enables a "your past practice runs" list — is that in Inc 5
  or a follow-up? (Proposed: persist now, surface a minimal list; rich history later.)
- **Topic taxonomy.** Free-text topic vs. a curated role list for the picker. (Proposed: free-text now,
  synthesized JD; a curated list can reuse marketplace job titles in Inc 1+.)
- **Suggested-topics grounding.** Should `suggested_topics` be KB-grounded (reuse `kb_search`) for
  richer study pointers, or stay model-only to keep practice off any crawl path? (Proposed: model-only
  in Inc 5 — practice deliberately never crawls; KB-grounded study links are a later enhancement.)
- **Post-decision feedback opt-in.** Do recruiters/companies get a toggle to disable showing rejected
  candidates their feedback, or is post-decision feedback always available to the candidate?
  (Proposed: always-available to the candidate post-decision; a company toggle is a config follow-up.)
