"""Voice interview orchestrator — drives the existing loop over a VoiceTransport.

Architecture note: this lives in resources/voice/ (not interview_host.py) because
it is the voice-specific wiring layer. It reuses shared building blocks from
interview_host rather than duplicating them, keeping the brain (blueprint/scoring/
finalization) in one place:

  - start_interview  → seeds the session + delivers the first question
  - _finalize        → persists transcript + publishes interview.completed
  - _budget_exhausted → time-budget check (same logic as the text path)
  - _utcnow          → injectable clock (same as the text path)

The transcript shape is identical to the text path so the unchanged scoring path
works.

Failure contract: a transport or engine error inside the loop is caught, logged,
and the session is left in Redis with status "in_progress" so the abandon-stale
reaper can finalize it later. The error is re-raised so the caller (voice_worker)
knows to disconnect the room.
"""

from lib.logging import get_logger, new_correlation_id, set_correlation_id

from app.model.interview import TranscriptTurn
from app.resources.interview_host import (
    _budget_exhausted,
    _finalize,
    _utcnow,
    start_interview,
)

log = get_logger(component="voice.session")


async def run_voice_interview(
    application_id,
    *,
    transport,
    caller_user_id,
    data,
    sessions,
    llm,
    publisher,
    clock=_utcnow,
):
    """Drive a full spoken interview over a VoiceTransport.

    Reuses start_interview to seed the session and get the first question,
    then loops: ask via transport → record turn → budget/done check → finalize.

    On transport/engine failure the session stays in_progress in Redis (resumable
    by the reaper). The exception propagates so the caller can close the room.

    Args:
        application_id: the application being interviewed.
        transport: a VoiceTransport (or any Transport-compatible object).
        caller_user_id: ownership check forwarded to start_interview.
        data: data gateway (same as text path).
        sessions: Redis session store (same as text path).
        llm: LLM gateway (same as text path).
        publisher: event publisher (same as text path).
        clock: injectable clock for time-budget checks (defaults to utcnow).
    """
    # One correlation_id for the whole spoken interview — binds every log line and the
    # events it publishes (interview.completed, …) to this session. Phase-4 corr-IDs.
    set_correlation_id(new_correlation_id())
    # Step 1 — seed session + first question (ownership check lives here).
    first_question = await start_interview(
        application_id,
        caller_user_id=caller_user_id,
        data=data,
        sessions=sessions,
        llm=llm,
        clock=clock,
    )

    try:
        current_question = first_question
        while True:
            # Speak question; get transcribed answer (or "" on hangup).
            answer = await transport.ask(current_question)

            # Load session each turn so a reconnect/reaper sees fresh state.
            session = await sessions.get(application_id)

            # Record the turn — identical shape to submit_turn.
            session.transcript.turns.append(
                TranscriptTurn(question=current_question, answer=answer)
            )
            await sessions.save(session)

            # Hangup: transport returned "" — finalize the partial transcript.
            if not answer:
                log.info(
                    "voice: hangup/exhausted answer for {}; finalizing",
                    application_id,
                )
                await _finalize(
                    session,
                    application_id,
                    sessions=sessions,
                    data=data,
                    publisher=publisher,
                )
                return

            # Hard stop on the time budget (same guard as submit_turn).
            if _budget_exhausted(session, clock):
                log.info(
                    "voice: time budget reached for {}; finalizing", application_id
                )
                await _finalize(
                    session,
                    application_id,
                    sessions=sessions,
                    data=data,
                    publisher=publisher,
                )
                return

            # Ask the brain for the next question.
            from app.resources.interviewer import next_question

            decision = await next_question(
                session.blueprint, session.transcript, llm=llm
            )
            if decision.done:
                await _finalize(
                    session,
                    application_id,
                    sessions=sessions,
                    data=data,
                    publisher=publisher,
                )
                return

            current_question = decision.question
            session.current_question = decision.question
            await sessions.save(session)

    except Exception:
        # Leave session in_progress so the abandon-stale reaper can finalize it.
        # Exception propagates so the caller (voice_worker) disconnects the room.
        log.exception(
            "voice: session {} failed; leaving resumable in Redis", application_id
        )
        raise
