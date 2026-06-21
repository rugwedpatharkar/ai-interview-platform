"""gRPC AptitudeService route layer — a thin adapter over app/resources/aptitude."""

from lib.errors import to_grpc_status
from lib.logging import bind_ids, get_logger, log_context
from lib.observability import counter, span

from app.errors import AuthDomainError
from app.resources import aptitude as aptitude_res
from app.routes.auth import caller_identity
from app.routes.pb import aptitude_pb2, aptitude_pb2_grpc

log = get_logger(component="aptitude.routes")

_grpc_total = counter("admin_grpc_requests_total", "gRPC requests received", ["method"])
_grpc_errors = counter(
    "admin_grpc_errors_total",
    "gRPC requests that resulted in a domain error",
    ["method"],
)


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

    async def _abort(self, context, exc, method="unknown"):
        code, msg = to_grpc_status(exc)
        log.warning("aptitude.routes.{}: {} code={}", method, exc, code.name)
        _grpc_errors.labels(method=method).inc()
        await context.abort(code, msg)

    async def GetAptitudeTest(self, request, context):
        _grpc_total.labels(method="GetAptitudeTest").inc()
        async with (
            log_context(
                log,
                "aptitude.GetAptitudeTest",
                **bind_ids(application_id=request.application_id),
            ),
            span("aptitude.GetAptitudeTest", application_id=request.application_id),
        ):
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
                await self._abort(context, exc, "GetAptitudeTest")

    async def SubmitAptitude(self, request, context):
        _grpc_total.labels(method="SubmitAptitude").inc()
        async with (
            log_context(
                log,
                "aptitude.SubmitAptitude",
                **bind_ids(application_id=request.application_id),
            ),
            span("aptitude.SubmitAptitude", application_id=request.application_id),
        ):
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
                await self._abort(context, exc, "SubmitAptitude")
