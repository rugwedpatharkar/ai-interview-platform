"""gRPC ReportService route layer — a thin adapter over app/resources/report."""

from lib.errors import to_grpc_status
from lib.logging import bind_ids, get_logger, log_context
from lib.observability import counter, span

from app.errors import AuthDomainError
from app.resources import integrity as integrity_res
from app.resources import report as report_res
from app.routes.auth import caller_identity
from app.routes.pb import report_pb2, report_pb2_grpc

log = get_logger(component="report.routes")

_grpc_total = counter("admin_grpc_requests_total", "gRPC requests received", ["method"])
_grpc_errors = counter(
    "admin_grpc_errors_total",
    "gRPC requests that resulted in a domain error",
    ["method"],
)


def _competency_proto(c):
    return report_pb2.CompetencyScore(
        competency=c.get("competency", ""),
        score=c.get("score", 0.0),
        rationale=c.get("rationale", ""),
        evidence=[
            report_pb2.Evidence(
                quote=e.get("quote", ""), turn_index=e.get("turn_index", 0)
            )
            for e in c.get("evidence", [])
        ],
    )


def _to_proto(r):
    integrity = r.get("integrity")
    return report_pb2.InterviewReport(
        application_id=r["application_id"],
        candidate_user_id=r["candidate_user_id"],
        state=r["state"],
        executive_summary=r["executive_summary"],
        highlights=r["highlights"],
        risks=r["risks"],
        overall_score=r["overall_score"],
        recommendation=r["recommendation"],
        competency_scores=[
            _competency_proto(c) for c in r.get("competency_scores", [])
        ],
        integrity=report_pb2.IntegritySummary(
            score=integrity["score"],
            flags=integrity["flags"],
            auto_terminated=integrity["auto_terminated"],
        )
        if integrity
        else None,
    )


_SEVERITY_MAP = {
    "low": report_pb2.FLAG_SEVERITY_LOW,
    "med": report_pb2.FLAG_SEVERITY_MED,
    "medium": report_pb2.FLAG_SEVERITY_MED,
    "high": report_pb2.FLAG_SEVERITY_HIGH,
    "critical": report_pb2.FLAG_SEVERITY_CRITICAL,
}


def _timeline_proto(t):
    return report_pb2.IntegrityTimeline(
        integrity_score=t["integrity_score"],
        flags=[
            report_pb2.ProctorFlag(
                type=f["type"],
                severity=_SEVERITY_MAP.get(
                    f["severity"].lower(), report_pb2.FLAG_SEVERITY_UNSPECIFIED
                ),
                at=f["at"],
                meta=f["meta"],
            )
            for f in t["flags"]
        ],
        recording_url=t["recording_url"],
        auto_terminated=t["auto_terminated"],
        terminated_reason=t["terminated_reason"],
    )


class ReportServicer(report_pb2_grpc.ReportServiceServicer):
    def __init__(
        self,
        *,
        applications,
        reports,
        tokens,
        proctoring_events=None,
        interviews=None,
        storage=None,
    ):
        self._applications = applications
        self._reports = reports
        self._tokens = tokens
        self._proctoring_events = proctoring_events
        self._interviews = interviews
        self._storage = storage

    async def _abort(self, context, exc, method="unknown"):
        code, msg = to_grpc_status(exc)
        log.warning("report.routes.{}: {} code={}", method, exc, code.name)
        _grpc_errors.labels(method=method).inc()
        await context.abort(code, msg)

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

    async def GetIntegrityTimeline(self, request, context):
        _grpc_total.labels(method="GetIntegrityTimeline").inc()
        async with (
            log_context(
                log,
                "report.GetIntegrityTimeline",
                **bind_ids(application_id=request.application_id),
            ),
            span("report.GetIntegrityTimeline", application_id=request.application_id),
        ):
            try:
                identity = await caller_identity(context, self._tokens)
                timeline = await integrity_res.get_integrity_timeline(
                    identity,
                    request.application_id,
                    applications=self._applications,
                    proctoring_events=self._proctoring_events,
                    interviews=self._interviews,
                    storage=self._storage,
                )
                return _timeline_proto(timeline)
            except AuthDomainError as exc:
                await self._abort(context, exc, "GetIntegrityTimeline")
