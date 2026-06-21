"""gRPC RecommendationService routes — thin adapter over the resource layer."""

from lib.errors import to_grpc_status
from lib.logging import bind_ids, get_logger, log_context
from lib.observability import counter, span

from app.errors import AuthDomainError
from app.resources import recommendations as rec_res
from app.routes.auth import caller_identity
from app.routes.pb import recommendation_pb2, recommendation_pb2_grpc

log = get_logger(component="recommendation.routes")

_grpc_total = counter("admin_grpc_requests_total", "gRPC requests received", ["method"])
_grpc_errors = counter(
    "admin_grpc_errors_total",
    "gRPC requests that resulted in a domain error",
    ["method"],
)


def _to_proto(m):
    return recommendation_pb2.Match(
        job_id=m["job_id"],
        candidate_user_id=m["candidate_user_id"],
        score=m["score"],
        reasons=m["reasons"],
    )


class RecommendationServicer(recommendation_pb2_grpc.RecommendationServiceServicer):
    def __init__(self, *, jobs, matches, tokens):
        self._jobs = jobs
        self._matches = matches
        self._tokens = tokens

    async def _abort(self, context, exc, method="unknown"):
        code, msg = to_grpc_status(exc)
        log.warning("recommendation.routes.{}: {} code={}", method, exc, code.name)
        _grpc_errors.labels(method=method).inc()
        await context.abort(code, msg)

    async def GetCandidateRecommendations(self, request, context):
        _grpc_total.labels(method="GetCandidateRecommendations").inc()
        async with (
            log_context(log, "recommendation.GetCandidateRecommendations"),
            span("recommendation.GetCandidateRecommendations"),
        ):
            try:
                identity = await caller_identity(context, self._tokens)
                result = await rec_res.get_candidate_recommendations(
                    identity,
                    request.page_size,
                    request.page_token,
                    matches=self._matches,
                )
                return recommendation_pb2.MatchList(
                    matches=[_to_proto(m) for m in result["matches"]],
                    next_page_token=result["next_page_token"],
                    total_count=result["total_count"],
                )
            except AuthDomainError as exc:
                await self._abort(context, exc, "GetCandidateRecommendations")

    async def GetJobRankedCandidates(self, request, context):
        _grpc_total.labels(method="GetJobRankedCandidates").inc()
        async with (
            log_context(
                log,
                "recommendation.GetJobRankedCandidates",
                **bind_ids(job_id=request.job_id),
            ),
            span("recommendation.GetJobRankedCandidates", job_id=request.job_id),
        ):
            try:
                identity = await caller_identity(context, self._tokens)
                items = await rec_res.get_job_ranked_candidates(
                    identity, request.job_id, jobs=self._jobs, matches=self._matches
                )
                return recommendation_pb2.MatchList(
                    matches=[_to_proto(m) for m in items]
                )
            except AuthDomainError as exc:
                await self._abort(context, exc, "GetJobRankedCandidates")
