"""gRPC SavedJobsService — candidate job bookmarks over resources/saved_jobs.

Candidate-scoped: caller_identity yields the saver from the token; candidate_user_id is
never a request field. Mirrors job.py's caller_identity + _abort shape.
"""

import grpc
from lib.logging import bind_ids, get_logger, log_context
from lib.observability import counter, span

from app.errors import AuthDomainError
from app.resources import saved_jobs as saved_jobs_res
from app.routes.auth import _STATUS, caller_identity
from app.routes.pb import saved_jobs_pb2, saved_jobs_pb2_grpc

log = get_logger(component="saved_jobs.routes")

_grpc_total = counter("admin_grpc_requests_total", "gRPC requests received", ["method"])
_grpc_errors = counter(
    "admin_grpc_errors_total",
    "gRPC requests that resulted in a domain error",
    ["method"],
)


class SavedJobsServicer(saved_jobs_pb2_grpc.SavedJobsServiceServicer):
    def __init__(self, *, saved_jobs, jobs, companies, tokens):
        self._saved_jobs = saved_jobs
        self._jobs = jobs
        self._companies = companies
        self._tokens = tokens

    async def _abort(self, context, exc, method):
        code = _STATUS.get(type(exc), grpc.StatusCode.INTERNAL)
        log.warning("saved_jobs.routes.{}: {} code={}", method, exc, code.name)
        _grpc_errors.labels(method=method).inc()
        await context.abort(code, str(exc))

    async def SaveJob(self, request, context):
        _grpc_total.labels(method="SaveJob").inc()
        ident = await caller_identity(context, self._tokens)
        async with log_context(
            log, "saved_jobs.SaveJob", **bind_ids(job_id=request.job_id)
        ):
            try:
                await saved_jobs_res.save_job(
                    ident["id"],
                    request.job_id,
                    saved_jobs=self._saved_jobs,
                    jobs=self._jobs,
                )
                return saved_jobs_pb2.SaveJobResponse(saved=True)
            except AuthDomainError as exc:
                await self._abort(context, exc, "SaveJob")

    async def UnsaveJob(self, request, context):
        _grpc_total.labels(method="UnsaveJob").inc()
        ident = await caller_identity(context, self._tokens)
        async with log_context(
            log, "saved_jobs.UnsaveJob", **bind_ids(job_id=request.job_id)
        ):
            await saved_jobs_res.unsave_job(
                ident["id"], request.job_id, saved_jobs=self._saved_jobs
            )
            return saved_jobs_pb2.UnsaveJobResponse(saved=False)

    async def ListSavedJobs(self, request, context):
        _grpc_total.labels(method="ListSavedJobs").inc()
        ident = await caller_identity(context, self._tokens)
        async with (
            log_context(log, "saved_jobs.ListSavedJobs"),
            span("saved_jobs.ListSavedJobs"),
        ):
            out = await saved_jobs_res.list_saved_jobs(
                ident["id"],
                saved_jobs=self._saved_jobs,
                jobs=self._jobs,
                companies=self._companies,
            )
            return saved_jobs_pb2.ListSavedJobsResponse(
                jobs=[saved_jobs_pb2.SavedJob(**c) for c in out]
            )
