"""resources/integrity.get_integrity_timeline — comp-scoped proctoring read."""

import pytest

from app.errors import ForbiddenError, NotFoundError
from app.resources import integrity

MGR = {"id": "m1", "role": "company_admin", "comp_id": "c1"}
CAND = {"id": "u1", "role": "candidate", "comp_id": None}


class _Apps:
    def __init__(self, app):
        self._app = app

    async def get(self, application_id):
        return self._app


class _Events:
    def __init__(self, rows):
        self._rows = rows
        self.calls = []

    async def find_by_application(self, comp_id, application_id):
        self.calls.append((comp_id, application_id))
        return self._rows


class _Interviews:
    def __init__(self, doc=None):
        self._doc = doc

    async def get_by_application(self, application_id):
        return self._doc


def _app(comp_id="c1"):
    return {"_id": "a1", "comp_id": comp_id, "candidate_user_id": "u1", "state": "x"}


@pytest.mark.asyncio
async def test_manager_only():
    with pytest.raises(ForbiddenError):
        await integrity.get_integrity_timeline(
            CAND,
            "a1",
            applications=_Apps(_app()),
            proctoring_events=_Events([]),
            interviews=_Interviews(),
        )


@pytest.mark.asyncio
async def test_cross_tenant_is_not_found():
    with pytest.raises(NotFoundError):
        await integrity.get_integrity_timeline(
            MGR,
            "a1",
            applications=_Apps(_app(comp_id="other")),
            proctoring_events=_Events([]),
            interviews=_Interviews(),
        )


@pytest.mark.asyncio
async def test_score_flags_and_auto_termination():
    events = [
        {"type": "tab_hidden", "severity": "low", "at": "t1", "meta": {"k": 1}},
        {"type": "second_face", "severity": "high", "at": "t2", "meta": None},
    ]
    out = await integrity.get_integrity_timeline(
        MGR,
        "a1",
        applications=_Apps(_app()),
        proctoring_events=_Events(events),
        interviews=_Interviews({"terminated_by_proctor": "second_face"}),
    )
    assert out["integrity_score"] == 9  # low(1) + high(8)
    assert [f["type"] for f in out["flags"]] == ["tab_hidden", "second_face"]
    assert out["flags"][0]["meta"] == {"k": "1"}  # stringified map
    assert out["flags"][1]["severity"] == "high"
    assert out["auto_terminated"] is True
    assert out["terminated_reason"] == "second_face"
    assert out["recording_url"] == ""


@pytest.mark.asyncio
async def test_no_events_is_clean_zero_not_404():
    out = await integrity.get_integrity_timeline(
        MGR,
        "a1",
        applications=_Apps(_app()),
        proctoring_events=_Events([]),
        interviews=_Interviews(None),
    )
    assert out["integrity_score"] == 0 and out["flags"] == []
    assert out["auto_terminated"] is False and out["terminated_reason"] == ""


class _FakeStorage:
    def __init__(self):
        self.presigned = []

    async def presigned_get_url_raw(self, object_key, ttl=None):
        self.presigned.append(object_key)
        return f"https://rec/{object_key}"


@pytest.mark.asyncio
async def test_recording_url_presigned_when_key_present():
    storage = _FakeStorage()
    out = await integrity.get_integrity_timeline(
        MGR,
        "a1",
        applications=_Apps(_app()),
        proctoring_events=_Events([]),
        interviews=_Interviews({"recording_key": "c1/recordings/a1.mp4"}),
        storage=storage,
    )
    assert out["recording_url"] == "https://rec/c1/recordings/a1.mp4"
    assert storage.presigned == ["c1/recordings/a1.mp4"]


@pytest.mark.asyncio
async def test_recording_url_empty_without_key():
    # No recording_key on the interview doc → no presign attempt, empty URL.
    storage = _FakeStorage()
    out = await integrity.get_integrity_timeline(
        MGR,
        "a1",
        applications=_Apps(_app()),
        proctoring_events=_Events([]),
        interviews=_Interviews({"terminated_by_proctor": "second_face"}),
        storage=storage,
    )
    assert out["recording_url"] == ""
    assert storage.presigned == []


@pytest.mark.asyncio
async def test_events_queried_comp_scoped():
    events = _Events([])
    await integrity.get_integrity_timeline(
        MGR,
        "a1",
        applications=_Apps(_app()),
        proctoring_events=events,
        interviews=_Interviews(),
    )
    assert events.calls == [("c1", "a1")]  # comp_id from the token, not the request
