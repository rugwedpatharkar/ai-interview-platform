"""Wiring smoke test for create_web_app — every servicer registers without drift."""

from unittest.mock import MagicMock

from lib.security import TokenService

from app.routes.web import create_web_app


def test_registers_all_twenty_four_services():
    app = create_web_app(
        db=MagicMock(),
        redis=MagicMock(),
        storage=MagicMock(),
        publisher=MagicMock(),
        tokens=TokenService("s" * 40),
        notifier=MagicMock(),
        notification_publisher=MagicMock(),
        refresh_ttl_seconds=60,
    )
    services = {path.rsplit("/", 1)[0] for path in app.methods}
    assert len(services) == 24
    assert "/admin.auth.v1.AuthService/Login" in app.methods
    assert "/admin.coding.v1.CodingService/SubmitCoding" in app.methods
    assert "/admin.preferences.v1.PreferencesService/GetAppearance" in app.methods
    assert "/admin.scheduling.v1.SchedulingService/ProposeSlots" in app.methods
    assert "/admin.team.v1.TeamService/ListMembers" in app.methods
    assert "/admin.notification.v1.NotificationService/ListNotifications" in app.methods
    assert "/admin.messaging.v1.MessagingService/SendMessage" in app.methods
    assert "/admin.settings.v1.SettingsService/GetNotificationPrefs" in app.methods
    assert "/admin.discovery.v1.DiscoveryService/SearchJobs" in app.methods
    assert "/admin.saved_jobs.v1.SavedJobsService/SaveJob" in app.methods
    assert "/admin.sourcing.v1.SourcingService/SearchCandidates" in app.methods
    assert (
        "/admin.company_profile.v1.CompanyProfileService/GetCompanyProfile"
        in app.methods
    )
    assert "/admin.job_alerts.v1.JobAlertsService/CreateAlert" in app.methods
    assert (
        "/admin.recommendation.v1.RecommendationService/GetCandidateRecommendations"
        in app.methods
    )
    assert "/admin.analytics.v1.AnalyticsService/GetFunnelAnalytics" in app.methods
    assert "/admin.rubric.v1.RubricService/CreateRubric" in app.methods
