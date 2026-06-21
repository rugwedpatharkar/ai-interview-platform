"""gRPC CodingService — thin adapter over resources/coding (candidate-owned)."""

from lib.errors import to_grpc_status
from lib.logging import bind_ids, get_logger, log_context
from lib.observability import counter

from app.errors import AuthDomainError
from app.resources import coding as coding_res
from app.routes.auth import caller_identity
from app.routes.pb import coding_pb2, coding_pb2_grpc

log = get_logger(component="coding.routes")

_grpc_total = counter("admin_grpc_requests_total", "gRPC requests received", ["method"])
_grpc_errors = counter(
    "admin_grpc_errors_total",
    "gRPC requests that resulted in a domain error",
    ["method"],
)


class CodingServicer(coding_pb2_grpc.CodingServiceServicer):
    def __init__(self, *, applications, tasks, attempts, publisher, limiter, tokens):
        self._applications = applications
        self._tasks = tasks
        self._attempts = attempts
        self._publisher = publisher
        self._limiter = limiter
        self._tokens = tokens

    async def _abort(self, context, exc, method):
        code, msg = to_grpc_status(exc)
        log.warning("coding.routes.{}: {} code={}", method, exc, code.name)
        _grpc_errors.labels(method=method).inc()
        await context.abort(code, msg)

    async def GetCodingTask(self, request, context):
        _grpc_total.labels(method="GetCodingTask").inc()
        async with log_context(
            log, "coding.GetTask", **bind_ids(application_id=request.application_id)
        ):
            try:
                identity = await caller_identity(context, self._tokens)
                t = await coding_res.get_coding_task(
                    identity,
                    request.application_id,
                    applications=self._applications,
                    tasks=self._tasks,
                )
                return coding_pb2.CodingTask(
                    application_id=t["application_id"],
                    title=t["title"],
                    prompt=t["prompt"],
                    languages=t["languages"],
                    starter_code=t["starter_code"],
                    sample_cases=[
                        coding_pb2.TestCase(
                            stdin=c["stdin"], expected_stdout=c["expected_stdout"]
                        )
                        for c in t["sample_cases"]
                    ],
                    typed_questions=[
                        coding_pb2.TypedQuestion(id=q["id"], prompt=q["prompt"])
                        for q in t["typed_questions"]
                    ],
                    cpu_seconds=t["cpu_seconds"],
                    wall_seconds=t["wall_seconds"],
                )
            except AuthDomainError as exc:
                await self._abort(context, exc, "GetCodingTask")

    async def RunCode(self, request, context):
        _grpc_total.labels(method="RunCode").inc()
        async with log_context(
            log, "coding.Run", **bind_ids(application_id=request.application_id)
        ):
            try:
                identity = await caller_identity(context, self._tokens)
                r = await coding_res.run_code_attempt(
                    identity,
                    request.application_id,
                    request.language,
                    request.source,
                    request.stdin,
                    applications=self._applications,
                    tasks=self._tasks,
                    limiter=self._limiter,
                )
                return coding_pb2.RunResult(
                    stdout=r["stdout"],
                    stderr=r["stderr"],
                    exit_code=r["exit_code"],
                    time_ms=r["time_ms"],
                    timed_out=r["timed_out"],
                )
            except AuthDomainError as exc:
                await self._abort(context, exc, "RunCode")

    async def SubmitCoding(self, request, context):
        _grpc_total.labels(method="SubmitCoding").inc()
        async with log_context(
            log, "coding.Submit", **bind_ids(application_id=request.application_id)
        ):
            try:
                identity = await caller_identity(context, self._tokens)
                r = await coding_res.submit_coding(
                    identity,
                    request.application_id,
                    request.language,
                    request.source,
                    [{"id": a.id, "answer": a.answer} for a in request.typed_answers],
                    applications=self._applications,
                    tasks=self._tasks,
                    attempts=self._attempts,
                    publisher=self._publisher,
                    limiter=self._limiter,
                )
                return coding_pb2.SubmitResult(
                    passed=r["passed"],
                    cases_passed=r["cases_passed"],
                    cases_total=r["cases_total"],
                    typed_correct=r["typed_correct"],
                    typed_total=r["typed_total"],
                )
            except AuthDomainError as exc:
                await self._abort(context, exc, "SubmitCoding")
