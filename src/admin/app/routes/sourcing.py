"""gRPC SourcingService routes — thin adapter over resources/sourcing."""

import grpc
from lib.logging import get_logger, log_context
from lib.observability import counter, span

from app.errors import AuthDomainError
from app.resources import sourcing as sourcing_res
from app.routes.auth import _STATUS, caller_identity
from app.routes.pb import sourcing_pb2, sourcing_pb2_grpc

log = get_logger(component="sourcing.routes")

_grpc_total = counter("admin_grpc_requests_total", "gRPC requests received", ["method"])
_grpc_errors = counter(
    "admin_grpc_errors_total",
    "gRPC requests that resulted in a domain error",
    ["method"],
)


def _hit(h):
    return sourcing_pb2.CandidateHit(
        candidate_user_id=h["candidate_user_id"],
        application_count=h["application_count"],
        fit_score=h["fit_score"],
        top_stage=h["top_stage"],
        matched_skills=h["matched_skills"],
    )


class SourcingServicer(sourcing_pb2_grpc.SourcingServiceServicer):
    def __init__(self, *, applications, profiles, tokens):
        self._applications = applications
        self._profiles = profiles
        self._tokens = tokens

    async def _abort(self, context, exc, method="unknown"):
        log.warning(
            "sourcing.routes.{}: {} code={}",
            method,
            exc,
            _STATUS.get(type(exc), grpc.StatusCode.INTERNAL).name,
        )
        _grpc_errors.labels(method=method).inc()
        await context.abort(_STATUS.get(type(exc), grpc.StatusCode.INTERNAL), str(exc))

    async def SearchCandidates(self, request, context):
        _grpc_total.labels(method="SearchCandidates").inc()
        async with (
            log_context(log, "sourcing.SearchCandidates"),
            span("sourcing.SearchCandidates"),
        ):
            try:
                identity = await caller_identity(context, self._tokens)
                out = await sourcing_res.search_candidates(
                    identity,
                    request.query,
                    applications=self._applications,
                    profiles=self._profiles,
                    stage=request.stage,
                    min_score=request.min_score,
                    page=request.page,
                    page_size=request.page_size,
                )
                return sourcing_pb2.SearchCandidatesResponse(
                    hits=[_hit(h) for h in out["hits"]],
                    total=out["total"],
                    page=out["page"],
                    page_size=out["page_size"],
                )
            except AuthDomainError as exc:
                await self._abort(context, exc, "SearchCandidates")
