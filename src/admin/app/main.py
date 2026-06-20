import asyncio
from datetime import UTC, datetime

import uvicorn
from lib.logging import configure_logging, get_logger
from lib.mongodb import MongoManager, ensure_indexes
from lib.observability import init_tracing, start_metrics_server
from lib.rabbitmq import Consumer, Publisher
from lib.redis import RateLimiter, create_redis
from lib.schemas import FunnelEvent
from lib.security import RefreshSessionStore, SingleUseTokenStore, TokenService
from lib.storage import ObjectStorage
from lib.web import CorrelationIdMiddleware

from app.config import get_settings
from app.errors import InvalidTransition, NotFoundError
from app.infra.db import INDEXES
from app.infra.notifier import LoggingNotifier, NotificationRequestPublisher
from app.infra.oauth import HttpOAuthClient
from app.infra.repositories.applications import ApplicationRepository
from app.infra.repositories.aptitude_attempts import AptitudeAttemptRepository
from app.infra.repositories.aptitude_deliveries import AptitudeDeliveryRepository
from app.infra.repositories.audit_logs import AuditLogRepository
from app.infra.repositories.companies import CompanyRepository
from app.infra.repositories.company_profiles import CompanyProfileRepository
from app.infra.repositories.interview_bookings import InterviewBookingRepository
from app.infra.repositories.jobs import JobRepository
from app.infra.repositories.notifications import NotificationRepository
from app.infra.repositories.users import UserRepository
from app.resources import funnel, recommend, scheduler
from app.resources.notification import TransitionNotifier
from app.routes.oauth import create_oauth_app
from app.routes.public_api import create_public_app
from app.routes.web import create_web_app, make_eraser

log = get_logger(component="admin.server")

_FUNNEL_EVENTS = [
    FunnelEvent.application_created,
    FunnelEvent.aptitude_graded,
    FunnelEvent.interview_completed,
    FunnelEvent.scoring_completed,
    FunnelEvent.recruiter_decision,
    # Edge exits (system-driven): deadline expiry + interview abandonment.
    FunnelEvent.application_expired,
    FunnelEvent.interview_abandoned,
]


def _token_service(s):
    return TokenService(
        secret=s.jwt_secret,
        algorithm=s.jwt_algorithm,
        access_minutes=s.access_token_minutes,
        refresh_minutes=s.refresh_token_minutes,
        verification_minutes=s.email_verification_minutes,
    )


def _dispatcher(grpc_app, oauth_app, public_app):
    """Path-prefix ASGI router: /auth/oauth/* → OAuth, /public/* → REST, else gRPC-web.

    gRPC method paths are /admin.*; OAuth lives under /auth/oauth/ and the public
    marketplace under /public/, so the three prefixes never collide.
    """

    async def dispatch(scope, receive, send):
        path = scope.get("path", "")
        if scope["type"] == "http" and path.startswith("/auth/oauth/"):
            await oauth_app(scope, receive, send)
        elif scope["type"] == "http" and path.startswith("/public/"):
            await public_app(scope, receive, send)
        else:
            await grpc_app(scope, receive, send)

    return dispatch


async def serve() -> None:
    s = get_settings()
    configure_logging(s.service_name, s.log_level)
    init_tracing(s.service_name, enabled=s.tracing_enabled)
    await start_metrics_server(s.metrics_port)
    mongo = MongoManager(
        s.mongo_uri, s.mongo_db_name, s.mongo_max_pool_size, s.mongo_min_pool_size
    )
    await mongo.ping()  # fail fast with a clear message if the DB is unreachable
    redis = create_redis(s.redis_url)
    storage = ObjectStorage(
        s.s3_endpoint_url,
        s.s3_region,
        s.s3_access_key_id,
        s.s3_secret_access_key,
        s.s3_bucket,
        s.storage_presign_ttl_seconds,
    )
    await storage.connect()
    publisher = Publisher(s.rabbitmq_url, s.rabbitmq_exchange)
    await publisher.connect()
    await ensure_indexes(mongo.db, INDEXES)

    notifier = LoggingNotifier()
    transition_notifier = TransitionNotifier(
        users=UserRepository(mongo.db), notifier=notifier
    )
    # advance_application's notifier QUEUES notification.requested (retryable consumer);
    # transition_notifier does the real send in the handler. BE-#10.
    notification_publisher = NotificationRequestPublisher(publisher)

    # Browser → gRPC-web (no proxy); the same servicers, registered onto an ASGI app.
    grpc_app = create_web_app(
        db=mongo.db,
        redis=redis,
        storage=storage,
        publisher=publisher,
        tokens=_token_service(s),
        notifier=notifier,
        notification_publisher=notification_publisher,
        refresh_ttl_seconds=s.refresh_token_minutes * 60,
        allow_origin=s.cors_allow_origin,
        max_message_bytes=s.grpc_max_message_bytes,
        timeout_seconds=s.grpc_timeout_seconds,
        trusted_proxy=s.trusted_proxy,
        oauth_providers=s.oauth_providers,
    )
    # SSO rides on the same ASGI app: /auth/* → Starlette OAuth, else → gRPC-web.
    oauth_app = create_oauth_app(
        {
            "oauth_client": HttpOAuthClient(s.oauth_providers),
            "users": UserRepository(mongo.db),
            "tokens": _token_service(s),
            "sessions": RefreshSessionStore(redis),
            "states": SingleUseTokenStore(redis, namespace="oauth_state"),
            "nonces": SingleUseTokenStore(redis, namespace="email_nonce"),
            "redis": redis,
            "limiter": RateLimiter(redis),
            "notifier": notifier,
            "audit": AuditLogRepository(mongo.db),
            "trusted_proxy": s.trusted_proxy,
            "refresh_ttl_seconds": s.refresh_token_minutes * 60,
            "authorize": s.oauth_providers,
            "frontend_redirect": s.oauth_frontend_redirect,
            "allowed_redirects": s.oauth_allowed_redirects,
            "cors_origins": [
                o.strip() for o in s.cors_allow_origin.split(",") if o.strip()
            ],
        }
    )
    # Public marketplace (SSR/SEO): /public/* → unauthenticated REST over the shared
    # discovery resource + jobs/companies repos; per-IP rate-limited.
    public_app = create_public_app(
        {
            "jobs": JobRepository(mongo.db),
            "companies": CompanyRepository(mongo.db),
            "company_profiles": CompanyProfileRepository(mongo.db),
            "applications": ApplicationRepository(mongo.db),
            "storage": storage,  # presigned company-logo GET URLs on the public page
            "limiter": RateLimiter(redis),
            "trusted_proxy": s.trusted_proxy,
            "rate_limit": s.public_search_limit,
            "rate_window": s.public_search_window_seconds,
            "cors_origins": [
                o.strip() for o in s.cors_allow_origin.split(",") if o.strip()
            ],
        }
    )
    # Bind a correlation_id per HTTP request (gRPC-web, OAuth, or public REST) so every
    # handler's logs + any events it publishes are traceable. Phase-4 corr-IDs.
    app = CorrelationIdMiddleware(_dispatcher(grpc_app, oauth_app, public_app))

    # Funnel consumer: advance application state on funnel events (audit-logged).
    funnel_apps = ApplicationRepository(mongo.db)
    funnel_audit = AuditLogRepository(mongo.db)
    funnel_jobs = JobRepository(mongo.db)

    async def on_funnel_event(routing_key, payload):
        if routing_key == "profile.parsed":
            # Do NOT swallow: a failed fan-out must nack->DLX/redeliver, never silently
            # ack. Re-fanning is safe — each match.run is deduped by the unique
            # (job_id, candidate_user_id) index, so redelivery never double-scores.
            await recommend.fan_out_match(
                payload,
                jobs=funnel_jobs,
                publisher=publisher,
                limit=s.recommend_fanout_limit,
            )
            return
        if routing_key == "notification.requested":
            # Decoupled candidate notification (BE-#10): deliver here so a transient
            # send failure is retried by the consumer (→ DLX), never swallowed.
            await transition_notifier.notify(
                {"candidate_user_id": payload["candidate_user_id"]},
                payload["to_state"],
                payload["event"],
            )
            return
        application_id = payload.get("application_id")
        if not application_id:
            log.warning("funnel: {} missing application_id, dropping", routing_key)
            return
        try:
            await funnel.advance_application(
                application_id,
                routing_key,
                payload,
                applications=funnel_apps,
                audit=funnel_audit,
                notifier=notification_publisher,
            )
        except InvalidTransition as exc:
            if funnel.is_retryable_conflict(routing_key):
                # Out-of-order async handoff (e.g. scoring.completed before
                # interview.completed): re-raise so the consumer requeues it (bounded ->
                # DLX) instead of acking it and stranding the application unscored.
                log.warning("funnel: {} out of order, requeueing: {}", routing_key, exc)
                raise
            log.warning("funnel: ignoring illegal transition: {}", exc)
        except NotFoundError:
            log.warning("funnel: application {} not found", application_id)

    consumer = Consumer(s.rabbitmq_url, s.rabbitmq_exchange)
    await consumer.connect()
    await consumer.subscribe(
        "admin.funnel",
        [*_FUNNEL_EVENTS, "profile.parsed", "notification.requested"],
        on_funnel_event,
    )

    # Liveness reapers: purge past-retention candidates + expire abandoned aptitude.
    eraser = make_eraser(mongo.db, storage)
    deliveries = AptitudeDeliveryRepository(mongo.db)
    reconcile_attempts = AptitudeAttemptRepository(mongo.db)
    bookings = InterviewBookingRepository(mongo.db)
    reminder_notifications = NotificationRepository(mongo.db)

    async def run_schedulers():
        while True:
            await asyncio.sleep(s.scheduler_interval_seconds)
            now = datetime.now(UTC)
            try:
                await scheduler.retention_pass(
                    eraser, retention_days=s.retention_days, now=now
                )
                await scheduler.aptitude_expiry_pass(
                    deliveries=deliveries,
                    applications=funnel_apps,
                    publisher=publisher,
                    now=now,
                    max_age_hours=s.aptitude_expiry_hours,
                )
                await scheduler.reminder_sweep(
                    bookings=bookings,
                    notifications=reminder_notifications,
                    now=now,
                )
                # Recover applications stranded by a lost event publish (funnel CAS
                # dedupes the re-emit) — backstop to the per-writer re-emit.
                await scheduler.reconcile_pass(
                    applications=funnel_apps,
                    attempts=reconcile_attempts,
                    publisher=publisher,
                )
            except Exception:
                log.exception("scheduler pass failed")

    scheduler_task = asyncio.create_task(run_schedulers())

    config = uvicorn.Config(
        app,
        host=s.http_host,
        port=s.http_port,
        log_level=s.log_level.lower(),
        lifespan="off",
    )
    server = uvicorn.Server(config)
    log.info("admin-service gRPC-web listening on {}:{}", s.http_host, s.http_port)
    try:
        await server.serve()
    finally:
        scheduler_task.cancel()
        await consumer.close()
        await storage.close()
        await publisher.close()
        await mongo.close()
        await redis.aclose()
        log.info("admin-service stopped")


def main() -> None:
    asyncio.run(serve())


if __name__ == "__main__":
    main()
