"""Record candidate proctoring signals during an interview.

Advisory + signals-only: the browser sends typed events (never raw media); we verify the
caller owns the interview, stamp the server-canonical severity (client can't set it),
and persist. This never blocks the interview — flags are for human review only.
"""

from app.errors import ForbiddenError, NotFoundError
from app.model.proctoring import severity_of


async def record_proctoring_events(
    application_id, events, *, caller_user_id, sessions, data
):
    session = await sessions.get(application_id)
    if session is None:
        raise NotFoundError("interview session not found")
    if session.candidate_user_id != caller_user_id:
        raise ForbiddenError("not your interview")
    docs = [{**e.model_dump(), "severity": severity_of(e.type)} for e in events]
    await data.save_proctoring_events(application_id, session.comp_id, docs)
    return len(docs)
