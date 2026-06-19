"""gRPC ApplicationService route layer — thin adapter over app/resources/application."""

import grpc
from lib.logging import get_logger

from app.errors import AuthDomainError
from app.resources import application as application_res
from app.routes.auth import _STATUS, caller_identity
from app.routes.pb import application_pb2, application_pb2_grpc

log = get_logger(component="application.routes")


def _application_response(d):
    return application_pb2.ApplicationResponse(
        application_id=d["application_id"],
        job_id=d["job_id"],
        candidate_user_id=d["candidate_user_id"],
        state=d["state"],
    )


class ApplicationServicer(application_pb2_grpc.ApplicationServiceServicer):
    def __init__(self, *, applications, jobs, publisher, tokens, audit, notifier=None):
        self._applications = applications
        self._jobs = jobs
        self._publisher = publisher
        self._tokens = tokens
        self._audit = audit
        self._notifier = notifier

    async def _abort(self, context, exc):
        await context.abort(_STATUS.get(type(exc), grpc.StatusCode.INTERNAL), str(exc))

    async def Apply(self, request, context):
        try:
            identity = await caller_identity(context, self._tokens)
            out = await application_res.apply(
                identity,
                request.job_id,
                request.consent,
                applications=self._applications,
                jobs=self._jobs,
                publisher=self._publisher,
            )
            return _application_response(out)
        except AuthDomainError as exc:
            await self._abort(context, exc)

    async def ListMyApplications(self, request, context):
        try:
            identity = await caller_identity(context, self._tokens)
            out = await application_res.list_my_applications(
                identity, applications=self._applications
            )
            return application_pb2.ApplicationList(
                applications=[_application_response(a) for a in out]
            )
        except AuthDomainError as exc:
            await self._abort(context, exc)

    async def ListApplicants(self, request, context):
        try:
            identity = await caller_identity(context, self._tokens)
            out = await application_res.list_applicants(
                identity, request.job_id, applications=self._applications
            )
            return application_pb2.ApplicationList(
                applications=[_application_response(a) for a in out]
            )
        except AuthDomainError as exc:
            await self._abort(context, exc)

    async def WithdrawApplication(self, request, context):
        try:
            identity = await caller_identity(context, self._tokens)
            out = await application_res.withdraw_application(
                identity,
                request.application_id,
                applications=self._applications,
                audit=self._audit,
                notifier=self._notifier,
            )
            return _application_response(out)
        except AuthDomainError as exc:
            await self._abort(context, exc)
