"""gRPC JobAlertsService — candidate saved searches over resources/job_alerts.

Candidate-scoped: caller_identity yields the owner from the token; candidate_user_id is
never a request field. Mirrors saved_jobs.py's caller_identity + _abort shape.
"""

import grpc
from lib.logging import get_logger, log_context
from lib.observability import counter, span

from app.errors import AuthDomainError
from app.resources import job_alerts as alerts_res
from app.routes.auth import _STATUS, caller_identity
from app.routes.pb import job_alerts_pb2, job_alerts_pb2_grpc

log = get_logger(component="job_alerts.routes")

_grpc_total = counter("admin_grpc_requests_total", "gRPC requests received", ["method"])
_grpc_errors = counter(
    "admin_grpc_errors_total",
    "gRPC requests that resulted in a domain error",
    ["method"],
)


def _filters_dict(f):
    return {
        "location": f.location,
        "remote_mode": f.remote_mode,
        "employment_type": f.employment_type,
        "experience_level": f.experience_level,
        "skills": list(f.skills),
    }


def _alert(d):
    f = d["filters"]
    return job_alerts_pb2.JobAlert(
        alert_id=d["alert_id"],
        keyword=d["keyword"],
        filters=job_alerts_pb2.AlertFilters(
            location=f["location"],
            remote_mode=f["remote_mode"],
            employment_type=f["employment_type"],
            experience_level=f["experience_level"],
            skills=f["skills"],
        ),
        frequency=d["frequency"],
        created_at=d["created_at"],
        last_run_at=d["last_run_at"],
    )


class JobAlertsServicer(job_alerts_pb2_grpc.JobAlertsServiceServicer):
    def __init__(self, *, alerts, tokens):
        self._alerts = alerts
        self._tokens = tokens

    async def _abort(self, context, exc, method):
        code = _STATUS.get(type(exc), grpc.StatusCode.INTERNAL)
        log.warning("job_alerts.routes.{}: {} code={}", method, exc, code.name)
        _grpc_errors.labels(method=method).inc()
        await context.abort(code, str(exc))

    async def CreateAlert(self, request, context):
        _grpc_total.labels(method="CreateAlert").inc()
        ident = await caller_identity(context, self._tokens)
        async with (
            log_context(log, "job_alerts.CreateAlert"),
            span("job_alerts.Create"),
        ):
            try:
                out = await alerts_res.create_alert(
                    ident["id"],
                    request.keyword,
                    _filters_dict(request.filters),
                    request.frequency,
                    alerts=self._alerts,
                )
                return _alert(out)
            except AuthDomainError as exc:
                await self._abort(context, exc, "CreateAlert")

    async def ListAlerts(self, request, context):
        _grpc_total.labels(method="ListAlerts").inc()
        ident = await caller_identity(context, self._tokens)
        async with log_context(log, "job_alerts.ListAlerts"), span("job_alerts.List"):
            out = await alerts_res.list_alerts(ident["id"], alerts=self._alerts)
            return job_alerts_pb2.ListAlertsResponse(alerts=[_alert(a) for a in out])

    async def DeleteAlert(self, request, context):
        _grpc_total.labels(method="DeleteAlert").inc()
        ident = await caller_identity(context, self._tokens)
        async with (
            log_context(log, "job_alerts.DeleteAlert"),
            span("job_alerts.Delete"),
        ):
            try:
                await alerts_res.delete_alert(
                    ident["id"], request.alert_id, alerts=self._alerts
                )
                return job_alerts_pb2.DeleteAlertResponse(deleted=True)
            except AuthDomainError as exc:
                await self._abort(context, exc, "DeleteAlert")
