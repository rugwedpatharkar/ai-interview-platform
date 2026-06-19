"""gRPC DecisionService route layer — a thin adapter over app/resources/decision."""

import grpc
from lib.logging import bind_ids, get_logger, log_context
from lib.observability import counter, span

from app.errors import AuthDomainError
from app.resources import decision as decision_res
from app.routes.auth import _STATUS, caller_identity
from app.routes.pb import decision_pb2, decision_pb2_grpc

log = get_logger(component="decision.routes")

_grpc_total = counter("admin_grpc_requests_total", "gRPC requests received", ["method"])
_grpc_errors = counter(
    "admin_grpc_errors_total",
    "gRPC requests that resulted in a domain error",
    ["method"],
)


class DecisionServicer(decision_pb2_grpc.DecisionServiceServicer):
    def __init__(self, *, applications, audit, tokens, notifier=None):
        self._applications = applications
        self._audit = audit
        self._tokens = tokens
        self._notifier = notifier

    async def _abort(self, context, exc, method="unknown"):
        log.warning(
            "decision.routes.{}: {} code={}",
            method,
            exc,
            _STATUS.get(type(exc), grpc.StatusCode.INTERNAL).name,
        )
        _grpc_errors.labels(method=method).inc()
        await context.abort(_STATUS.get(type(exc), grpc.StatusCode.INTERNAL), str(exc))

    async def DecideApplication(self, request, context):
        _grpc_total.labels(method="DecideApplication").inc()
        async with (
            log_context(
                log,
                "decision.DecideApplication",
                **bind_ids(application_id=request.application_id),
            ),
            span("decision.DecideApplication", application_id=request.application_id),
        ):
            try:
                identity = await caller_identity(context, self._tokens)
                new = await decision_res.decide_application(
                    identity,
                    request.application_id,
                    request.outcome,
                    applications=self._applications,
                    audit=self._audit,
                    notifier=self._notifier,
                )
                return decision_pb2.DecisionResponse(
                    application_id=request.application_id, state=new
                )
            except AuthDomainError as exc:
                await self._abort(context, exc, "DecideApplication")

    async def OverrideGate(self, request, context):
        _grpc_total.labels(method="OverrideGate").inc()
        async with (
            log_context(
                log,
                "decision.OverrideGate",
                **bind_ids(application_id=request.application_id),
            ),
            span("decision.OverrideGate", application_id=request.application_id),
        ):
            try:
                identity = await caller_identity(context, self._tokens)
                new = await decision_res.override_gate(
                    identity,
                    request.application_id,
                    applications=self._applications,
                    audit=self._audit,
                    notifier=self._notifier,
                )
                return decision_pb2.DecisionResponse(
                    application_id=request.application_id, state=new
                )
            except AuthDomainError as exc:
                await self._abort(context, exc, "OverrideGate")
