from datetime import UTC, datetime

import pytest
from lib.schemas import Role

from app.errors import ValidationError
from app.model.application import Application
from app.model.aptitude import AptitudeAttempt
from app.model.auth import User
from app.model.profile import CandidateProfile
from app.resources import compliance


def _identity(user_id="u1"):
    return {"id": user_id, "role": "candidate", "comp_id": None}


async def test_record_and_list_consent(fakes):
    await compliance.record_consent(
        _identity(), "automated_evaluation", "v1", consents=fakes["consents"]
    )
    items = await compliance.list_consent(_identity(), consents=fakes["consents"])
    assert len(items) == 1
    assert items[0]["scope"] == "automated_evaluation"
    assert items[0]["terms_version"] == "v1"


async def test_record_consent_rejects_unknown_scope(fakes):
    with pytest.raises(ValidationError):
        await compliance.record_consent(
            _identity(), "marketing", "v1", consents=fakes["consents"]
        )


async def test_record_consent_requires_terms_version(fakes):
    with pytest.raises(ValidationError):
        await compliance.record_consent(
            _identity(), "data_processing", "", consents=fakes["consents"]
        )


async def test_list_consent_is_per_user(fakes):
    await compliance.record_consent(
        _identity("u1"), "data_processing", "v1", consents=fakes["consents"]
    )
    await compliance.record_consent(
        _identity("u2"), "data_processing", "v1", consents=fakes["consents"]
    )
    items = await compliance.list_consent(_identity("u1"), consents=fakes["consents"])
    assert len(items) == 1


def _eraser(fakes):
    return compliance.CandidateEraser(
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


async def test_erase_candidate_anonymizes_and_deletes(fakes):
    uid = await fakes["users"].insert(
        User(email="c@x.com", password_hash="h", role=Role.candidate)
    )
    await fakes["profiles"].insert(
        CandidateProfile(user_id=uid, resume_key="u/resumes/u/r.pdf")
    )
    await _eraser(fakes).erase(uid)
    user = await fakes["users"].get(uid)
    assert user["erased"] is True
    assert user["email"] != "c@x.com"
    assert await fakes["profiles"].get_by_user(uid) is None
    assert "u/resumes/u/r.pdf" in fakes["storage"].deleted
    assert any(r["action"] == "erased" for r in fakes["audit"].records)


async def test_erase_deletes_consent_ledger(fakes):
    uid = await fakes["users"].insert(
        User(email="c@x.com", password_hash="h", role=Role.candidate)
    )
    await compliance.record_consent(
        _identity(uid), "automated_evaluation", "v1", consents=fakes["consents"]
    )
    await _eraser(fakes).erase(uid)
    assert (
        await compliance.list_consent(_identity(uid), consents=fakes["consents"]) == []
    )


async def test_erase_cascades_into_ai_artifacts(fakes):
    uid = await fakes["users"].insert(
        User(email="c@x.com", password_hash="h", role=Role.candidate)
    )
    app_id = await fakes["applications"].insert(
        Application(comp_id="c1", job_id="j1", candidate_user_id=uid, state="scored")
    )
    fakes["reports"]._by_app[app_id] = {"application_id": app_id, "recommendation": "y"}
    fakes["interviews"].docs[app_id] = {"application_id": app_id, "user_id": uid}
    await fakes["attempts"].insert(
        AptitudeAttempt(
            application_id=app_id,
            comp_id="c1",
            candidate_user_id=uid,
            job_id="j1",
            score=80,
            passed=True,
        )
    )
    await _eraser(fakes).erase(uid)
    assert await fakes["reports"].get_by_application(app_id) is None
    assert fakes["interviews"].docs == {}
    assert fakes["attempts"].records == []


async def test_retention_sweep_erases_only_expired(fakes):
    old = await fakes["users"].insert(
        User(
            email="old@x.com",
            password_hash="h",
            role=Role.candidate,
            created_at=datetime(2020, 1, 1, tzinfo=UTC),
        )
    )
    recent = await fakes["users"].insert(
        User(email="new@x.com", password_hash="h", role=Role.candidate)
    )
    count = await _eraser(fakes).sweep(datetime(2021, 1, 1, tzinfo=UTC))
    assert count == 1
    assert (await fakes["users"].get(old))["erased"] is True
    assert (await fakes["users"].get(recent)).get("erased") is not True
