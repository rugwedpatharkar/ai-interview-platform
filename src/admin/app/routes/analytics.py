"""gRPC AnalyticsService routes — thin adapter over resources/analytics."""

import grpc
from lib.logging import get_logger

from app.errors import AuthDomainError
from app.resources import analytics as analytics_res
from app.routes.auth import _STATUS, caller_identity
from app.routes.pb import analytics_pb2, analytics_pb2_grpc

log = get_logger(component="analytics.routes")


class AnalyticsServicer(analytics_pb2_grpc.AnalyticsServiceServicer):
    def __init__(self, *, applications, reports, tokens):
        self._applications = applications
        self._reports = reports
        self._tokens = tokens

    async def _abort(self, context, exc):
        await context.abort(_STATUS.get(type(exc), grpc.StatusCode.INTERNAL), str(exc))

    async def GetFunnelAnalytics(self, request, context):
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
            await self._abort(context, exc)

    async def GetJobScoreDistribution(self, request, context):
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
            await self._abort(context, exc)
