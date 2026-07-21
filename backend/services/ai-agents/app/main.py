import asyncio

import uvicorn
from lib.logging import configure_logging, get_logger
from lib.observability import init_tracing, start_metrics_server
from lib.rabbitmq import Consumer, Publisher
from lib.redis import create_redis
from lib.security import TokenService
from lib.web import CorrelationIdMiddleware

from app.config import get_settings
from app.infra.factory import get_llm, get_scoring_llm
from app.infra.mcp_capability import McpCapability
from app.infra.mcp_data import McpDataGateway
from app.infra.mcp_session import McpSessionManager
from app.infra.practice_sessions import RedisPracticeStore
from app.infra.sessions import RedisInterviewStore
from app.resources.interview_host import abandon_stale
from app.routes.web import create_grpc_app
from app.routes.worker import EVENTS, make_dispatch
from lib import timeouts

log = get_logger(component="ai_agents.server")


def _token_service(s):
    return TokenService(
        secret=s.jwt_secret,
        algorithm=s.jwt_algorithm,
        access_minutes=s.access_token_minutes,
        refresh_minutes=s.refresh_token_minutes,
        verification_minutes=s.email_verification_minutes,
    )


def _dispatcher(grpc_app, health):
    """Route by path prefix: gRPC-web (/aiagents.*) else the liveness probe.

    gRPC-web RPC paths are /<pkg>.<Service>/<Method> with package `aiagents.*`, so the
    prefix is unambiguous; the gRPC app serves its own CORS preflight. ai-agents is now
    fully gRPC (practice moved onto PracticeService) — no REST surface remains.
    """

    async def dispatch(scope, receive, send):
        path = scope.get("path", "") if scope["type"] == "http" else ""
        if path.startswith("/aiagents."):
            await grpc_app(scope, receive, send)
        else:
            await health(scope, receive, send)

    return dispatch


async def _health_app(scope, receive, send):
    """Liveness probe: GET /health -> 200, anything else -> 404."""
    ok = scope["type"] == "http" and scope.get("path") == "/health"
    await send(
        {
            "type": "http.response.start",
            "status": 200 if ok else 404,
            "headers": [(b"content-type", b"text/plain")],
        }
    )
    await send({"type": "http.response.body", "body": b"ok" if ok else b""})


async def serve() -> None:
    s = get_settings()
    configure_logging(s.service_name, s.log_level)
    if s.otlp_endpoint:
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (
            OTLPSpanExporter,
        )

        init_tracing(
            s.service_name,
            exporter=OTLPSpanExporter(endpoint=s.otlp_endpoint, insecure=True),
        )
    else:
        init_tracing(s.service_name, enabled=s.tracing_enabled)
    await start_metrics_server(s.metrics_port)
    redis = create_redis(s.redis_url)
    publisher = Publisher(s.rabbitmq_url, s.rabbitmq_exchange)
    await publisher.connect()
    # Declare the worker queue + bindings BEFORE the (slow, sometimes-flaky) MCP init so
    # the broker holds every matching event from the moment we start — a job.published
    # emitted while MCP is still connecting is never dropped (it's consumed once the
    # handler attaches below).
    consumer = Consumer(s.rabbitmq_url, s.rabbitmq_exchange)
    await consumer.connect()
    await consumer.declare("ai-agents.workers", EVENTS)
    llm = get_llm(s)
    scoring_llm = get_scoring_llm(s)

    # Data + document parsing come from the MCP servers (mcp-data, mcp-capability).
    # McpSessionManager owns the streamablehttp_client lifecycle and self-heals on
    # transport drops — an mcp-data/mcp-capability restart no longer crashes us.
    # `call_timeout_s` prevents a hung MCP server from stalling gRPC RPCs up to the
    # 300 s outer deadline; default is now `timeouts.mcp_call()` (20 s per lib.config).
    data_manager = McpSessionManager(s.mcp_data_url, call_timeout_s=timeouts.mcp_call())
    cap_manager = McpSessionManager(
        s.mcp_capability_url, call_timeout_s=timeouts.mcp_call()
    )
    await data_manager.start()
    await cap_manager.start()
    data = McpDataGateway(data_manager)
    capability = McpCapability(cap_manager)

    dispatch = make_dispatch(
        llm=llm,
        data=data,
        capability=capability,
        publisher=publisher,
        scoring_llm=scoring_llm,
    )
    await consumer.subscribe("ai-agents.workers", EVENTS, dispatch)
    log.info("ai-agents workers subscribed to {}", EVENTS)

    sessions_store = RedisInterviewStore(redis)
    practice_store = RedisPracticeStore(redis)

    async def run_scheduler():
        while True:
            await asyncio.sleep(s.scheduler_interval_seconds)
            try:
                await abandon_stale(
                    sessions=sessions_store, data=data, publisher=publisher
                )
            except Exception:
                log.exception("interview abandon sweep failed")

    scheduler_task = asyncio.create_task(run_scheduler())

    deps = {
        "tokens": _token_service(s),
        "data": data,
        "capability": capability,
        "sessions": sessions_store,
        "practice_sessions": practice_store,
        "publisher": publisher,
        "llm": llm,
        "settings": s,
    }
    # Application traffic is gRPC-web (interview/chat/jd/practice/proctor/rtc) on
    # /aiagents.*, wrapped in CorrelationIdMiddleware so each RPC carries a
    # correlation_id. Everything else is /health. lifespan="off": deps wired here.
    grpc_app = CorrelationIdMiddleware(
        create_grpc_app(
            deps,
            allow_origin=s.cors_allow_origin,
            timeout_seconds=s.grpc_timeout_seconds,
        )
    )
    api = _dispatcher(grpc_app, _health_app)
    config = uvicorn.Config(
        api,
        host=s.http_host,
        port=s.http_port,
        log_level=s.log_level.lower(),
        lifespan="off",
    )
    server = uvicorn.Server(config)
    log.info("ai-agents gRPC-web on {}:{}", s.http_host, s.http_port)
    try:
        await server.serve()
    finally:
        scheduler_task.cancel()
        await consumer.close()
        await publisher.close()
        await redis.aclose()
        await data_manager.aclose()
        await cap_manager.aclose()
        log.info("ai-agents stopped")


def main() -> None:
    asyncio.run(serve())


if __name__ == "__main__":
    main()
