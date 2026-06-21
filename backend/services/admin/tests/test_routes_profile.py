import grpc
import pytest
from lib.security import TokenService

from app.routes.pb import profile_pb2
from app.routes.profile import ProfileServicer

SECRET = "test-secret-" + "x" * 32
PDF = "application/pdf"


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
    return ProfileServicer(
        profiles=fakes["profiles"],
        storage=fakes["storage"],
        publisher=fakes["publisher"],
        tokens=TokenService(SECRET),
    )


def _candidate_md(user_id="u1"):
    token = TokenService(SECRET).access_token(
        sub=user_id, role="candidate", comp_id=None, jti="j1"
    )
    return FakeContext(metadata=[("authorization", f"Bearer {token}")])


@pytest.mark.asyncio
async def test_upload_resume_rpc(fakes):
    svc = _servicer(fakes)
    resp = await svc.UploadResume(
        profile_pb2.UploadResumeRequest(data=b"%PDF data", content_type=PDF),
        _candidate_md("u1"),
    )
    assert resp.user_id == "u1"
    assert resp.resume_uploaded is True
    assert fakes["publisher"].published[0][0] == "profile.parse"


@pytest.mark.asyncio
async def test_upload_resume_requires_auth(fakes):
    svc = _servicer(fakes)
    with pytest.raises(_Aborted) as ei:
        await svc.UploadResume(
            profile_pb2.UploadResumeRequest(data=b"x", content_type=PDF), FakeContext()
        )
    assert ei.value.code == grpc.StatusCode.UNAUTHENTICATED


@pytest.mark.asyncio
async def test_get_profile_rpc(fakes):
    svc = _servicer(fakes)
    await svc.UploadResume(
        profile_pb2.UploadResumeRequest(data=b"%PDF", content_type=PDF),
        _candidate_md("u1"),
    )
    got = await svc.GetProfile(profile_pb2.GetProfileRequest(), _candidate_md("u1"))
    assert got.resume_uploaded is True


@pytest.mark.asyncio
async def test_update_profile_rpc(fakes):
    resp = await _servicer(fakes).UpdateProfile(
        profile_pb2.UpdateProfileRequest(
            full_name="Jane Doe",
            age=30,
            location="Berlin",
            willing_to_relocate=True,
            job_preference="remote",
        ),
        _candidate_md("u1"),
    )
    assert resp.full_name == "Jane Doe"
    assert resp.age == 30
    assert resp.location == "Berlin"
    assert resp.willing_to_relocate is True
    assert resp.job_preference == "remote"


@pytest.mark.asyncio
async def test_update_profile_rpc_round_trips_parsed_data(fakes):
    resp = await _servicer(fakes).UpdateProfile(
        profile_pb2.UpdateProfileRequest(
            full_name="Jane",
            experience=[
                profile_pb2.ExperienceItem(
                    company="Acme", title="Engineer", summary="Built X"
                )
            ],
            education=[
                profile_pb2.EducationItem(institution="MIT", degree="BS", year="2020")
            ],
            skills=["python", "go"],
        ),
        _candidate_md("u1"),
    )
    assert resp.experience[0].company == "Acme"
    assert resp.education[0].institution == "MIT"
    assert list(resp.skills) == ["python", "go"]
