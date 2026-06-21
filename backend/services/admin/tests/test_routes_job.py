import grpc
import pytest
from lib.security import TokenService

from app.routes.job import JobServicer
from app.routes.pb import job_pb2

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
    return JobServicer(
        jobs=fakes["jobs"],
        publisher=fakes["publisher"],
        tokens=TokenService(SECRET),
        companies=fakes["companies"],
    )


def _md(role="company_admin", comp_id="c1"):
    token = TokenService(SECRET).access_token(
        sub="u1", role=role, comp_id=comp_id, jti="j1"
    )
    return FakeContext(metadata=[("authorization", f"Bearer {token}")])


@pytest.mark.asyncio
async def test_create_publish_job_rpc(fakes):
    svc = _servicer(fakes)
    created = await svc.CreateJob(
        job_pb2.CreateJobRequest(title="Eng", jd_text="x"), _md()
    )
    assert created.status == "draft"
    pub = await svc.PublishJob(job_pb2.PublishJobRequest(job_id=created.job_id), _md())
    assert pub.status == "published"
    assert fakes["publisher"].published[0][0] == "job.published"


@pytest.mark.asyncio
async def test_list_jobs_rpc_is_company_scoped(fakes):
    svc = _servicer(fakes)
    await svc.CreateJob(
        job_pb2.CreateJobRequest(title="Eng", jd_text="x"), _md(comp_id="c1")
    )
    listed = await svc.ListJobs(job_pb2.ListJobsRequest(), _md(comp_id="c2"))
    assert len(listed.jobs) == 0


@pytest.mark.asyncio
async def test_candidate_create_forbidden(fakes):
    svc = _servicer(fakes)
    with pytest.raises(_Aborted) as ei:
        await svc.CreateJob(
            job_pb2.CreateJobRequest(title="Eng", jd_text="x"),
            _md(role="candidate", comp_id=""),
        )
    assert ei.value.code == grpc.StatusCode.PERMISSION_DENIED


@pytest.mark.asyncio
async def test_create_job_echoes_marketplace_fields(fakes):
    svc = _servicer(fakes)
    out = await svc.CreateJob(
        job_pb2.CreateJobRequest(
            title="Eng",
            jd_text="x",
            city="Berlin",
            remote_mode="hybrid",
            employment_type="full_time",
            salary_min=80000,
            salary_max=120000,
            salary_currency="eur",
            skills=["React", "react"],
            gate_mode="advisory",
        ),
        _md(),
    )
    assert out.city == "Berlin" and out.remote_mode == "hybrid"
    assert out.salary_min == 80000 and out.salary_max == 120000
    assert list(out.skills) == ["react"]  # de-duped + lowercased
    assert out.gate_mode == "advisory"


@pytest.mark.asyncio
async def test_update_job_rpc_changes_fields(fakes):
    svc = _servicer(fakes)
    created = await svc.CreateJob(
        job_pb2.CreateJobRequest(title="Eng", jd_text="x"), _md()
    )
    out = await svc.UpdateJob(
        job_pb2.UpdateJobRequest(
            job_id=created.job_id,
            title="Senior Eng",
            jd_text="y",
            remote_mode="remote",
            gate_mode="advisory",
        ),
        _md(),
    )
    assert out.title == "Senior Eng" and out.remote_mode == "remote"
    assert out.gate_mode == "advisory"


@pytest.mark.asyncio
async def test_update_job_rejects_off_enum(fakes):
    svc = _servicer(fakes)
    created = await svc.CreateJob(
        job_pb2.CreateJobRequest(title="Eng", jd_text="x"), _md()
    )
    with pytest.raises(_Aborted) as ei:
        await svc.UpdateJob(
            job_pb2.UpdateJobRequest(
                job_id=created.job_id, title="Eng", remote_mode="on-the-moon"
            ),
            _md(),
        )
    assert ei.value.code == grpc.StatusCode.INVALID_ARGUMENT


@pytest.mark.asyncio
async def test_get_public_job_returns_full_dto(fakes):
    svc = _servicer(fakes)
    created = await svc.CreateJob(
        job_pb2.CreateJobRequest(
            title="Eng", jd_text="Build APIs.", remote_mode="remote", skills=["python"]
        ),
        _md(),
    )
    await svc.PublishJob(job_pb2.PublishJobRequest(job_id=created.job_id), _md())
    out = await svc.GetPublicJob(job_pb2.GetJobRequest(job_id=created.job_id), _md())
    assert out.title == "Eng" and out.jd_text == "Build APIs."
    assert out.remote_mode == "remote" and list(out.skills) == ["python"]
    assert out.posted_at != ""  # stamped at publish
    assert out.company.id == "c1"  # comp_id surfaces only as company.id


@pytest.mark.asyncio
async def test_get_public_job_draft_not_found(fakes):
    svc = _servicer(fakes)
    created = await svc.CreateJob(
        job_pb2.CreateJobRequest(title="Draft", jd_text="x"), _md()
    )
    with pytest.raises(_Aborted) as ei:
        await svc.GetPublicJob(job_pb2.GetJobRequest(job_id=created.job_id), _md())
    assert ei.value.code == grpc.StatusCode.NOT_FOUND


@pytest.mark.asyncio
async def test_update_job_cross_tenant_not_found(fakes):
    svc = _servicer(fakes)
    created = await svc.CreateJob(
        job_pb2.CreateJobRequest(title="Eng", jd_text="x"), _md(comp_id="c1")
    )
    with pytest.raises(_Aborted) as ei:
        await svc.UpdateJob(
            job_pb2.UpdateJobRequest(job_id=created.job_id, title="Eng"),
            _md(comp_id="c2"),
        )
    assert ei.value.code == grpc.StatusCode.NOT_FOUND
