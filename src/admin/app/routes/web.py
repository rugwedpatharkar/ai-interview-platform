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
from app.infra.repositories.coding_attempts import CodingAttemptRepository
from app.infra.repositories.coding_tasks import CodingTaskRepository
from app.infra.repositories.companies import CompanyRepository
from app.infra.repositories.company_profiles import CompanyProfileRepository
from app.infra.repositories.consents import ConsentRepository
from app.infra.repositories.interview_bookings import InterviewBookingRepository
from app.infra.repositories.interview_slots import InterviewSlotsRepository
from app.infra.repositories.interviews import InterviewRepository
from app.infra.repositories.job_alerts import JobAlertsRepository
from app.infra.repositories.jobs import JobRepository
from app.infra.repositories.match_results import MatchResultRepository
from app.infra.repositories.messaging import (
    MessageRepository,
    MessageThreadRepository,
)
from app.infra.repositories.notification_prefs import NotificationPrefsRepository
from app.infra.repositories.notifications import NotificationRepository
from app.infra.repositories.practice_sessions import PracticeSessionRepository
from app.infra.repositories.proctoring_events import ProctorEventsRepository
from app.infra.repositories.profiles import CandidateProfileRepository
from app.infra.repositories.reports import ReportRepository
from app.infra.repositories.rubrics import RubricRepository
from app.infra.repositories.saved_jobs import SavedJobsRepository
from app.infra.repositories.user_preferences import UserPreferencesRepository
from app.infra.repositories.users import UserRepository
from app.infra.totp import FernetSecretBox, PyotpProvider
from app.resources.compliance import CandidateEraser
from app.routes.analytics import AnalyticsServicer
from app.routes.application import ApplicationServicer
from app.routes.aptitude import AptitudeServicer
from app.routes.auth import AuthServicer
from app.routes.coding import CodingServicer
from app.routes.company_profile import CompanyProfileServicer
from app.routes.compliance import ComplianceServicer
from app.routes.decision import DecisionServicer
from app.routes.discovery import DiscoveryServicer
from app.routes.job import JobServicer
from app.routes.job_alerts import JobAlertsServicer
from app.routes.messaging import MessagingServicer
from app.routes.notification import NotificationServicer
from app.routes.pb import (
    analytics_pb2_grpc,
    application_pb2_grpc,
    aptitude_pb2_grpc,
    auth_pb2_grpc,
    coding_pb2_grpc,
    company_profile_pb2_grpc,
    compliance_pb2_grpc,
    decision_pb2_grpc,
    discovery_pb2_grpc,
    job_alerts_pb2_grpc,
    job_pb2_grpc,
    messaging_pb2_grpc,
    notification_pb2_grpc,
    preferences_pb2_grpc,
    profile_pb2_grpc,
    recommendation_pb2_grpc,
    report_pb2_grpc,
    rubric_pb2_grpc,
    saved_jobs_pb2_grpc,
    scheduling_pb2_grpc,
    settings_pb2_grpc,
    sourcing_pb2_grpc,
    talent_pb2_grpc,
    team_pb2_grpc,
)
from app.routes.preferences import PreferencesServicer
from app.routes.profile import ProfileServicer
from app.routes.recommendation import RecommendationServicer
from app.routes.report import ReportServicer
from app.routes.rubric import RubricServicer
from app.routes.saved_jobs import SavedJobsServicer
from app.routes.scheduling import SchedulingServicer
from app.routes.settings import SettingsServicer
from app.routes.sourcing import SourcingServicer
from app.routes.talent import TalentServicer
from app.routes.team import TeamServicer


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
        coding_attempts=CodingAttemptRepository(db),
        consents=ConsentRepository(db),
        notifications=NotificationRepository(db),
        message_threads=MessageThreadRepository(db),
        messages=MessageRepository(db),
        notification_prefs=NotificationPrefsRepository(db),
        practice=PracticeSessionRepository(db),
        slots=InterviewSlotsRepository(db),
        bookings=InterviewBookingRepository(db),
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
    oauth_providers=None,
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
            oauth_providers=oauth_providers,
            totp=PyotpProvider(),
            secretbox=FernetSecretBox(tokens._secret),
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
        JobServicer(
            jobs=JobRepository(db),
            publisher=publisher,
            tokens=tokens,
            companies=CompanyRepository(db),
        ),
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
    coding_pb2_grpc.add_CodingServiceServicer_to_server(
        CodingServicer(
            applications=ApplicationRepository(db),
            tasks=CodingTaskRepository(db),
            attempts=CodingAttemptRepository(db),
            publisher=publisher,
            limiter=RateLimiter(redis),
            tokens=tokens,
        ),
        app,
    )
    report_pb2_grpc.add_ReportServiceServicer_to_server(
        ReportServicer(
            applications=ApplicationRepository(db),
            reports=ReportRepository(db),
            tokens=tokens,
            proctoring_events=ProctorEventsRepository(db),
            interviews=InterviewRepository(db),
            storage=storage,
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
    discovery_pb2_grpc.add_DiscoveryServiceServicer_to_server(
        DiscoveryServicer(
            jobs=JobRepository(db),
            companies=CompanyRepository(db),
            tokens=tokens,
        ),
        app,
    )
    saved_jobs_pb2_grpc.add_SavedJobsServiceServicer_to_server(
        SavedJobsServicer(
            saved_jobs=SavedJobsRepository(db),
            jobs=JobRepository(db),
            companies=CompanyRepository(db),
            tokens=tokens,
        ),
        app,
    )
    sourcing_pb2_grpc.add_SourcingServiceServicer_to_server(
        SourcingServicer(
            applications=ApplicationRepository(db),
            profiles=CandidateProfileRepository(db),
            tokens=tokens,
        ),
        app,
    )
    company_profile_pb2_grpc.add_CompanyProfileServiceServicer_to_server(
        CompanyProfileServicer(
            companies=CompanyRepository(db),
            profiles=CompanyProfileRepository(db),
            jobs=JobRepository(db),
            applications=ApplicationRepository(db),
            tokens=tokens,
            storage=storage,
        ),
        app,
    )
    job_alerts_pb2_grpc.add_JobAlertsServiceServicer_to_server(
        JobAlertsServicer(alerts=JobAlertsRepository(db), tokens=tokens),
        app,
    )
    notification_pb2_grpc.add_NotificationServiceServicer_to_server(
        NotificationServicer(notifications=NotificationRepository(db), tokens=tokens),
        app,
    )
    settings_pb2_grpc.add_SettingsServiceServicer_to_server(
        SettingsServicer(
            prefs=NotificationPrefsRepository(db),
            tokens=tokens,
            users=UserRepository(db),
            totp=PyotpProvider(),
            secretbox=FernetSecretBox(tokens._secret),
            sessions=RefreshSessionStore(redis),
            limiter=RateLimiter(redis),
            nonces=SingleUseTokenStore(redis),
            notifier=notifier,
            audit=AuditLogRepository(db),
        ),
        app,
    )
    preferences_pb2_grpc.add_PreferencesServiceServicer_to_server(
        PreferencesServicer(preferences=UserPreferencesRepository(db), tokens=tokens),
        app,
    )
    messaging_pb2_grpc.add_MessagingServiceServicer_to_server(
        MessagingServicer(
            applications=ApplicationRepository(db),
            threads=MessageThreadRepository(db),
            messages=MessageRepository(db),
            jobs=JobRepository(db),
            companies=CompanyRepository(db),
            tokens=tokens,
            notifications=NotificationRepository(db),
        ),
        app,
    )
    scheduling_pb2_grpc.add_SchedulingServiceServicer_to_server(
        SchedulingServicer(
            applications=ApplicationRepository(db),
            slots=InterviewSlotsRepository(db),
            bookings=InterviewBookingRepository(db),
            tokens=tokens,
            notifications=NotificationRepository(db),
            limiter=RateLimiter(redis),
        ),
        app,
    )
    team_pb2_grpc.add_TeamServiceServicer_to_server(
        TeamServicer(
            users=UserRepository(db),
            audit=AuditLogRepository(db),
            tokens=tokens,
            sessions=RefreshSessionStore(redis),
            notifier=notifier,
            nonces=SingleUseTokenStore(redis),
        ),
        app,
    )
    return app
