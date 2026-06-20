"""gRPC JobService route layer — a thin adapter over app/resources/job."""

import grpc
from lib.logging import bind_ids, get_logger, log_context
from lib.observability import counter, span

from app.errors import AuthDomainError
from app.resources import job as job_res
from app.routes.auth import _STATUS, caller_identity
from app.routes.pb import job_pb2, job_pb2_grpc

log = get_logger(component="job.routes")

_grpc_total = counter("admin_grpc_requests_total", "gRPC requests received", ["method"])
_grpc_errors = counter(
    "admin_grpc_errors_total",
    "gRPC requests that resulted in a domain error",
    ["method"],
)


def _job_response(d):
    return job_pb2.JobResponse(
        job_id=d["job_id"],
        comp_id=d["comp_id"],
        title=d["title"],
        status=d["status"],
        city=d["city"],
        region=d["region"],
        country=d["country"],
        remote_mode=d["remote_mode"],
        employment_type=d["employment_type"],
        salary_min=d["salary_min"],
        salary_max=d["salary_max"],
        salary_currency=d["salary_currency"],
        skills=d["skills"],
        gate_mode=d["gate_mode"],
        posted_at=d["posted_at"],
    )


def _marketplace(request):
    """Optional marketplace fields off a Create/Update request (resource validates)."""
    return {
        "city": request.city,
        "region": request.region,
        "country": request.country,
        "remote_mode": request.remote_mode,
        "employment_type": request.employment_type,
        "salary_min": request.salary_min,
        "salary_max": request.salary_max,
        "salary_currency": request.salary_currency,
        "skills": list(request.skills),
        "gate_mode": request.gate_mode,
    }


class JobServicer(job_pb2_grpc.JobServiceServicer):
    def __init__(self, *, jobs, publisher, tokens):
        self._jobs = jobs
        self._publisher = publisher
        self._tokens = tokens

    async def _abort(self, context, exc, method="unknown"):
        log.warning(
            "job.routes.{}: {} code={}",
            method,
            exc,
            _STATUS.get(type(exc), grpc.StatusCode.INTERNAL).name,
        )
        _grpc_errors.labels(method=method).inc()
        await context.abort(_STATUS.get(type(exc), grpc.StatusCode.INTERNAL), str(exc))

    async def CreateJob(self, request, context):
        _grpc_total.labels(method="CreateJob").inc()
        async with log_context(log, "job.CreateJob"), span("job.CreateJob"):
            try:
                identity = await caller_identity(context, self._tokens)
                out = await job_res.create_job(
                    identity,
                    request.title,
                    request.jd_text,
                    jobs=self._jobs,
                    marketplace=_marketplace(request),
                )
                return _job_response(out)
            except AuthDomainError as exc:
                await self._abort(context, exc, "CreateJob")

    async def UpdateJob(self, request, context):
        _grpc_total.labels(method="UpdateJob").inc()
        async with (
            log_context(log, "job.UpdateJob", **bind_ids(job_id=request.job_id)),
            span("job.UpdateJob", job_id=request.job_id),
        ):
            try:
                identity = await caller_identity(context, self._tokens)
                out = await job_res.update_job(
                    identity,
                    request.job_id,
                    request.title,
                    request.jd_text,
                    jobs=self._jobs,
                    marketplace=_marketplace(request),
                )
                return _job_response(out)
            except AuthDomainError as exc:
                await self._abort(context, exc, "UpdateJob")

    async def GetJob(self, request, context):
        _grpc_total.labels(method="GetJob").inc()
        async with (
            log_context(log, "job.GetJob", **bind_ids(job_id=request.job_id)),
            span("job.GetJob", job_id=request.job_id),
        ):
            try:
                identity = await caller_identity(context, self._tokens)
                out = await job_res.get_job(identity, request.job_id, jobs=self._jobs)
                return _job_response(out)
            except AuthDomainError as exc:
                await self._abort(context, exc, "GetJob")

    async def ListJobs(self, request, context):
        _grpc_total.labels(method="ListJobs").inc()
        async with log_context(log, "job.ListJobs"), span("job.ListJobs"):
            try:
                identity = await caller_identity(context, self._tokens)
                out = await job_res.list_jobs(identity, jobs=self._jobs)
                return job_pb2.ListJobsResponse(jobs=[_job_response(j) for j in out])
            except AuthDomainError as exc:
                await self._abort(context, exc, "ListJobs")

    async def PublishJob(self, request, context):
        _grpc_total.labels(method="PublishJob").inc()
        async with (
            log_context(log, "job.PublishJob", **bind_ids(job_id=request.job_id)),
            span("job.PublishJob", job_id=request.job_id),
        ):
            try:
                identity = await caller_identity(context, self._tokens)
                out = await job_res.publish_job(
                    identity,
                    request.job_id,
                    jobs=self._jobs,
                    publisher=self._publisher,
                )
                return _job_response(out)
            except AuthDomainError as exc:
                await self._abort(context, exc, "PublishJob")

    async def GetPublicJob(self, request, context):
        _grpc_total.labels(method="GetPublicJob").inc()
        async with (
            log_context(log, "job.GetPublicJob", **bind_ids(job_id=request.job_id)),
            span("job.GetPublicJob", job_id=request.job_id),
        ):
            try:
                await caller_identity(context, self._tokens)  # any authenticated user
                out = await job_res.get_public_job(request.job_id, jobs=self._jobs)
                return job_pb2.PublicJob(
                    job_id=out["job_id"], title=out["title"], jd_text=out["jd_text"]
                )
            except AuthDomainError as exc:
                await self._abort(context, exc, "GetPublicJob")
