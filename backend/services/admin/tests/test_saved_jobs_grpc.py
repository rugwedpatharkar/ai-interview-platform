"""SavedJobsService over the gRPC-web translator: auth + save/unsave/list."""

import struct
from datetime import UTC, datetime

import httpx
import pytest
from lib.grpcweb import GrpcWebASGI
from lib.security import TokenService

from app.routes.pb import saved_jobs_pb2, saved_jobs_pb2_grpc
from app.routes.saved_jobs import SavedJobsServicer

_SECRET = "test-secret-" + "x" * 32
_SVC = "/admin.saved_jobs.v1.SavedJobsService"


class _FakeSaved:
    def __init__(self):
        self.saved = []
        self.unsaved = []
        self.rows = []

    async def save(self, cid, jid):
        self.saved.append((cid, jid))

    async def unsave(self, cid, jid):
        self.unsaved.append((cid, jid))

    async def list_by_candidate(self, cid):
        return list(self.rows)


class _FakeJobs:
    def __init__(self, by_id=None, published=None):
        self._by_id = by_id or {}
        self._pub = published or []

    async def get_by_id(self, jid):
        return self._by_id.get(jid)

    async def find_published_by_ids(self, ids):
        return [d for d in self._pub if str(d["_id"]) in ids]


class _FakeCompanies:
    async def names_by_ids(self, ids):
        return {}


def _app(saved=None, jobs=None):
    app = GrpcWebASGI()
    saved_jobs_pb2_grpc.add_SavedJobsServiceServicer_to_server(
        SavedJobsServicer(
            saved_jobs=saved or _FakeSaved(),
            jobs=jobs or _FakeJobs(),
            companies=_FakeCompanies(),
            tokens=TokenService(_SECRET),
        ),
        app,
    )
    return app


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


def _auth(uid="u1"):
    token = TokenService(_SECRET).access_token(uid, "candidate", None, "j1")
    return {"authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_save_requires_auth():
    resp = await _call(_app(), "SaveJob", saved_jobs_pb2.SaveJobRequest(job_id="j1"))
    _, status = _ds(resp.content)
    assert status == 16  # UNAUTHENTICATED


@pytest.mark.asyncio
async def test_save_published_job_idempotent_true():
    saved = _FakeSaved()
    jobs = _FakeJobs(by_id={"j1": {"_id": "j1", "status": "published"}})
    resp = await _call(
        _app(saved, jobs),
        "SaveJob",
        saved_jobs_pb2.SaveJobRequest(job_id="j1"),
        metadata=_auth("u1"),
    )
    data, status = _ds(resp.content)
    assert status == 0
    assert saved_jobs_pb2.SaveJobResponse.FromString(data).saved is True
    assert saved.saved == [("u1", "j1")]


@pytest.mark.asyncio
async def test_save_draft_job_is_not_found():
    jobs = _FakeJobs(by_id={"j1": {"_id": "j1", "status": "draft"}})
    resp = await _call(
        _app(jobs=jobs),
        "SaveJob",
        saved_jobs_pb2.SaveJobRequest(job_id="j1"),
        metadata=_auth(),
    )
    _, status = _ds(resp.content)
    assert status == 5  # NOT_FOUND — can't bookmark a draft


@pytest.mark.asyncio
async def test_list_saved_returns_cards():
    saved = _FakeSaved()
    saved.rows = [{"job_id": "j1", "saved_at": datetime(2026, 6, 1, tzinfo=UTC)}]
    jobs = _FakeJobs(
        published=[
            {
                "_id": "j1",
                "comp_id": "c1",
                "title": "A",
                "jd_text": "hello",
                "status": "published",
            }
        ]
    )
    resp = await _call(
        _app(saved, jobs),
        "ListSavedJobs",
        saved_jobs_pb2.ListSavedJobsRequest(),
        metadata=_auth(),
    )
    data, status = _ds(resp.content)
    assert status == 0
    out = saved_jobs_pb2.ListSavedJobsResponse.FromString(data)
    assert len(out.jobs) == 1
    assert out.jobs[0].job_id == "j1" and out.jobs[0].snippet == "hello"
    assert out.jobs[0].saved_at.startswith("2026-06-01")
