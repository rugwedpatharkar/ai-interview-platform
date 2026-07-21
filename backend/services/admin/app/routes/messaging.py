"""gRPC MessagingService — candidate <-> recruiter chat over resources/messaging.

Authed; caller_identity drives both authz (candidate-owner / recruiter-tenant) and the
sender identity. Mirrors decision.py's _abort shape.
"""

from lib.errors import to_grpc_status
from lib.logging import bind_ids, get_logger, log_context
from lib.observability import counter, span

from app.errors import AuthDomainError
from app.resources import messaging as msg_res
from app.routes.auth import caller_identity
from app.routes.pb import messaging_pb2, messaging_pb2_grpc

log = get_logger(component="messaging.routes")

_grpc_total = counter("admin_grpc_requests_total", "gRPC requests received", ["method"])
_grpc_errors = counter(
    "admin_grpc_errors_total",
    "gRPC requests that resulted in a domain error",
    ["method"],
)


def _message(d):
    return messaging_pb2.MessageDTO(
        id=d["id"],
        application_id=d["application_id"],
        sender_role=d["sender_role"],
        sender_user_id=d["sender_user_id"],
        body=d["body"],
        created_at=d["created_at"],
        read_at=d["read_at"],
    )


def _thread(d):
    return messaging_pb2.ThreadDTO(
        application_id=d["application_id"],
        candidate_user_id=d["candidate_user_id"],
        recruiter_user_id=d["recruiter_user_id"],
        job_title=d["job_title"],
        company_name=d["company_name"],
        last_message_at=d["last_message_at"],
        last_snippet=d["last_snippet"],
        unread=d["unread"],
    )


class MessagingServicer(messaging_pb2_grpc.MessagingServiceServicer):
    def __init__(
        self,
        *,
        applications,
        threads,
        messages,
        jobs,
        companies,
        tokens,
        notifications=None,
        redis=None,
        users=None,
    ):
        self._deps = {
            "applications": applications,
            "threads": threads,
            "messages": messages,
            "jobs": jobs,
            "companies": companies,
            "notifications": notifications,
        }
        self._tokens = tokens
        # Separate `users` handle for send_message only — the other messaging
        # resources don't need it and would trip over the kwarg via **self._deps.
        self._users = users
        # Redis is only consumed by send_message + stream_messages (pub/sub) — kept
        # off _deps because other resources here (list_messages, mark_read, etc.)
        # would trip over the extra kwarg via **self._deps.
        self._redis = redis
        # RateLimiter also for send_message only; keep off _deps for the same reason.
        from lib.redis import RateLimiter

        self._limiter = RateLimiter(redis) if redis is not None else None

    async def _abort(self, context, exc, method):
        code, msg = to_grpc_status(exc)
        log.warning("messaging.routes.{}: {} code={}", method, exc, code.name)
        _grpc_errors.labels(method=method).inc()
        await context.abort(code, msg)

    async def SendMessage(self, request, context):
        _grpc_total.labels(method="SendMessage").inc()
        ident = await caller_identity(context, self._tokens)
        async with log_context(
            log,
            "messaging.SendMessage",
            **bind_ids(application_id=request.application_id),
        ):
            try:
                out = await msg_res.send_message(
                    ident,
                    request.application_id,
                    request.body,
                    **self._deps,
                    redis=self._redis,
                    limiter=self._limiter,
                    users=self._users,
                )
                return _message(out)
            except AuthDomainError as exc:
                await self._abort(context, exc, "SendMessage")

    async def ListThreads(self, request, context):
        _grpc_total.labels(method="ListThreads").inc()
        ident = await caller_identity(context, self._tokens)
        async with log_context(log, "messaging.ListThreads"), span("messaging.List"):
            try:
                out = await msg_res.list_threads(
                    ident, page=request.page, page_size=request.page_size, **self._deps
                )
                return messaging_pb2.ListThreadsResponse(
                    threads=[_thread(t) for t in out["threads"]],
                    page=out["page"],
                    page_size=out["page_size"],
                    total=out["total"],
                )
            except AuthDomainError as exc:
                await self._abort(context, exc, "ListThreads")

    async def ListMessages(self, request, context):
        _grpc_total.labels(method="ListMessages").inc()
        ident = await caller_identity(context, self._tokens)
        async with log_context(
            log,
            "messaging.ListMessages",
            **bind_ids(application_id=request.application_id),
        ):
            try:
                out = await msg_res.list_messages(
                    ident,
                    request.application_id,
                    page=request.page,
                    page_size=request.page_size,
                    **self._deps,
                )
                return messaging_pb2.ListMessagesResponse(
                    messages=[_message(m) for m in out["messages"]],
                    page=out["page"],
                    page_size=out["page_size"],
                    total=out["total"],
                )
            except AuthDomainError as exc:
                await self._abort(context, exc, "ListMessages")

    async def MarkRead(self, request, context):
        _grpc_total.labels(method="MarkRead").inc()
        ident = await caller_identity(context, self._tokens)
        async with log_context(
            log, "messaging.MarkRead", **bind_ids(application_id=request.application_id)
        ):
            try:
                out = await msg_res.mark_read(
                    ident, request.application_id, **self._deps
                )
                return messaging_pb2.MarkReadResponse(
                    application_id=out["application_id"], unread=out["unread"]
                )
            except AuthDomainError as exc:
                await self._abort(context, exc, "MarkRead")

    async def StreamMessages(self, request, context):
        _grpc_total.labels(method="StreamMessages").inc()
        ident = await caller_identity(context, self._tokens)
        async with (
            log_context(
                log,
                "messaging.StreamMessages",
                **bind_ids(application_id=request.application_id),
            ),
            span("messaging.StreamMessages", application_id=request.application_id),
        ):
            try:
                async for msg in msg_res.stream_messages(
                    request.application_id,
                    request.since_id,
                    identity=ident,
                    applications=self._deps["applications"],
                    messages=self._deps["messages"],
                    redis=self._redis,
                ):
                    yield _message(msg)
            except AuthDomainError as exc:
                await self._abort(context, exc, "StreamMessages")
