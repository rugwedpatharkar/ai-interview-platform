"""gRPC TalentService routes — thin adapter over resources/talent."""

import grpc
from lib.logging import get_logger, log_context
from lib.observability import counter, span

from app.errors import AuthDomainError
from app.resources import talent as talent_res
from app.routes.auth import _STATUS, caller_identity
from app.routes.pb import talent_pb2, talent_pb2_grpc

log = get_logger(component="talent.routes")

_grpc_total = counter("admin_grpc_requests_total", "gRPC requests received", ["method"])
_grpc_errors = counter(
    "admin_grpc_errors_total",
    "gRPC requests that resulted in a domain error",
    ["method"],
)


class TalentServicer(talent_pb2_grpc.TalentServiceServicer):
    def __init__(self, *, applications, tokens):
        self._applications = applications
        self._tokens = tokens

    async def _abort(self, context, exc, method="unknown"):
        log.warning(
            "talent.routes.{}: {} code={}",
            method,
            exc,
            _STATUS.get(type(exc), grpc.StatusCode.INTERNAL).name,
        )
        _grpc_errors.labels(method=method).inc()
        await context.abort(_STATUS.get(type(exc), grpc.StatusCode.INTERNAL), str(exc))

    async def GetTalentPool(self, request, context):
        _grpc_total.labels(method="GetTalentPool").inc()
        async with (
            log_context(log, "talent.GetTalentPool"),
            span("talent.GetTalentPool"),
        ):
            try:
                identity = await caller_identity(context, self._tokens)
                entries = await talent_res.get_talent_pool(
                    identity, applications=self._applications
                )
                return talent_pb2.TalentPool(
                    entries=[
                        talent_pb2.TalentEntry(
                            candidate_user_id=e["candidate_user_id"],
                            application_count=e["application_count"],
                        )
                        for e in entries
                    ]
                )
            except AuthDomainError as exc:
                await self._abort(context, exc, "GetTalentPool")
