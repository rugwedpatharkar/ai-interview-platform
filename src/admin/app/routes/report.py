"""gRPC ReportService route layer — a thin adapter over app/resources/report."""

import grpc
from lib.logging import bind_ids, get_logger, log_context
from lib.observability import counter, span

from app.errors import AuthDomainError
from app.resources import report as report_res
from app.routes.auth import _STATUS, caller_identity
from app.routes.pb import report_pb2, report_pb2_grpc

log = get_logger(component="report.routes")

_grpc_total = counter("admin_grpc_requests_total", "gRPC requests received", ["method"])
_grpc_errors = counter(
    "admin_grpc_errors_total",
    "gRPC requests that resulted in a domain error",
    ["method"],
)


def _to_proto(r):
    return report_pb2.InterviewReport(
        application_id=r["application_id"],
        candidate_user_id=r["candidate_user_id"],
        state=r["state"],
        executive_summary=r["executive_summary"],
        highlights=r["highlights"],
        risks=r["risks"],
        overall_score=r["overall_score"],
        recommendation=r["recommendation"],
    )


class ReportServicer(report_pb2_grpc.ReportServiceServicer):
    def __init__(self, *, applications, reports, tokens):
        self._applications = applications
        self._reports = reports
        self._tokens = tokens

    async def _abort(self, context, exc, method="unknown"):
        log.warning(
            "report.routes.{}: {} code={}",
            method,
            exc,
            _STATUS.get(type(exc), grpc.StatusCode.INTERNAL).name,
        )
        _grpc_errors.labels(method=method).inc()
        await context.abort(_STATUS.get(type(exc), grpc.StatusCode.INTERNAL), str(exc))

    async def GetReport(self, request, context):
        _grpc_total.labels(method="GetReport").inc()
        async with (
            log_context(
                log,
                "report.GetReport",
                **bind_ids(application_id=request.application_id),
            ),
            span("report.GetReport", application_id=request.application_id),
        ):
            try:
                identity = await caller_identity(context, self._tokens)
                report = await report_res.get_report(
                    identity,
                    request.application_id,
                    applications=self._applications,
                    reports=self._reports,
                )
                return _to_proto(report)
            except AuthDomainError as exc:
                await self._abort(context, exc, "GetReport")

    async def ListReports(self, request, context):
        _grpc_total.labels(method="ListReports").inc()
        async with (
            log_context(log, "report.ListReports", **bind_ids(job_id=request.job_id)),
            span("report.ListReports", job_id=request.job_id),
        ):
            try:
                identity = await caller_identity(context, self._tokens)
                items = await report_res.list_reports(
                    identity,
                    request.job_id,
                    applications=self._applications,
                    reports=self._reports,
                )
                return report_pb2.ReportList(reports=[_to_proto(r) for r in items])
            except AuthDomainError as exc:
                await self._abort(context, exc, "ListReports")

    async def ExportReports(self, request, context):
        _grpc_total.labels(method="ExportReports").inc()
        async with (
            log_context(log, "report.ExportReports", **bind_ids(job_id=request.job_id)),
            span("report.ExportReports", job_id=request.job_id),
        ):
            try:
                identity = await caller_identity(context, self._tokens)
                content = await report_res.export_reports(
                    identity,
                    request.job_id,
                    applications=self._applications,
                    reports=self._reports,
                )
                return report_pb2.ReportExport(
                    filename=f"reports_{request.job_id}.xlsx", content=content
                )
            except AuthDomainError as exc:
                await self._abort(context, exc, "ExportReports")
