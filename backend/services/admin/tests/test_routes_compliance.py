import pytest
from lib.schemas import Role
from lib.security import TokenService

from app.model.auth import User
from app.resources.compliance import CandidateEraser
from app.routes.compliance import ComplianceServicer
from app.routes.pb import compliance_pb2

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
    eraser = CandidateEraser(
        users=fakes["users"],
        profiles=fakes["profiles"],
        storage=fakes["storage"],
        audit=fakes["audit"],
        applications=fakes["applications"],
        reports=fakes["reports"],
        interviews=fakes["interviews"],
        attempts=fakes["attempts"],
        consents=fakes["consents"],
    )
    return ComplianceServicer(
        consents=fakes["consents"], eraser=eraser, tokens=TokenService(SECRET)
    )


def _md(user_id="u1"):
    token = TokenService(SECRET).access_token(
        sub=user_id, role="candidate", comp_id=None, jti="j1"
    )
    return FakeContext(metadata=[("authorization", f"Bearer {token}")])


@pytest.mark.asyncio
async def test_record_consent_rpc(fakes):
    receipt = await _servicer(fakes).RecordConsent(
        compliance_pb2.RecordConsentRequest(
            scope="data_processing", terms_version="v2"
        ),
        _md(),
    )
    assert receipt.user_id == "u1"
    assert receipt.scope == "data_processing"


@pytest.mark.asyncio
async def test_get_my_consent_rpc(fakes):
    svc = _servicer(fakes)
    await svc.RecordConsent(
        compliance_pb2.RecordConsentRequest(
            scope="data_processing", terms_version="v2"
        ),
        _md(),
    )
    resp = await svc.GetMyConsent(compliance_pb2.GetMyConsentRequest(), _md())
    assert len(resp.items) == 1
    assert resp.items[0].terms_version == "v2"


@pytest.mark.asyncio
async def test_erase_me_rpc(fakes):
    uid = await fakes["users"].insert(
        User(email="c@x.com", password_hash="h", role=Role.candidate)
    )
    resp = await _servicer(fakes).EraseMe(compliance_pb2.EraseMeRequest(), _md(uid))
    assert resp.erased is True
    assert resp.user_id == uid
    assert (await fakes["users"].get(uid))["erased"] is True
