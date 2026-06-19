"""gRPC ComplianceService route layer — a thin adapter over app/resources/compliance."""

import grpc
from lib.logging import get_logger

from app.errors import AuthDomainError
from app.resources import compliance as compliance_res
from app.routes.auth import _STATUS, caller_identity
from app.routes.pb import compliance_pb2, compliance_pb2_grpc

log = get_logger(component="compliance.routes")


class ComplianceServicer(compliance_pb2_grpc.ComplianceServiceServicer):
    def __init__(self, *, consents, eraser, tokens):
        self._consents = consents
        self._eraser = eraser
        self._tokens = tokens

    async def _abort(self, context, exc):
        await context.abort(_STATUS.get(type(exc), grpc.StatusCode.INTERNAL), str(exc))

    async def RecordConsent(self, request, context):
        try:
            identity = await caller_identity(context, self._tokens)
            receipt = await compliance_res.record_consent(
                identity,
                request.scope,
                request.terms_version,
                consents=self._consents,
            )
            return compliance_pb2.ConsentReceipt(
                user_id=receipt["user_id"],
                scope=receipt["scope"],
                terms_version=receipt["terms_version"],
            )
        except AuthDomainError as exc:
            await self._abort(context, exc)

    async def GetMyConsent(self, request, context):
        try:
            identity = await caller_identity(context, self._tokens)
            items = await compliance_res.list_consent(identity, consents=self._consents)
            return compliance_pb2.ConsentList(
                items=[
                    compliance_pb2.ConsentItem(
                        scope=c["scope"],
                        terms_version=c["terms_version"],
                        granted_at=str(c.get("granted_at", "")),
                    )
                    for c in items
                ]
            )
        except AuthDomainError as exc:
            await self._abort(context, exc)

    async def EraseMe(self, request, context):
        try:
            identity = await caller_identity(context, self._tokens)
            await self._eraser.erase(identity["id"])
            return compliance_pb2.EraseReceipt(user_id=identity["id"], erased=True)
        except AuthDomainError as exc:
            await self._abort(context, exc)
