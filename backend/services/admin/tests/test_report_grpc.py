"""ReportService over gRPC-web: GetReport carries competency evidence + integrity."""

import struct

import httpx
import pytest
from lib.grpcweb import GrpcWebASGI
from lib.security import TokenService

from app.routes.pb import report_pb2, report_pb2_grpc
from app.routes.report import ReportServicer

_SECRET = "test-secret-" + "x" * 32
_SVC = "/admin.report.v1.ReportService"


class _FakeApplications:
    async def get(self, aid):
        return {
            "_id": aid,
            "comp_id": "c1",
            "candidate_user_id": "cand",
            "state": "scored",
        }


class _FakeReports:
    async def get_by_application(self, aid):
        return {
            "application_id": aid,
            "executive_summary": "Strong",
            "highlights": ["clear"],
            "risks": [],
            "competency_scores": [
                {
                    "competency": "python",
                    "score": 0.9,
                    "rationale": "solid",
                    "evidence": [{"quote": "it yields control", "turn_index": 0}],
                }
            ],
            "integrity": {
                "score": 4.0,
                "flags": ["paste_large"],
                "auto_terminated": False,
            },
            "overall_score": 0.8,
            "recommendation": "advance",
        }


def _app():
    grpc_app = GrpcWebASGI()
    report_pb2_grpc.add_ReportServiceServicer_to_server(
        ReportServicer(
            applications=_FakeApplications(),
            reports=_FakeReports(),
            tokens=TokenService(_SECRET),
        ),
        grpc_app,
    )
    return grpc_app


def _frame(b):
    return b"\x00" + struct.pack(">I", len(b)) + b


def _ds(body):
    data, status, i = None, None, 0
    while i + 5 <= len(body):
        flag = body[i]
        (n,) = struct.unpack(">I", body[i + 1 : i + 5])
        p = body[i + 5 : i + 5 + n]
        if flag & 0x80:
            for line in p.decode().replace("\r\n", "\n").splitlines():
                if line.startswith("grpc-status:"):
                    status = int(line.split(":", 1)[1])
        else:
            data = p
        i += 5 + n
    return data, status


async def _call(app, method, req, *, metadata=None):
    transport = httpx.ASGITransport(app=app)
    headers = {"content-type": "application/grpc-web+proto", **(metadata or {})}
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as client:
        return await client.post(
            f"{_SVC}/{method}", content=_frame(req.SerializeToString()), headers=headers
        )


def _manager():
    token = TokenService(_SECRET).access_token("u1", "recruiter", "c1", "j1")
    return {"authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_get_report_requires_auth():
    resp = await _call(
        _app(), "GetReport", report_pb2.GetReportRequest(application_id="a1")
    )
    _, status = _ds(resp.content)
    assert status == 16  # UNAUTHENTICATED


@pytest.mark.asyncio
async def test_get_report_maps_competency_evidence_and_integrity():
    resp = await _call(
        _app(),
        "GetReport",
        report_pb2.GetReportRequest(application_id="a1"),
        metadata=_manager(),
    )
    data, status = _ds(resp.content)
    assert status == 0
    out = report_pb2.InterviewReport.FromString(data)
    assert out.overall_score == 0.8
    cs = out.competency_scores[0]
    assert cs.competency == "python"
    assert cs.evidence[0].quote == "it yields control"
    assert cs.evidence[0].turn_index == 0
    assert out.integrity.score == 4.0
    assert list(out.integrity.flags) == ["paste_large"]
    assert out.integrity.auto_terminated is False
