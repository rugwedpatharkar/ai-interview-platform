"""gRPC JobService route layer — a thin adapter over app/resources/job."""

import grpc
from lib.logging import get_logger

from app.errors import AuthDomainError
from app.resources import job as job_res
from app.routes.auth import _STATUS, caller_identity
from app.routes.pb import job_pb2, job_pb2_grpc

log = get_logger(component="job.routes")


def _job_response(d):
    return job_pb2.JobResponse(
        job_id=d["job_id"], comp_id=d["comp_id"], title=d["title"], status=d["status"]
    )


class JobServicer(job_pb2_grpc.JobServiceServicer):
    def __init__(self, *, jobs, publisher, tokens):
        self._jobs = jobs
        self._publisher = publisher
        self._tokens = tokens

    async def _abort(self, context, exc):
        await context.abort(_STATUS.get(type(exc), grpc.StatusCode.INTERNAL), str(exc))

    async def CreateJob(self, request, context):
        try:
            identity = await caller_identity(context, self._tokens)
            out = await job_res.create_job(
                identity, request.title, request.jd_text, jobs=self._jobs
            )
            return _job_response(out)
        except AuthDomainError as exc:
            await self._abort(context, exc)

    async def GetJob(self, request, context):
        try:
            identity = await caller_identity(context, self._tokens)
            out = await job_res.get_job(identity, request.job_id, jobs=self._jobs)
            return _job_response(out)
        except AuthDomainError as exc:
            await self._abort(context, exc)

    async def ListJobs(self, request, context):
        try:
            identity = await caller_identity(context, self._tokens)
            out = await job_res.list_jobs(identity, jobs=self._jobs)
            return job_pb2.ListJobsResponse(jobs=[_job_response(j) for j in out])
        except AuthDomainError as exc:
            await self._abort(context, exc)

    async def PublishJob(self, request, context):
        try:
            identity = await caller_identity(context, self._tokens)
            out = await job_res.publish_job(
                identity, request.job_id, jobs=self._jobs, publisher=self._publisher
            )
            return _job_response(out)
        except AuthDomainError as exc:
            await self._abort(context, exc)

    async def GetPublicJob(self, request, context):
        try:
            await caller_identity(context, self._tokens)  # any authenticated user
            out = await job_res.get_public_job(request.job_id, jobs=self._jobs)
            return job_pb2.PublicJob(
                job_id=out["job_id"], title=out["title"], jd_text=out["jd_text"]
            )
        except AuthDomainError as exc:
            await self._abort(context, exc)
