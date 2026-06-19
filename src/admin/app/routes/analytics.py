"""gRPC AnalyticsService routes — thin adapter over resources/analytics."""

import grpc
from lib.logging import bind_ids, get_logger, log_context
from lib.observability import counter, span

from app.errors import AuthDomainError
from app.resources import analytics as analytics_res
from app.routes.auth import _STATUS, caller_identity
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
        log.warning(
            "analytics.routes.{}: {} code={}",
            method,
            exc,
            _STATUS.get(type(exc), grpc.StatusCode.INTERNAL).name,
        )
        _grpc_errors.labels(method=method).inc()
        await context.abort(_STATUS.get(type(exc), grpc.StatusCode.INTERNAL), str(exc))

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
