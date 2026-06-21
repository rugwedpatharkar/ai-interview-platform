"""gRPC ObservabilityService route layer."""

from lib.errors import to_grpc_status
from lib.logging import bind_ids, get_logger, log_context
from lib.observability import counter, span

from app.errors import AuthDomainError
from app.resources import observability as obs_res
from app.routes.auth import caller_identity_optional
from app.routes.pb import observability_pb2, observability_pb2_grpc

log = get_logger(component="observability.routes")

_grpc_total = counter("admin_grpc_requests_total", "gRPC requests received", ["method"])
_grpc_errors = counter(
    "admin_grpc_errors_total",
    "gRPC requests that resulted in a domain error",
    ["method"],
)


class ObservabilityServicer(observability_pb2_grpc.ObservabilityServiceServicer):
    def __init__(self, *, errors_repo, events_repo, dedup, tokens):
        self._errors_repo = errors_repo
        self._events_repo = events_repo
        self._dedup = dedup
        self._tokens = tokens

    async def _abort(self, context, exc, method="unknown"):
        code, msg = to_grpc_status(exc)
        log.warning(
            "observability.routes.{}: {} code={}",
            method,
            exc,
            code.name,
        )
        _grpc_errors.labels(method=method).inc()
        await context.abort(code, msg)

    async def RecordClientError(self, request, context):
        _grpc_total.labels(method="RecordClientError").inc()
        async with (
            log_context(
                log,
                "observability.RecordClientError",
                **bind_ids(),
            ),
            span("observability.RecordClientError"),
        ):
            try:
                identity = await caller_identity_optional(context, self._tokens)
                accepted = await obs_res.record_client_error(
                    list(request.events),
                    errors_repo=self._errors_repo,
                    dedup=self._dedup,
                    identity=identity,
                )
                return observability_pb2.RecordClientErrorResponse(
                    accepted_event_ids=accepted
                )
            except AuthDomainError as exc:
                await self._abort(context, exc, "RecordClientError")

    async def RecordClientEvent(self, request, context):
        _grpc_total.labels(method="RecordClientEvent").inc()
        async with (
            log_context(
                log,
                "observability.RecordClientEvent",
                **bind_ids(),
            ),
            span("observability.RecordClientEvent"),
        ):
            try:
                identity = await caller_identity_optional(context, self._tokens)
                accepted = await obs_res.record_client_event(
                    list(request.events),
                    events_repo=self._events_repo,
                    dedup=self._dedup,
                    identity=identity,
                )
                return observability_pb2.RecordClientEventResponse(
                    accepted_event_ids=accepted
                )
            except AuthDomainError as exc:
                await self._abort(context, exc, "RecordClientEvent")
