"""Practice host: a candidate self-serve mock interview, fully detached from the funnel.

Reuses the live interview brain unchanged (``build_blueprint`` -> ``next_question`` ->
``evaluate_interview``) but holds **no publisher** — emitting a funnel event is
impossible by type. There is no comp_id / job_id / application_id in any signature: a
practice run is keyed by practice_id (in-flight, Redis) and by user_id (the finalized
summary, Mongo).
Finalize runs the Evaluator + the feedback writer inline and persists a private
PracticeSummary; the candidate never sees a hire/reject verdict or score.
"""

from datetime import UTC, datetime
from uuid import uuid4

from lib.logging import get_logger
from pydantic import BaseModel

from app.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.model.interview import InterviewTurnDecision, Transcript, TranscriptTurn
from app.model.practice import PracticeSession, PracticeSummary
from app.model.profile import CandidateProfile
from app.resources._prompt_safety import UNTRUSTED_NOTICE, fence
from app.resources.blueprint import build_blueprint
from app.resources.evaluator import evaluate_interview
from app.resources.feedback_writer import build_feedback
from app.resources.interviewer import next_question

log = get_logger(component="resource.practice")


def _utcnow():
    return datetime.now(UTC)


def _budget_exhausted(session, clock):
    """True once wall-clock since start reaches the blueprint's time budget."""
    if not session.started_at:
        return False
    elapsed = (clock() - datetime.fromisoformat(session.started_at)).total_seconds()
    return elapsed >= session.blueprint.time_budget_min * 60


class _SynthJD(BaseModel):
    jd_text: str = ""


def _topic_to_jd_prompt(topic):
    return (
        "Write a focused 4-6 sentence job description for the role or topic below, "
        "suitable for planning a technical interview. Cover the core responsibilities "
        "and the key skills a strong candidate needs.\n\n"
        f"{UNTRUSTED_NOTICE}\n\n"
        f"Topic: {fence('topic', topic)}"
    )


async def _synthesize_jd(topic, *, llm):
    """Synthesize a JD from a bare topic so the blueprint has something to plan."""
    synth = await llm.structured(_topic_to_jd_prompt(topic), _SynthJD)
    return synth.jd_text.strip() or topic


def _evaluation_summary(session):
    """A neutral, deterministic recap — no score / verdict (the detached guarantee)."""
    n = len(session.transcript.turns)
    competencies = ", ".join(c.name for c in session.blueprint.competencies)
    base = f"Practiced {session.role_label} across {n} question{'s' if n != 1 else ''}"
    return f"{base}, covering {competencies}." if competencies else f"{base}."


async def _finalize(session, *, sessions, data, llm):
    """Close the practice: evaluate, phrase growth feedback, persist the summary.

    No publisher parameter exists — practice never emits a funnel event.
    """
    evaluation = await evaluate_interview(
        session.transcript,
        [c.name for c in session.blueprint.competencies],
        session.jd_text,
        llm=llm,
    )
    feedback = await build_feedback(evaluation, llm=llm)
    summary = PracticeSummary(
        practice_id=session.practice_id,
        user_id=session.user_id,
        role_label=session.role_label,
        created_at=session.created_at,
        evaluation_summary=_evaluation_summary(session),
        feedback=feedback,
    )
    await data.save_practice_summary(session.user_id, summary.model_dump())
    # Flip status LAST: a failed save leaves the run in_progress so the next /turn
    # retries finalization (save_practice_summary is an idempotent upsert).
    session.status = "completed"
    session.current_question = ""
    await sessions.save(session)
    log.info("practice finalized for {}", session.user_id)
    return InterviewTurnDecision(done=True)


async def start_practice(
    *, topic, jd_text, caller_user_id, data, sessions, llm, clock=_utcnow
):
    topic = (topic or "").strip()
    jd_text = (jd_text or "").strip()
    if bool(topic) == bool(jd_text):
        raise ValidationError("provide exactly one of topic or jd_text")
    role_label = topic or "Pasted job description"
    if topic:
        jd_text = await _synthesize_jd(topic, llm=llm)
    raw = await data.get_profile(caller_user_id)
    profile = CandidateProfile(**raw) if raw else CandidateProfile()
    # No question_plan — practice never crawls the KB (the hot path can't ground).
    blueprint = await build_blueprint(jd_text, profile, llm=llm)
    decision = await next_question(blueprint, Transcript(), llm=llm)
    now = clock().isoformat()
    session = PracticeSession(
        practice_id=str(uuid4()),
        user_id=caller_user_id,
        role_label=role_label,
        jd_text=jd_text,
        blueprint=blueprint,
        current_question=decision.question,
        started_at=now,
        created_at=now,
    )
    await sessions.save(session)
    log.info("practice started for {}", caller_user_id)
    return session.practice_id, decision.question


async def submit_practice_turn(
    practice_id, answer, *, caller_user_id, sessions, data, llm, clock=_utcnow
):
    session = await sessions.get(practice_id)
    if session is None:
        raise NotFoundError("practice session not found")
    if session.user_id != caller_user_id:
        raise ForbiddenError("not your practice session")
    if session.status != "in_progress":
        raise ConflictError("practice session already completed")
    session.transcript.turns.append(
        TranscriptTurn(question=session.current_question, answer=answer)
    )
    if _budget_exhausted(session, clock):
        return await _finalize(session, sessions=sessions, data=data, llm=llm)
    decision = await next_question(session.blueprint, session.transcript, llm=llm)
    if decision.done:
        return await _finalize(session, sessions=sessions, data=data, llm=llm)
    session.current_question = decision.question
    await sessions.save(session)
    return decision


async def get_practice_feedback(practice_id, *, caller_user_id, data, sessions):
    summary = await data.get_practice_summary(caller_user_id, practice_id)
    if summary is not None:
        return summary
    # No summary yet. The owner-scoped lookup already 404s another user's run (no
    # existence leak); a still-in-progress own run is 409 so the UI polls.
    session = await sessions.get(practice_id)
    if (
        session is not None
        and session.user_id == caller_user_id
        and session.status == "in_progress"
    ):
        raise ConflictError("practice still finalizing")
    raise NotFoundError("practice feedback not found")


async def list_practice_sessions(*, caller_user_id, data):
    rows = await data.list_practice_summaries(caller_user_id)
    return [
        {
            "practice_id": r["practice_id"],
            "role_label": r.get("role_label", ""),
            "created_at": r.get("created_at", ""),
        }
        for r in rows
    ]
