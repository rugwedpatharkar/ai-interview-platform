"""gRPC ComplianceService route layer — a thin adapter over app/resources/compliance."""

from lib.errors import to_grpc_status
from lib.logging import get_logger, log_context
from lib.observability import counter, span

from app.errors import AuthDomainError
from app.resources import compliance as compliance_res
from app.routes.auth import caller_identity
from app.routes.pb import compliance_pb2, compliance_pb2_grpc

log = get_logger(component="compliance.routes")

_grpc_total = counter("admin_grpc_requests_total", "gRPC requests received", ["method"])
_grpc_errors = counter(
    "admin_grpc_errors_total",
    "gRPC requests that resulted in a domain error",
    ["method"],
)


class ComplianceServicer(compliance_pb2_grpc.ComplianceServiceServicer):
    def __init__(self, *, consents, eraser, tokens):
        self._consents = consents
        self._eraser = eraser
        self._tokens = tokens

    async def _abort(self, context, exc, method="unknown"):
        code, msg = to_grpc_status(exc)
        log.warning("compliance.routes.{}: {} code={}", method, exc, code.name)
        _grpc_errors.labels(method=method).inc()
        await context.abort(code, msg)

    async def RecordConsent(self, request, context):
        _grpc_total.labels(method="RecordConsent").inc()
        async with (
            log_context(log, "compliance.RecordConsent"),
            span("compliance.RecordConsent"),
        ):
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
                await self._abort(context, exc, "RecordConsent")

    async def GetMyConsent(self, request, context):
        _grpc_total.labels(method="GetMyConsent").inc()
        async with (
            log_context(log, "compliance.GetMyConsent"),
            span("compliance.GetMyConsent"),
        ):
            try:
                identity = await caller_identity(context, self._tokens)
                items = await compliance_res.list_consent(
                    identity, consents=self._consents
                )
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
                await self._abort(context, exc, "GetMyConsent")

    async def EraseMe(self, request, context):
        _grpc_total.labels(method="EraseMe").inc()
        async with log_context(log, "compliance.EraseMe"), span("compliance.EraseMe"):
            try:
                identity = await caller_identity(context, self._tokens)
                await self._eraser.erase(identity["id"])
                return compliance_pb2.EraseReceipt(user_id=identity["id"], erased=True)
            except AuthDomainError as exc:
                await self._abort(context, exc, "EraseMe")
