"""Interview host: orchestrates the live interview using Blueprint + Interviewer.

`start_interview` builds the plan and asks the first question; `submit_turn` records the
answer and either asks the next question or finalizes — persisting the transcript and
emitting interview.completed for the funnel + the Evaluator. Session state lives in the
injected store (Redis); the agents stay stateless.
"""

from datetime import UTC, datetime

from lib.logging import get_logger

from app.errors import ConflictError, ForbiddenError, NotFoundError
from app.model.interview import (
    InterviewSession,
    InterviewTurnDecision,
    Transcript,
    TranscriptTurn,
)
from app.model.profile import CandidateProfile
from app.resources.blueprint import build_blueprint
from app.resources.interviewer import next_question

log = get_logger(component="resource.interview_host")


def _utcnow():
    return datetime.now(UTC)


def _budget_exhausted(session, clock):
    """True once wall-clock since start reaches the blueprint's time budget."""
    if not session.started_at:
        return False
    elapsed = (clock() - datetime.fromisoformat(session.started_at)).total_seconds()
    return elapsed >= session.blueprint.time_budget_min * 60


async def _finalize(session, application_id, *, sessions, data, publisher):
    """Close the interview: persist the transcript + emit interview.completed."""
    await data.save_interview(
        application_id,
        {
            "transcript": session.transcript.model_dump(),
            "blueprint": session.blueprint.model_dump(),
            "job_id": session.job_id,
            "user_id": session.candidate_user_id,
        },
    )
    await publisher.publish(
        "interview.completed",
        {"application_id": application_id, "comp_id": session.comp_id},
    )
    # Flip status LAST (mirrors abandon_stale): if the save or publish above fails, the
    # session stays in-progress and the candidate's next /turn retries finalization —
    # save_interview is an idempotent upsert and interview.completed is deduped
    # downstream, so a retry never strands the interview completed-but-unscored.
    session.status = "completed"
    session.current_question = ""
    await sessions.save(session)
    log.info("interview completed for {}", application_id)
    return InterviewTurnDecision(done=True)


async def abandon_stale(*, sessions, data, publisher, clock=_utcnow):
    """Finalize in-progress interviews past their time budget as abandoned.

    A candidate who stops answering fires no `/turn`, so the per-turn budget check never
    runs; this sweep persists the partial transcript and emits interview.abandoned.
    """
    abandoned = 0
    for session in await sessions.list_in_progress():
        if not _budget_exhausted(session, clock):
            continue
        await data.save_interview(
            session.application_id,
            {
                "transcript": session.transcript.model_dump(),
                "blueprint": session.blueprint.model_dump(),
                "job_id": session.job_id,
                "user_id": session.candidate_user_id,
            },
        )
        await publisher.publish(
            "interview.abandoned",
            {"application_id": session.application_id, "comp_id": session.comp_id},
        )
        # Flip status LAST: if the save or publish above fails, the session stays
        # in-progress and the next sweep re-picks it (no silently lost abandonment).
        session.status = "abandoned"
        await sessions.save(session)
        abandoned += 1
    if abandoned:
        log.info("abandoned {} stale interviews", abandoned)
    return abandoned


async def start_interview(
    application_id, *, caller_user_id, data, sessions, llm, clock=_utcnow
):
    setup = await data.get_interview_setup(application_id)
    if setup is None:
        raise NotFoundError("interview setup not found")
    if setup["candidate_user_id"] != caller_user_id:
        raise ForbiddenError("not your interview")
    # Gate on funnel state — only runnable once aptitude is passed (defense-in-depth
    # against an early/replayed start; the FE only exposes it when state ==
    # interview_pending). BE-#5.
    if setup.get("state") != "interview_pending":
        raise ConflictError(
            f"interview not startable in state {setup.get('state', '')!r}"
        )
    profile = CandidateProfile(**setup["profile"])
    blueprint = await build_blueprint(
        setup["jd_text"], profile, llm=llm, question_plan=setup.get("question_plan")
    )
    decision = await next_question(blueprint, Transcript(), llm=llm)
    session = InterviewSession(
        application_id=application_id,
        comp_id=setup["comp_id"],
        job_id=setup["job_id"],
        candidate_user_id=setup["candidate_user_id"],
        blueprint=blueprint,
        current_question=decision.question,
        started_at=clock().isoformat(),
    )
    await sessions.save(session)
    log.info("interview started for {}", application_id)
    return decision.question


async def submit_turn(
    application_id,
    answer,
    *,
    caller_user_id,
    sessions,
    data,
    publisher,
    llm,
    clock=_utcnow,
):
    session = await sessions.get(application_id)
    if session is None:
        raise NotFoundError("interview session not found")
    if session.candidate_user_id != caller_user_id:
        raise ForbiddenError("not your interview")
    if session.status != "in_progress":
        # A completed session lingers in Redis until TTL; reject double-submits and
        # replays so we never append turns or re-finalize (re-emitting the event).
        raise ForbiddenError("interview already completed")
    session.transcript.turns.append(
        TranscriptTurn(question=session.current_question, answer=answer)
    )
    # Hard stop on the time budget regardless of what the interviewer would ask next.
    if _budget_exhausted(session, clock):
        log.info("interview time budget reached for {}", application_id)
        return await _finalize(
            session, application_id, sessions=sessions, data=data, publisher=publisher
        )
    decision = await next_question(session.blueprint, session.transcript, llm=llm)
    if decision.done:
        return await _finalize(
            session, application_id, sessions=sessions, data=data, publisher=publisher
        )
    session.current_question = decision.question
    await sessions.save(session)
    return decision
