"""Assembles the admin gRPC-web ASGI app: registers every servicer onto a GrpcWebASGI.

Used by app/main.py for serving. The browser reaches this ASGI app directly over
gRPC-web (no proxy) — see lib/grpcweb.py (the shared translator, used by ai-agents
too) and docs/superpowers/plans/DEPLOYMENT.md. Collaborators are injected so the app
can be built against fakes in tests.
"""

from lib.grpcweb import GrpcWebASGI
from lib.redis import RateLimiter
from lib.security import RefreshSessionStore, SingleUseTokenStore

from app.infra.repositories.applications import ApplicationRepository
from app.infra.repositories.aptitude_attempts import AptitudeAttemptRepository
from app.infra.repositories.aptitude_banks import AptitudeBankRepository
from app.infra.repositories.aptitude_deliveries import AptitudeDeliveryRepository
from app.infra.repositories.audit_logs import AuditLogRepository
from app.infra.repositories.companies import CompanyRepository
from app.infra.repositories.consents import ConsentRepository
from app.infra.repositories.interviews import InterviewRepository
from app.infra.repositories.jobs import JobRepository
from app.infra.repositories.match_results import MatchResultRepository
from app.infra.repositories.profiles import CandidateProfileRepository
from app.infra.repositories.reports import ReportRepository
from app.infra.repositories.rubrics import RubricRepository
from app.infra.repositories.users import UserRepository
from app.resources.compliance import CandidateEraser
from app.routes.analytics import AnalyticsServicer
from app.routes.application import ApplicationServicer
from app.routes.aptitude import AptitudeServicer
from app.routes.auth import AuthServicer
from app.routes.compliance import ComplianceServicer
from app.routes.decision import DecisionServicer
from app.routes.job import JobServicer
from app.routes.pb import (
    analytics_pb2_grpc,
    application_pb2_grpc,
    aptitude_pb2_grpc,
    auth_pb2_grpc,
    compliance_pb2_grpc,
    decision_pb2_grpc,
    job_pb2_grpc,
    profile_pb2_grpc,
    recommendation_pb2_grpc,
    report_pb2_grpc,
    rubric_pb2_grpc,
    talent_pb2_grpc,
)
from app.routes.profile import ProfileServicer
from app.routes.recommendation import RecommendationServicer
from app.routes.report import ReportServicer
from app.routes.rubric import RubricServicer
from app.routes.talent import TalentServicer


def make_eraser(db, storage):
    """Build the CandidateEraser (compliance servicer + the retention sweep)."""
    return CandidateEraser(
        users=UserRepository(db),
        profiles=CandidateProfileRepository(db),
        storage=storage,
        audit=AuditLogRepository(db),
        applications=ApplicationRepository(db),
        reports=ReportRepository(db),
        interviews=InterviewRepository(db),
        attempts=AptitudeAttemptRepository(db),
        consents=ConsentRepository(db),
    )


def create_web_app(
    *,
    db,
    redis,
    storage,
    publisher,
    tokens,
    notifier,
    notification_publisher,
    refresh_ttl_seconds,
    allow_origin="*",
    max_message_bytes=4 * 1024 * 1024,
    timeout_seconds=30,
    trusted_proxy=False,
):
    """Build the gRPC-web ASGI app with all admin servicers registered onto it."""
    app = GrpcWebASGI(
        allow_origin=allow_origin,
        max_message_bytes=max_message_bytes,
        timeout_seconds=timeout_seconds,
    )
    auth_pb2_grpc.add_AuthServiceServicer_to_server(
        AuthServicer(
            users=UserRepository(db),
            companies=CompanyRepository(db),
            tokens=tokens,
            sessions=RefreshSessionStore(redis),
            limiter=RateLimiter(redis),
            notifier=notifier,
            refresh_ttl_seconds=refresh_ttl_seconds,
            trusted_proxy=trusted_proxy,
            nonces=SingleUseTokenStore(redis),
            audit=AuditLogRepository(db),
        ),
        app,
    )
    profile_pb2_grpc.add_ProfileServiceServicer_to_server(
        ProfileServicer(
            profiles=CandidateProfileRepository(db),
            storage=storage,
            publisher=publisher,
            tokens=tokens,
        ),
        app,
    )
    job_pb2_grpc.add_JobServiceServicer_to_server(
        JobServicer(jobs=JobRepository(db), publisher=publisher, tokens=tokens),
        app,
    )
    application_pb2_grpc.add_ApplicationServiceServicer_to_server(
        ApplicationServicer(
            applications=ApplicationRepository(db),
            jobs=JobRepository(db),
            publisher=publisher,
            tokens=tokens,
            audit=AuditLogRepository(db),
            notifier=notification_publisher,
        ),
        app,
    )
    decision_pb2_grpc.add_DecisionServiceServicer_to_server(
        DecisionServicer(
            applications=ApplicationRepository(db),
            audit=AuditLogRepository(db),
            tokens=tokens,
            notifier=notification_publisher,
        ),
        app,
    )
    aptitude_pb2_grpc.add_AptitudeServiceServicer_to_server(
        AptitudeServicer(
            applications=ApplicationRepository(db),
            jobs=JobRepository(db),
            banks=AptitudeBankRepository(db),
            attempts=AptitudeAttemptRepository(db),
            deliveries=AptitudeDeliveryRepository(db),
            publisher=publisher,
            tokens=tokens,
        ),
        app,
    )
    report_pb2_grpc.add_ReportServiceServicer_to_server(
        ReportServicer(
            applications=ApplicationRepository(db),
            reports=ReportRepository(db),
            tokens=tokens,
        ),
        app,
    )
    recommendation_pb2_grpc.add_RecommendationServiceServicer_to_server(
        RecommendationServicer(
            jobs=JobRepository(db),
            matches=MatchResultRepository(db),
            tokens=tokens,
        ),
        app,
    )
    analytics_pb2_grpc.add_AnalyticsServiceServicer_to_server(
        AnalyticsServicer(
            applications=ApplicationRepository(db),
            reports=ReportRepository(db),
            tokens=tokens,
        ),
        app,
    )
    rubric_pb2_grpc.add_RubricServiceServicer_to_server(
        RubricServicer(rubrics=RubricRepository(db), tokens=tokens),
        app,
    )
    talent_pb2_grpc.add_TalentServiceServicer_to_server(
        TalentServicer(applications=ApplicationRepository(db), tokens=tokens),
        app,
    )
    compliance_pb2_grpc.add_ComplianceServiceServicer_to_server(
        ComplianceServicer(
            consents=ConsentRepository(db),
            eraser=make_eraser(db, storage),
            tokens=tokens,
        ),
        app,
    )
    return app
