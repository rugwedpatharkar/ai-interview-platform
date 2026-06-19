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
from app.infra.sessions import RedisInterviewStore
from app.resources.interview_host import abandon_stale
from app.routes.interview_api import create_app
from app.routes.web import create_grpc_app
from app.routes.worker import EVENTS, make_dispatch

log = get_logger(component="ai_agents.server")


def _token_service(s):
    return TokenService(
        secret=s.jwt_secret,
        algorithm=s.jwt_algorithm,
        access_minutes=s.access_token_minutes,
        refresh_minutes=s.refresh_token_minutes,
        verification_minutes=s.email_verification_minutes,
    )


def _grpc_rest_dispatcher(grpc_app, rest_app):
    """Route /aiagents.* (gRPC method paths) to the gRPC-web app; all else to REST.

    gRPC-web RPC paths are /<proto package>.<Service>/<Method> and our packages are all
    `aiagents.*`, so the prefix never collides with a REST path (/interview/..., /chat/
    turn, /jd/improve). The gRPC app handles its own CORS preflight for those paths;
    lifespan/other scopes fall through to the FastAPI REST app.
    """

    async def dispatch(scope, receive, send):
        if scope["type"] == "http" and scope.get("path", "").startswith("/aiagents."):
            await grpc_app(scope, receive, send)
        else:
            await rest_app(scope, receive, send)

    return dispatch


async def serve() -> None:
    s = get_settings()
    configure_logging(s.service_name, s.log_level)
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
    data_manager = McpSessionManager(s.mcp_data_url)
    cap_manager = McpSessionManager(s.mcp_capability_url)
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
        "publisher": publisher,
        "llm": llm,
        "settings": s,
        "cors_origins": [
            o.strip() for o in s.cors_allow_origin.split(",") if o.strip()
        ],
    }
    # Application traffic is gRPC-web (interview/chat/jd/proctor/rtc) on /aiagents.*;
    # the REST app stays mounted for endpoints not yet migrated (removed in G6). The
    # gRPC app gets a per-request correlation_id like the REST app does (its own
    # CorrelationIdMiddleware lives inside create_app).
    grpc_app = CorrelationIdMiddleware(
        create_grpc_app(deps, allow_origin=s.cors_allow_origin)
    )
    api = _grpc_rest_dispatcher(grpc_app, create_app(deps))
    config = uvicorn.Config(
        api, host=s.http_host, port=s.http_port, log_level=s.log_level.lower()
    )
    server = uvicorn.Server(config)
    log.info("ai-agents gRPC-web + REST on {}:{}", s.http_host, s.http_port)
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
