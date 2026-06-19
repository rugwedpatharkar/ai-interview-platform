# Task 7 — Voice Interview Orchestrator — Report

## Placement: `run_voice_interview` in `resources/voice/session.py`

**Why `session.py`, not `interview_host.py`:** Task 7 is voice-specific wiring — it connects
the `VoiceTransport` seam to the shared building blocks. Embedding it in `interview_host.py`
would mix voice-specific concerns into the modality-agnostic text path. The clean boundary is:
`interview_host.py` owns the reusable text-first building blocks; `resources/voice/session.py`
owns the voice-specific loop that consumes them.

---

## `interview_host` internals reused (no duplication)

| Internal | Visibility before Task 7 | How reused |
|---|---|---|
| `start_interview` | public | Called directly — seeds the session + delivers the first question (ownership check, blueprint build, Redis save all happen inside it) |
| `_finalize` | private (prefixed `_`) | Imported directly — persists transcript, publishes `interview.completed`, flips status LAST |
| `_budget_exhausted` | private (prefixed `_`) | Imported directly — same time-budget guard as `submit_turn` |
| `_utcnow` | private (prefixed `_`) | Imported as the default clock to match the text path |

**De-privatization:** none required. The private names were imported cross-module
(`from app.resources.interview_host import _finalize, ...`). Python's `_` prefix is a
convention, not enforced access control, and all three are in the same package. The
alternative — copying the logic — would have violated the spec's "do NOT duplicate
scoring/finalization" constraint.

**`submit_turn` not called per turn:** `submit_turn` re-loads the session from Redis on every
call (HTTP model: stateless per request). For the in-process voice loop that already holds the
session in memory, calling `submit_turn` per turn would cause redundant Redis round-trips with
no benefit. Instead the loop replicates only `submit_turn`'s per-turn building-block sequence
(append turn, save, budget check, `next_question`, save again) using the shared helpers.
`_finalize` semantics — save → publish → flip status LAST — are identical.

**`next_question` import:** hoisted to module level via a local import inside the loop in the
initial commit; the final version uses a module-level import consistent with the project style.

---

## Loop design

```
start_interview(...)           # seeds Redis, returns first_question
loop:
    answer = transport.ask(current_question)
    session = sessions.get(application_id)   # reload for reconnect safety
    session.transcript.turns.append(TranscriptTurn(...))
    sessions.save(session)                   # checkpoint each turn
    if not answer: _finalize(...)            # hangup / exhausted re-prompts
    if _budget_exhausted: _finalize(...)     # hard stop
    decision = next_question(...)
    if decision.done: _finalize(...)
    session.current_question = decision.question
    sessions.save(session)
except Exception:
    log.exception(...)  # leaves session in_progress (reaper picks it up)
    raise
```

The session is saved **twice per turn** (once after appending the answer, once after recording
the next question). This is intentional: the first save ensures the turn is durable before the
expensive `next_question` LLM call; the second ensures `current_question` is durable before the
next `transport.ask`.

---

## Tests

File: `src/ai-agents/tests/test_voice_session.py` — 8 tests, all offline (no LiveKit/Groq/network).

| Test | What it verifies |
|---|---|
| `test_happy_path_drives_all_turns_and_finalizes` | 2-answer scripted transport drives 2 turns; `interview.completed` published once; transcript shape correct |
| `test_happy_path_single_turn_interview` | 1-question interview completes cleanly |
| `test_hangup_mid_interview_finalizes_partial_transcript` | `""` after Q1 → partial transcript finalized with one `interview.completed`; both turns recorded |
| `test_hangup_on_first_question_finalizes_empty_transcript` | Immediate hangup → empty-answer turn recorded; finalized once |
| `test_budget_exhaustion_finalizes_and_publishes_completed` | Injected clock jumps past budget after first turn; loop finalizes even if LLM would continue |
| `test_no_double_publish_on_clean_finalize` | `_finalize` called exactly once; no duplicate events |
| `test_engine_failure_leaves_session_in_progress` | `RuntimeError` from transport after turn 1 → session stays `in_progress`; no `interview.completed` emitted |
| `test_transcript_shape_matches_text_path` | Saved document has `transcript.turns[].question/answer`, `blueprint`, `job_id`, `user_id` — identical to text path |

---

## Gate

`bash scripts/check.sh` GREEN — **466 tests** (51 lib + 204 admin + 156 ai-agents + 24 mcp-data +
31 mcp-capability). Baseline was 458; Task 7 adds 8.

---

## Concerns / deferred

- **`_finalize`, `_budget_exhausted`, `_utcnow` are private in `interview_host`** — they are
  cross-module imported by name convention. If the project ever enforces strict access boundaries
  (e.g., via `__all__`), these should be promoted to public or moved to a shared `_interview_core`
  module. For now this is the least-invasive approach that avoids duplication.
- **Double Redis save per turn** — two saves per turn is safe (idempotent) and the per-turn
  checkpoint matters for reconnect/reaper correctness. A single-save optimization is possible
  but not worth the complexity at this stage.
- **`submit_turn` guard skipped** — `submit_turn` rejects a `"completed"` session to prevent
  double-finalization. The voice loop exits on `_finalize` return, so the guard is naturally
  unreachable. If the loop is ever made re-entrant (e.g., reconnect resumes), add the guard.
