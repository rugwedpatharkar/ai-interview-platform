"""gRPC PracticeService — candidate self-serve mock interview (detached, token-scoped).

Thin adapter over resources/practice; replaces the former /practice REST surface so
ai-agents is all-gRPC. NO comp_id / job_id / application_id — practice never reaches the
funnel. The boundary validations the REST routes did (exactly-one source, empty/over-
sized answer) move here unchanged.
"""

import grpc
from lib.logging import bind_ids, get_logger, log_context

from app.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.resources.practice import (
    get_practice_feedback,
    list_practice_sessions,
    start_practice,
    submit_practice_turn,
)
from app.routes.grpc_common import abort_domain, caller_user_id
from app.routes.pb import practice_pb2, practice_pb2_grpc

log = get_logger(component="route.practice_grpc")

_MAX_ANSWER_CHARS = 32_000


class PracticeServicer(practice_pb2_grpc.PracticeServiceServicer):
    def __init__(self, *, tokens, data, sessions, llm, settings=None, limiter=None):
        self._tokens = tokens
        self._data = data
        self._sessions = sessions
        self._llm = llm
        self._settings = settings
        self._limiter = limiter

    async def _rate_limit(self, context, user_id):
        if self._limiter is None or self._settings is None:
            return
        hit = await self._limiter.hit(
            f"llm:user:{user_id}",
            self._settings.llm_user_limit,
            self._settings.llm_user_window_seconds,
        )
        if not hit.allowed:
            await context.abort(
                grpc.StatusCode.RESOURCE_EXHAUSTED,
                f"llm rate limit exceeded; retry after {hit.retry_after}s",
            )

    async def StartPractice(self, request, context):
        user_id = await caller_user_id(context, self._tokens)
        async with log_context(log, "grpc.practice.start", **bind_ids(user_id=user_id)):
            try:
                practice_id, question = await start_practice(
                    topic=request.topic or None,
                    jd_text=request.jd_text or None,
                    caller_user_id=user_id,
                    data=self._data,
                    sessions=self._sessions,
                    llm=self._llm,
                )
                return practice_pb2.QuestionResponse(
                    practice_id=practice_id, question=question
                )
            except ValidationError as exc:
                await abort_domain(context, exc)

    async def SubmitPracticeTurn(self, request, context):
        user_id = await caller_user_id(context, self._tokens)
        await self._rate_limit(context, user_id)
        answer = request.answer
        if not answer.strip():
            await context.abort(
                grpc.StatusCode.INVALID_ARGUMENT, "answer cannot be empty"
            )
        if len(answer) > _MAX_ANSWER_CHARS:
            await context.abort(grpc.StatusCode.INVALID_ARGUMENT, "answer too long")
        if "\x00" in answer:
            await context.abort(
                grpc.StatusCode.INVALID_ARGUMENT, "answer contains invalid characters"
            )
        async with log_context(log, "grpc.practice.turn", **bind_ids(user_id=user_id)):
            try:
                decision = await submit_practice_turn(
                    request.practice_id,
                    answer,
                    caller_user_id=user_id,
                    sessions=self._sessions,
                    data=self._data,
                    llm=self._llm,
                )
                return practice_pb2.TurnResponse(
                    done=decision.done, question=decision.question or ""
                )
            except (NotFoundError, ForbiddenError, ConflictError) as exc:
                await abort_domain(context, exc)

    async def ListPracticeSessions(self, request, context):
        user_id = await caller_user_id(context, self._tokens)
        rows = await list_practice_sessions(caller_user_id=user_id, data=self._data)
        return practice_pb2.PracticeSessionList(
            sessions=[
                practice_pb2.PracticeSession(
                    practice_id=r["practice_id"],
                    role_label=r["role_label"],
                    created_at=r["created_at"],
                )
                for r in rows
            ]
        )

    async def GetPracticeFeedback(self, request, context):
        user_id = await caller_user_id(context, self._tokens)
        async with log_context(
            log, "grpc.practice.feedback", **bind_ids(user_id=user_id)
        ):
            try:
                summary = await get_practice_feedback(
                    request.practice_id,
                    caller_user_id=user_id,
                    data=self._data,
                    sessions=self._sessions,
                )
            except (NotFoundError, ConflictError) as exc:
                await abort_domain(context, exc)
                return None
            fb = summary.get("feedback") or {}
            return practice_pb2.PracticeFeedback(
                evaluation_summary=summary.get("evaluation_summary", ""),
                feedback=practice_pb2.GrowthFeedback(
                    summary=fb.get("summary", ""),
                    strengths=fb.get("strengths", []),
                    gaps=fb.get("gaps", []),
                    suggested_topics=fb.get("suggested_topics", []),
                ),
            )
