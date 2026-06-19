"""gRPC DecisionService route layer — a thin adapter over app/resources/decision."""

import grpc
from lib.logging import get_logger

from app.errors import AuthDomainError
from app.resources import decision as decision_res
from app.routes.auth import _STATUS, caller_identity
from app.routes.pb import decision_pb2, decision_pb2_grpc

log = get_logger(component="decision.routes")


class DecisionServicer(decision_pb2_grpc.DecisionServiceServicer):
    def __init__(self, *, applications, audit, tokens, notifier=None):
        self._applications = applications
        self._audit = audit
        self._tokens = tokens
        self._notifier = notifier

    async def _abort(self, context, exc):
        await context.abort(_STATUS.get(type(exc), grpc.StatusCode.INTERNAL), str(exc))

    async def DecideApplication(self, request, context):
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
            await self._abort(context, exc)

    async def OverrideGate(self, request, context):
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
            await self._abort(context, exc)
