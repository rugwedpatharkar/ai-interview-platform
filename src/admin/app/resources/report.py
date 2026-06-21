"""Recruiter-facing interview reports (read-only).

The AI funnel (ai-agents) writes the InterviewReport to the `reports` collection keyed
by application_id; this surfaces it to recruiters, scoped to their company via the
application — the source of truth for comp_id, funnel state, and the candidate.
Manager-only.
"""

import io

from lib.logging import bind_ids, get_logger, log_context
from lib.schemas import Role
from openpyxl import Workbook

from app.errors import ForbiddenError, NotFoundError

log = get_logger(component="report.resources")

_MANAGER_ROLES = {Role.company_admin.value, Role.recruiter.value}


def _require_manager(identity):
    if identity["role"] not in _MANAGER_ROLES:
        raise ForbiddenError("Only company users can read reports")


def _enrich(application_id, application, report):
    return {
        "application_id": application_id,
        "candidate_user_id": application["candidate_user_id"],
        "state": application["state"],
        "executive_summary": report.get("executive_summary", ""),
        "highlights": report.get("highlights", []),
        "risks": report.get("risks", []),
        # Per-competency breakdown + evidence and the integrity snapshot are written by
        # the ai-agents report-writer; a pre-A4 doc lacks them, so default empty/None.
        "competency_scores": report.get("competency_scores", []),
        "integrity": report.get("integrity"),
        "overall_score": report.get("overall_score", 0.0),
        "recommendation": report.get("recommendation", ""),
    }


async def get_report(identity, application_id, *, applications, reports):
    async with log_context(
        log,
        "resource.report.get_report",
        **bind_ids(
            user_id=identity["id"],
            comp_id=identity["comp_id"],
            application_id=application_id,
        ),
    ):
        _require_manager(identity)
        application = await applications.get(application_id)
        if application is None or application.get("comp_id") != identity["comp_id"]:
            raise NotFoundError("Application not found")
        report = await reports.get_by_application(application_id)
        if report is None:
            raise NotFoundError("Report not ready")
        return _enrich(application_id, application, report)


async def list_reports(identity, job_id, *, applications, reports):
    async with log_context(
        log,
        "resource.report.list_reports",
        **bind_ids(user_id=identity["id"], comp_id=identity["comp_id"], job_id=job_id),
    ):
        _require_manager(identity)
        apps = await applications.list_by_job(job_id, identity["comp_id"])
        app_by_id = {str(a["_id"]): a for a in apps}
        report_rows = await reports.list_by_applications(list(app_by_id))
        report_by_app = {r["application_id"]: r for r in report_rows}
        return [
            _enrich(application_id, app, report_by_app[application_id])
            for application_id, app in app_by_id.items()
            if application_id in report_by_app
        ]


_HEADERS = [
    "Candidate",
    "State",
    "Overall Score",
    "Recommendation",
    "Summary",
    "Highlights",
    "Risks",
]


def _build_xlsx(rows):
    wb = Workbook()
    ws = wb.active
    ws.title = "Reports"
    ws.append(_HEADERS)
    for r in rows:
        ws.append(
            [
                r["candidate_user_id"],
                r["state"],
                r["overall_score"],
                r["recommendation"],
                r["executive_summary"],
                "; ".join(r["highlights"]),
                "; ".join(r["risks"]),
            ]
        )
    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


async def export_reports(identity, job_id, *, applications, reports):
    async with log_context(
        log,
        "resource.report.export_reports",
        **bind_ids(user_id=identity["id"], comp_id=identity["comp_id"], job_id=job_id),
    ):
        rows = await list_reports(
            identity, job_id, applications=applications, reports=reports
        )
        return _build_xlsx(rows)
