"""gRPC InterviewService — candidate live-interview turns, proctoring, RTC token.

Thin adapter over app/resources (interview_host, proctoring, voice.rtc_token): the
caller is authenticated from access-token metadata, request/response messages map to
the resource calls, and app.errors map to gRPC status via grpc_common. Ownership and
funnel-state checks stay in the resources. Replaces the old interview_api REST routes;
the boundary validations the routes did (empty/oversized answer, event cap, unknown
proctor type) move here unchanged.
"""

import json

import grpc
from lib.logging import bind_ids, get_logger, log_context
from pydantic import ValidationError

from app.errors import ConflictError, ForbiddenError, NotFoundError
from app.model.proctoring import ProctoringEvent
from app.resources.interview_host import start_interview, submit_turn
from app.resources.proctoring import record_proctoring_events
from app.resources.voice.rtc_token import mint_join_token
from app.routes.grpc_common import abort_domain, caller_user_id
from app.routes.pb import interview_pb2, interview_pb2_grpc

log = get_logger(component="route.interview_grpc")

_MAX_ANSWER_CHARS = 32_000


def _proctor_event(e):
    """Typed ProctoringEvent from a proto event (severity is assigned server-side).

    Pydantic validates `type` against the catalog Literal, so a spoofed/unknown type
    raises ValidationError; a malformed meta_json raises ValueError. The servicer maps
    both to INVALID_ARGUMENT.
    """
    meta = json.loads(e.meta_json) if e.meta_json else None
    return ProctoringEvent(type=e.type, at=e.at, meta=meta)


class InterviewServicer(interview_pb2_grpc.InterviewServiceServicer):
    def __init__(self, *, tokens, data, sessions, publisher, llm, settings):
        self._tokens = tokens
        self._data = data
        self._sessions = sessions
        self._publisher = publisher
        self._llm = llm
        self._settings = settings

    async def StartInterview(self, request, context):
        user_id = await caller_user_id(context, self._tokens)
        async with log_context(
            log,
            "grpc.interview.start",
            **bind_ids(application_id=request.application_id, user_id=user_id),
        ):
            try:
                question = await start_interview(
                    request.application_id,
                    caller_user_id=user_id,
                    data=self._data,
                    sessions=self._sessions,
                    llm=self._llm,
                )
                return interview_pb2.QuestionResponse(question=question)
            except (NotFoundError, ForbiddenError, ConflictError) as exc:
                await abort_domain(context, exc)

    async def SubmitTurn(self, request, context):
        user_id = await caller_user_id(context, self._tokens)
        answer = request.answer
        if not answer.strip():
            await context.abort(
                grpc.StatusCode.INVALID_ARGUMENT, "answer cannot be empty"
            )
        if len(answer) > _MAX_ANSWER_CHARS:
            await context.abort(grpc.StatusCode.INVALID_ARGUMENT, "answer too long")
        async with log_context(
            log,
            "grpc.interview.turn",
            **bind_ids(application_id=request.application_id, user_id=user_id),
        ):
            try:
                decision = await submit_turn(
                    request.application_id,
                    answer,
                    caller_user_id=user_id,
                    sessions=self._sessions,
                    data=self._data,
                    publisher=self._publisher,
                    llm=self._llm,
                )
                return interview_pb2.TurnResponse(
                    done=decision.done, question=decision.question or ""
                )
            except (NotFoundError, ForbiddenError) as exc:
                await abort_domain(context, exc)

    async def RecordProctorEvents(self, request, context):
        user_id = await caller_user_id(context, self._tokens)
        if len(request.events) > self._settings.max_proctor_events:
            await context.abort(grpc.StatusCode.INVALID_ARGUMENT, "too many events")
        try:
            events = [_proctor_event(e) for e in request.events]
        except (ValidationError, ValueError) as exc:
            await context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(exc))
        async with log_context(
            log,
            "grpc.interview.proctor",
            **bind_ids(application_id=request.application_id, user_id=user_id),
        ):
            try:
                accepted = await record_proctoring_events(
                    request.application_id,
                    events,
                    caller_user_id=user_id,
                    sessions=self._sessions,
                    data=self._data,
                )
                return interview_pb2.ProctorAccepted(accepted=accepted)
            except (NotFoundError, ForbiddenError) as exc:
                await abort_domain(context, exc)

    async def RtcToken(self, request, context):
        user_id = await caller_user_id(context, self._tokens)
        session = await self._sessions.get(request.application_id)
        if session is None:
            await context.abort(
                grpc.StatusCode.NOT_FOUND, "interview session not found"
            )
        if session.candidate_user_id != user_id:
            await context.abort(grpc.StatusCode.PERMISSION_DENIED, "not your interview")
        s = self._settings
        if not (s.livekit_api_key and s.livekit_api_secret):
            await context.abort(
                grpc.StatusCode.FAILED_PRECONDITION, "voice interview not configured"
            )
        room = f"interview-{request.application_id}"
        try:
            token = mint_join_token(
                room,
                user_id,
                api_key=s.livekit_api_key,
                api_secret=s.livekit_api_secret,
                ttl_seconds=s.voice_rtc_token_ttl_seconds,
            )
        except Exception:
            log.exception("rtc-token: mint failed for {}", request.application_id)
            await context.abort(
                grpc.StatusCode.FAILED_PRECONDITION, "voice interview not configured"
            )
        return interview_pb2.RtcTokenResponse(
            url=s.livekit_url or "", token=token, room=room
        )
