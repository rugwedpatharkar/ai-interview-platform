import io

import grpc
import pytest
from lib.security import TokenService
from openpyxl import load_workbook

from app.model.application import Application
from app.routes.pb import report_pb2
from app.routes.report import ReportServicer

SECRET = "test-secret-" + "x" * 32


class _Aborted(Exception):
    def __init__(self, code, details):
        super().__init__(details)
        self.code = code


class FakeContext:
    def __init__(self, metadata=None):
        self._md = metadata or []

    def invocation_metadata(self):
        return self._md

    async def abort(self, code, details):
        raise _Aborted(code, details)


def _servicer(fakes):
    return ReportServicer(
        applications=fakes["applications"],
        reports=fakes["reports"],
        tokens=TokenService(SECRET),
    )


def _md(role="recruiter", comp_id="c1"):
    token = TokenService(SECRET).access_token(
        sub="u1", role=role, comp_id=comp_id, jti="j1"
    )
    return FakeContext(metadata=[("authorization", f"Bearer {token}")])


async def _seed(fakes):
    aid = await fakes["applications"].insert(
        Application(comp_id="c1", job_id="j1", candidate_user_id="cand", state="scored")
    )
    fakes["reports"]._by_app[aid] = {
        "application_id": aid,
        "executive_summary": "Strong",
        "highlights": ["x"],
        "risks": [],
        "overall_score": 0.8,
        "recommendation": "advance",
    }
    return aid


@pytest.mark.asyncio
async def test_get_report_rpc(fakes):
    aid = await _seed(fakes)
    resp = await _servicer(fakes).GetReport(
        report_pb2.GetReportRequest(application_id=aid), _md()
    )
    assert resp.overall_score == 0.8
    assert resp.recommendation == "advance"
    assert resp.candidate_user_id == "cand"


@pytest.mark.asyncio
async def test_list_reports_rpc(fakes):
    await _seed(fakes)
    resp = await _servicer(fakes).ListReports(
        report_pb2.ListReportsRequest(job_id="j1"), _md()
    )
    assert len(resp.reports) == 1


@pytest.mark.asyncio
async def test_get_report_rpc_rejects_candidate(fakes):
    aid = await _seed(fakes)
    with pytest.raises(_Aborted) as ei:
        await _servicer(fakes).GetReport(
            report_pb2.GetReportRequest(application_id=aid), _md(role="candidate")
        )
    assert ei.value.code == grpc.StatusCode.PERMISSION_DENIED


@pytest.mark.asyncio
async def test_export_reports_rpc(fakes):
    await _seed(fakes)
    resp = await _servicer(fakes).ExportReports(
        report_pb2.ListReportsRequest(job_id="j1"), _md()
    )
    assert resp.filename == "reports_j1.xlsx"
    assert load_workbook(io.BytesIO(resp.content)).active["A1"].value == "Candidate"
