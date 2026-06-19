"""Wiring smoke test for create_web_app — every servicer registers without drift."""

from unittest.mock import MagicMock

from lib.security import TokenService

from app.routes.web import create_web_app


def test_registers_all_twelve_services():
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
    assert len(services) == 12
    assert "/admin.auth.v1.AuthService/Login" in app.methods
    assert (
        "/admin.recommendation.v1.RecommendationService/GetCandidateRecommendations"
        in app.methods
    )
    assert "/admin.analytics.v1.AnalyticsService/GetFunnelAnalytics" in app.methods
    assert "/admin.rubric.v1.RubricService/CreateRubric" in app.methods
