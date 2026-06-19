"""gRPC RecommendationService routes — thin adapter over the resource layer."""

import grpc
from lib.logging import get_logger

from app.errors import AuthDomainError
from app.resources import recommendations as rec_res
from app.routes.auth import _STATUS, caller_identity
from app.routes.pb import recommendation_pb2, recommendation_pb2_grpc

log = get_logger(component="recommendation.routes")


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

    async def _abort(self, context, exc):
        await context.abort(_STATUS.get(type(exc), grpc.StatusCode.INTERNAL), str(exc))

    async def GetCandidateRecommendations(self, request, context):
        try:
            identity = await caller_identity(context, self._tokens)
            items = await rec_res.get_candidate_recommendations(
                identity, matches=self._matches
            )
            return recommendation_pb2.MatchList(matches=[_to_proto(m) for m in items])
        except AuthDomainError as exc:
            await self._abort(context, exc)

    async def GetJobRankedCandidates(self, request, context):
        try:
            identity = await caller_identity(context, self._tokens)
            items = await rec_res.get_job_ranked_candidates(
                identity, request.job_id, jobs=self._jobs, matches=self._matches
            )
            return recommendation_pb2.MatchList(matches=[_to_proto(m) for m in items])
        except AuthDomainError as exc:
            await self._abort(context, exc)
