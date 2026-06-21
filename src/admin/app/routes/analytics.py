"""gRPC AnalyticsService routes — thin adapter over resources/analytics."""

from lib.errors import to_grpc_status
from lib.logging import bind_ids, get_logger, log_context
from lib.observability import counter, span

from app.errors import AuthDomainError
from app.resources import analytics as analytics_res
from app.routes.auth import caller_identity
from app.routes.pb import analytics_pb2, analytics_pb2_grpc

log = get_logger(component="analytics.routes")

_grpc_total = counter("admin_grpc_requests_total", "gRPC requests received", ["method"])
_grpc_errors = counter(
    "admin_grpc_errors_total",
    "gRPC requests that resulted in a domain error",
    ["method"],
)


class AnalyticsServicer(analytics_pb2_grpc.AnalyticsServiceServicer):
    def __init__(self, *, applications, reports, tokens):
        self._applications = applications
        self._reports = reports
        self._tokens = tokens

    async def _abort(self, context, exc, method="unknown"):
        code, msg = to_grpc_status(exc)
        log.warning("analytics.routes.{}: {} code={}", method, exc, code.name)
        _grpc_errors.labels(method=method).inc()
        await context.abort(code, msg)

    async def GetFunnelAnalytics(self, request, context):
        _grpc_total.labels(method="GetFunnelAnalytics").inc()
        async with (
            log_context(log, "analytics.GetFunnelAnalytics"),
            span("analytics.GetFunnelAnalytics"),
        ):
            try:
                identity = await caller_identity(context, self._tokens)
                data = await analytics_res.get_funnel_analytics(
                    identity, applications=self._applications
                )
                return analytics_pb2.FunnelAnalytics(
                    states=[
                        analytics_pb2.StateCount(state=s["state"], count=s["count"])
                        for s in data["states"]
                    ],
                    total=data["total"],
                    conversion_rate=data["conversion_rate"],
                )
            except AuthDomainError as exc:
                await self._abort(context, exc, "GetFunnelAnalytics")

    async def GetNoGhostingKpis(self, request, context):
        _grpc_total.labels(method="GetNoGhostingKpis").inc()
        async with (
            log_context(log, "analytics.GetNoGhostingKpis"),
            span("analytics.GetNoGhostingKpis"),
        ):
            try:
                identity = await caller_identity(context, self._tokens)
                data = await analytics_res.get_no_ghosting_kpis(
                    identity, applications=self._applications
                )
                return analytics_pb2.NoGhostingKpis(
                    pending_review=data["pending_review"],
                    stale_over_sla=data["stale_over_sla"],
                    median_response_hours=data["median_response_hours"],
                    response_rate=data["response_rate"],
                    decided_last_7d=data["decided_last_7d"],
                )
            except AuthDomainError as exc:
                await self._abort(context, exc, "GetNoGhostingKpis")

    async def GetJobScoreDistribution(self, request, context):
        _grpc_total.labels(method="GetJobScoreDistribution").inc()
        async with (
            log_context(
                log,
                "analytics.GetJobScoreDistribution",
                **bind_ids(job_id=request.job_id),
            ),
            span("analytics.GetJobScoreDistribution", job_id=request.job_id),
        ):
            try:
                identity = await caller_identity(context, self._tokens)
                d = await analytics_res.get_job_score_distribution(
                    identity,
                    request.job_id,
                    applications=self._applications,
                    reports=self._reports,
                )
                return analytics_pb2.ScoreDistribution(
                    count=d["count"],
                    min=d["min"],
                    max=d["max"],
                    mean=d["mean"],
                    p25=d["p25"],
                    p50=d["p50"],
                    p75=d["p75"],
                )
            except AuthDomainError as exc:
                await self._abort(context, exc, "GetJobScoreDistribution")
