"""gRPC AptitudeService route layer — a thin adapter over app/resources/aptitude."""

import grpc
from lib.logging import get_logger

from app.errors import AuthDomainError
from app.resources import aptitude as aptitude_res
from app.routes.auth import _STATUS, caller_identity
from app.routes.pb import aptitude_pb2, aptitude_pb2_grpc

log = get_logger(component="aptitude.routes")


class AptitudeServicer(aptitude_pb2_grpc.AptitudeServiceServicer):
    def __init__(
        self, *, applications, jobs, banks, attempts, deliveries, publisher, tokens
    ):
        self._applications = applications
        self._jobs = jobs
        self._banks = banks
        self._attempts = attempts
        self._deliveries = deliveries
        self._publisher = publisher
        self._tokens = tokens

    async def _abort(self, context, exc):
        await context.abort(_STATUS.get(type(exc), grpc.StatusCode.INTERNAL), str(exc))

    async def GetAptitudeTest(self, request, context):
        try:
            identity = await caller_identity(context, self._tokens)
            test = await aptitude_res.get_aptitude_test(
                identity,
                request.application_id,
                applications=self._applications,
                banks=self._banks,
                deliveries=self._deliveries,
            )
            return aptitude_pb2.AptitudeTest(
                application_id=test["application_id"],
                questions=[
                    aptitude_pb2.AptitudeQuestion(
                        index=q["index"],
                        question=q["question"],
                        options=q["options"],
                        topic=q["topic"],
                    )
                    for q in test["questions"]
                ],
            )
        except AuthDomainError as exc:
            await self._abort(context, exc)

    async def SubmitAptitude(self, request, context):
        try:
            identity = await caller_identity(context, self._tokens)
            result = await aptitude_res.grade_aptitude(
                identity,
                request.application_id,
                list(request.answers),
                applications=self._applications,
                jobs=self._jobs,
                banks=self._banks,
                attempts=self._attempts,
                deliveries=self._deliveries,
                publisher=self._publisher,
            )
            return aptitude_pb2.AptitudeResult(
                application_id=result["application_id"],
                score=result["score"],
                passed=result["passed"],
            )
        except AuthDomainError as exc:
            await self._abort(context, exc)
