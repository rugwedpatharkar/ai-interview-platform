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


class _Events:
    async def find_by_application(self, comp_id, application_id):
        return [{"type": "second_face", "severity": "high", "at": "t", "meta": {}}]


class _Interviews:
    def __init__(self, doc=None):
        self._doc = doc

    async def get_by_application(self, application_id):
        return self._doc


class _FakeStorage:
    async def presigned_get_url_raw(self, object_key, ttl=None):
        return f"https://rec/{object_key}"


def _integrity_servicer(fakes, interview_doc=None, storage=None):
    return ReportServicer(
        applications=fakes["applications"],
        reports=fakes["reports"],
        tokens=TokenService(SECRET),
        proctoring_events=_Events(),
        interviews=_Interviews(interview_doc),
        storage=storage,
    )


@pytest.mark.asyncio
async def test_integrity_timeline_rpc(fakes):
    aid = await fakes["applications"].insert(
        Application(comp_id="c1", job_id="j1", candidate_user_id="cand", state="scored")
    )
    svc = _integrity_servicer(fakes, {"terminated_by_proctor": "second_face"})
    out = await svc.GetIntegrityTimeline(
        report_pb2.GetIntegrityTimelineRequest(application_id=aid), _md()
    )
    assert out.integrity_score == 8
    assert out.flags[0].type == "second_face" and out.flags[0].severity == "high"
    assert out.auto_terminated is True and out.terminated_reason == "second_face"


@pytest.mark.asyncio
async def test_integrity_timeline_rpc_presigns_recording(fakes):
    aid = await fakes["applications"].insert(
        Application(comp_id="c1", job_id="j1", candidate_user_id="cand", state="scored")
    )
    svc = _integrity_servicer(
        fakes, {"recording_key": "c1/recordings/x.mp4"}, storage=_FakeStorage()
    )
    out = await svc.GetIntegrityTimeline(
        report_pb2.GetIntegrityTimelineRequest(application_id=aid), _md()
    )
    assert out.recording_url == "https://rec/c1/recordings/x.mp4"


@pytest.mark.asyncio
async def test_integrity_timeline_cross_tenant_not_found(fakes):
    aid = await fakes["applications"].insert(
        Application(comp_id="other", job_id="j1", candidate_user_id="x", state="scored")
    )
    with pytest.raises(_Aborted) as ei:
        await _integrity_servicer(fakes).GetIntegrityTimeline(
            report_pb2.GetIntegrityTimelineRequest(application_id=aid),
            _md(comp_id="c1"),
        )
    assert ei.value.code == grpc.StatusCode.NOT_FOUND
