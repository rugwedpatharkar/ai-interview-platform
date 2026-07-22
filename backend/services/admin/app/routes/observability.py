"""gRPC ObservabilityService route layer."""

import grpc
from lib.errors import to_grpc_status
from lib.logging import bind_ids, get_logger, log_context
from lib.observability import counter, span

from app.config import get_settings
from app.errors import AuthDomainError
from app.resources import observability as obs_res
from app.routes.auth import _client_ip, caller_identity_optional
from app.routes.pb import observability_pb2, observability_pb2_grpc

log = get_logger(component="observability.routes")

_grpc_total = counter("admin_grpc_requests_total", "gRPC requests received", ["method"])
_grpc_errors = counter(
    "admin_grpc_errors_total",
    "gRPC requests that resulted in a domain error",
    ["method"],
)


class ObservabilityServicer(observability_pb2_grpc.ObservabilityServiceServicer):
    def __init__(
        self,
        *,
        errors_repo,
        events_repo,
        dedup,
        tokens,
        limiter=None,
        trusted_proxy=False,
    ):
        self._errors_repo = errors_repo
        self._events_repo = events_repo
        self._dedup = dedup
        self._tokens = tokens
        self._limiter = limiter
        self._trusted_proxy = trusted_proxy

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

    async def _rate_limit(self, context, method):
        # Per-IP throttle: anon-allowed + up to 100 events * 4 KiB per call, so an
        # untrottled sender can amplify to tens of MB/s of Mongo writes.
        if self._limiter is None:
            return
        ip = _client_ip(context, self._trusted_proxy)
        s = get_settings()
        hit = await self._limiter.hit(f"obs:ip:{ip}", s.obs_limit, s.obs_window_seconds)
        if not hit.allowed:
            _grpc_errors.labels(method=method).inc()
            await context.abort(
                grpc.StatusCode.RESOURCE_EXHAUSTED,
                f"telemetry rate limit exceeded; retry after {hit.retry_after}s",
            )

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
                await self._rate_limit(context, "RecordClientError")
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
                await self._rate_limit(context, "RecordClientEvent")
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
