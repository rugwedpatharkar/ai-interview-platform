"""gRPC DiscoveryService — authed marketplace search over the discovery resource.

Thin adapter: any authenticated user may search; the anonymous/SSR surface is the public
REST /public/jobs, which shares the same resource. No business logic here — request →
resources.discovery.search_jobs → proto response.
"""

from lib.logging import get_logger, log_context
from lib.observability import counter, span

from app.resources import discovery as discovery_res
from app.routes.auth import caller_identity
from app.routes.pb import discovery_pb2, discovery_pb2_grpc

log = get_logger(component="discovery.routes")

_grpc_total = counter("admin_grpc_requests_total", "gRPC requests received", ["method"])


def _bucket(b: dict):
    return discovery_pb2.FacetBucket(value=b["value"], count=b["count"])


def _search_response(r: dict):
    return discovery_pb2.SearchJobsResponse(
        jobs=[discovery_pb2.JobCard(**j) for j in r["jobs"]],
        facets=discovery_pb2.Facets(
            remote_mode=[_bucket(b) for b in r["facets"]["remote_mode"]],
            employment_type=[_bucket(b) for b in r["facets"]["employment_type"]],
            experience_level=[_bucket(b) for b in r["facets"]["experience_level"]],
        ),
        total=r["total"],
        page=r["page"],
        page_size=r["page_size"],
    )


class DiscoveryServicer(discovery_pb2_grpc.DiscoveryServiceServicer):
    def __init__(self, *, jobs, companies, tokens):
        self._jobs = jobs
        self._companies = companies
        self._tokens = tokens

    async def SearchJobs(self, request, context):
        _grpc_total.labels(method="SearchJobs").inc()
        async with (
            log_context(log, "discovery.SearchJobs"),
            span("discovery.SearchJobs"),
        ):
            await caller_identity(context, self._tokens)  # any authenticated user
            result = await discovery_res.search_jobs(
                {
                    "q": request.q,
                    "location": request.location,
                    "remote": request.remote,
                    "type": request.type,
                    "level": request.level,
                    "skills": list(request.skills),
                    "sort": request.sort,
                    "page": request.page,
                    "page_size": request.page_size,
                },
                jobs=self._jobs,
                companies=self._companies,
            )
            return _search_response(result)
