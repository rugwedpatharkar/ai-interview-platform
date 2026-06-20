"""Record candidate proctoring signals during an interview.

Signals-only: the browser sends typed events (never raw media); we verify the caller owns
the interview, stamp the server-canonical severity (client can't set it), and persist.
MED/LOW flags are advisory (human review). A server-classified HIGH-severity event
auto-terminates the live session (returns terminated=True + the triggering type) — the
client cannot force or dodge this since the input DTO carries no severity field.
"""

from app.errors import ForbiddenError, NotFoundError
from app.model.proctoring import severity_of
from app.resources.interview_host import terminate_for_proctor


async def record_proctoring_events(
    application_id, events, *, caller_user_id, sessions, data, publisher
):
    session = await sessions.get(application_id)
    if session is None:
        raise NotFoundError("interview session not found")
    if session.candidate_user_id != caller_user_id:
        raise ForbiddenError("not your interview")
    docs = [{**e.model_dump(), "severity": severity_of(e.type)} for e in events]
    await data.save_proctoring_events(application_id, session.comp_id, docs)
    high = next((e for e in events if severity_of(e.type) == "high"), None)
    if high is None or session.status != "in_progress":
        return len(docs), False, ""
    await terminate_for_proctor(
        session,
        application_id,
        high.type,
        sessions=sessions,
        data=data,
        publisher=publisher,
    )
    return len(docs), True, high.type
