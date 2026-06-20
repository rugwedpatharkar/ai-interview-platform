"""CompanyProfileService over gRPC-web: branding write auth + presign."""

import struct

import httpx
import pytest
from lib.grpcweb import GrpcWebASGI
from lib.security import TokenService

from app.routes.company_profile import CompanyProfileServicer
from app.routes.pb import company_profile_pb2, company_profile_pb2_grpc

_SECRET = "test-secret-" + "x" * 32
_SVC = "/admin.company_profile.v1.CompanyProfileService"


class _MutProfiles:
    def __init__(self):
        self.doc = None

    async def get_by_comp(self, comp_id):
        return self.doc

    async def upsert_branding(self, comp_id, fields):
        self.doc = {**fields, "comp_id": comp_id}


class _FakeJobs:
    async def count_published_by_comp(self, comp_id):
        return 1


class _FakeCompanies:
    async def names_by_ids(self, ids):
        return {"c1": "Acme"}


class _FakeApps:
    async def list_by_comp(self, comp_id):
        return []


class _FakeStorage:
    async def presigned_put_url(self, comp_id, category, key, content_type, ttl=None):
        return f"https://put/{comp_id}/{category}/{key}"

    async def presigned_get_url(self, comp_id, category, key, ttl=None):
        return f"https://get/{comp_id}/{category}/{key}"


def _app(profiles=None, storage=None):
    grpc_app = GrpcWebASGI()
    company_profile_pb2_grpc.add_CompanyProfileServiceServicer_to_server(
        CompanyProfileServicer(
            companies=_FakeCompanies(),
            profiles=profiles or _MutProfiles(),
            jobs=_FakeJobs(),
            applications=_FakeApps(),
            tokens=TokenService(_SECRET),
            storage=storage or _FakeStorage(),
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


def _admin():
    token = TokenService(_SECRET).access_token("a1", "company_admin", "c1", "j1")
    return {"authorization": f"Bearer {token}"}


def _recruiter():
    token = TokenService(_SECRET).access_token("r1", "recruiter", "c1", "j1")
    return {"authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_upsert_requires_auth():
    resp = await _call(
        _app(),
        "UpsertCompanyProfile",
        company_profile_pb2.UpsertCompanyProfileRequest(),
    )
    _, status = _ds(resp.content)
    assert status == 16  # UNAUTHENTICATED


@pytest.mark.asyncio
async def test_upsert_recruiter_denied():
    resp = await _call(
        _app(),
        "UpsertCompanyProfile",
        company_profile_pb2.UpsertCompanyProfileRequest(about="hi"),
        metadata=_recruiter(),
    )
    _, status = _ds(resp.content)
    assert status == 7  # PERMISSION_DENIED — recruiter lacks branding:edit


@pytest.mark.asyncio
async def test_upsert_admin_persists_and_returns_profile():
    profiles = _MutProfiles()
    resp = await _call(
        _app(profiles),
        "UpsertCompanyProfile",
        company_profile_pb2.UpsertCompanyProfileRequest(
            about="We build", website="https://acme.co", locations=["NYC"]
        ),
        metadata=_admin(),
    )
    data, status = _ds(resp.content)
    assert status == 0
    out = company_profile_pb2.CompanyProfile.FromString(data)
    assert out.about == "We build" and out.website == "https://acme.co"
    assert list(out.locations) == ["NYC"]


@pytest.mark.asyncio
async def test_presign_logo_admin():
    resp = await _call(
        _app(),
        "PresignLogoUpload",
        company_profile_pb2.PresignLogoUploadRequest(content_type="image/png"),
        metadata=_admin(),
    )
    data, status = _ds(resp.content)
    assert status == 0
    out = company_profile_pb2.PresignLogoUploadResponse.FromString(data)
    assert out.upload_url.startswith("https://put/c1/branding/logo-")
    assert out.object_key.endswith(".png")
