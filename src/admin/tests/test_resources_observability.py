"""TDD tests for app/resources/observability.py.

Covers record_client_error and record_client_event: happy path, dedup,
max-exceeded, anonymous call, identity scrub, PII redaction, empty input,
and malformed properties_json skipping.
"""

import pytest

from app.errors import ValidationError
from app.resources import observability as obs_res
from app.routes.pb import observability_pb2

# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------


class _FakeRepo:
    def __init__(self):
        self.docs = []

    async def insert_dedup(self, doc, *, dedup):
        if not await dedup(doc["event_id"]):
            return False
        self.docs.append(doc)
        return True


class _FakeDedup:
    def __init__(self):
        self.seen = set()

    async def __call__(self, event_id):
        if event_id in self.seen:
            return False
        self.seen.add(event_id)
        return True


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _error_event(event_id, message="boom", stack="at Component (app.js:1)"):
    return observability_pb2.ClientErrorEvent(
        event_id=event_id,
        correlation_id="corr-1",
        occurred_at_ms=1_700_000_000_000,
        component="TestComponent",
        route="/home",
        build_sha="abc123",
        user_agent_hash="ua-hash",
        error=observability_pb2.ClientErrorPayload(
            name="TypeError",
            message=message,
            stack_truncated_8k=stack,
        ),
    )


def _client_event(event_id, props_json='{"page": "home"}'):
    return observability_pb2.ClientEvent(
        event_id=event_id,
        correlation_id="corr-2",
        occurred_at_ms=1_700_000_000_000,
        name="page_view",
        route="/home",
        properties_json=props_json,
    )


IDENTITY = {"user_id": "u1", "comp_id": "c1", "role": "candidate"}
ANON = {"user_id": None, "comp_id": "", "role": None}


# ===========================================================================
# record_client_error
# ===========================================================================


@pytest.mark.asyncio
async def test_record_client_error_happy_path():
    repo = _FakeRepo()
    dedup = _FakeDedup()
    events = [_error_event(f"e{i}") for i in range(3)]
    accepted = await obs_res.record_client_error(
        events, errors_repo=repo, dedup=dedup, identity=IDENTITY
    )
    assert accepted == ["e0", "e1", "e2"]
    assert len(repo.docs) == 3


@pytest.mark.asyncio
async def test_record_client_error_dedups_by_event_id():
    repo = _FakeRepo()
    dedup = _FakeDedup()
    event = _error_event("dup-1")
    await obs_res.record_client_error(
        [event], errors_repo=repo, dedup=dedup, identity=IDENTITY
    )
    accepted2 = await obs_res.record_client_error(
        [event], errors_repo=repo, dedup=dedup, identity=IDENTITY
    )
    assert accepted2 == []
    assert len(repo.docs) == 1


@pytest.mark.asyncio
async def test_record_client_error_max_exceeded_raises_validation():
    repo = _FakeRepo()
    dedup = _FakeDedup()
    events = [_error_event(f"e{i}") for i in range(51)]
    with pytest.raises(ValidationError, match="max 50"):
        await obs_res.record_client_error(
            events, errors_repo=repo, dedup=dedup, identity=IDENTITY
        )


@pytest.mark.asyncio
async def test_record_client_error_anonymous_call():
    repo = _FakeRepo()
    dedup = _FakeDedup()
    accepted = await obs_res.record_client_error(
        [_error_event("anon-1")], errors_repo=repo, dedup=dedup, identity=ANON
    )
    assert accepted == ["anon-1"]
    doc = repo.docs[0]
    assert doc["user_id"] is None
    assert doc["comp_id"] == ""
    assert doc["role"] is None


@pytest.mark.asyncio
async def test_record_client_error_scrubs_caller_context():
    repo = _FakeRepo()
    dedup = _FakeDedup()
    # Identity says comp_id="real"; caller claims nothing — identity always wins.
    real_identity = {"user_id": "u-real", "comp_id": "real", "role": "candidate"}
    await obs_res.record_client_error(
        [_error_event("scrub-1")], errors_repo=repo, dedup=dedup, identity=real_identity
    )
    doc = repo.docs[0]
    assert doc["comp_id"] == "real"
    assert doc["user_id"] == "u-real"


@pytest.mark.asyncio
async def test_record_client_error_redacts_pii():
    repo = _FakeRepo()
    dedup = _FakeDedup()
    # Use key=value form so the regex captures the value token (stops at whitespace).
    event = _error_event("pii-1", message="token=abc123", stack="token=xyz at app.js")
    await obs_res.record_client_error(
        [event], errors_repo=repo, dedup=dedup, identity=IDENTITY
    )
    doc = repo.docs[0]
    assert "abc123" not in doc["error"]["message"]
    assert "***" in doc["error"]["message"]
    assert "xyz" not in doc["error"]["stack_truncated_8k"]
    assert "***" in doc["error"]["stack_truncated_8k"]


@pytest.mark.asyncio
async def test_record_client_error_empty_events_returns_empty():
    repo = _FakeRepo()
    dedup = _FakeDedup()
    accepted = await obs_res.record_client_error(
        [], errors_repo=repo, dedup=dedup, identity=IDENTITY
    )
    assert accepted == []
    assert repo.docs == []


# ===========================================================================
# record_client_event
# ===========================================================================


@pytest.mark.asyncio
async def test_record_client_event_happy_path():
    repo = _FakeRepo()
    dedup = _FakeDedup()
    events = [_client_event(f"ev{i}") for i in range(3)]
    accepted = await obs_res.record_client_event(
        events, events_repo=repo, dedup=dedup, identity=IDENTITY
    )
    assert accepted == ["ev0", "ev1", "ev2"]
    assert len(repo.docs) == 3


@pytest.mark.asyncio
async def test_record_client_event_dedups_by_event_id():
    repo = _FakeRepo()
    dedup = _FakeDedup()
    event = _client_event("dup-ev-1")
    await obs_res.record_client_event(
        [event], events_repo=repo, dedup=dedup, identity=IDENTITY
    )
    accepted2 = await obs_res.record_client_event(
        [event], events_repo=repo, dedup=dedup, identity=IDENTITY
    )
    assert accepted2 == []
    assert len(repo.docs) == 1


@pytest.mark.asyncio
async def test_record_client_event_max_exceeded_raises_validation():
    repo = _FakeRepo()
    dedup = _FakeDedup()
    events = [_client_event(f"ev{i}") for i in range(101)]
    with pytest.raises(ValidationError, match="max 100"):
        await obs_res.record_client_event(
            events, events_repo=repo, dedup=dedup, identity=IDENTITY
        )


@pytest.mark.asyncio
async def test_record_client_event_anonymous_call():
    repo = _FakeRepo()
    dedup = _FakeDedup()
    accepted = await obs_res.record_client_event(
        [_client_event("anon-ev-1")], events_repo=repo, dedup=dedup, identity=ANON
    )
    assert accepted == ["anon-ev-1"]
    doc = repo.docs[0]
    assert doc["user_id"] is None
    assert doc["comp_id"] == ""
    assert doc["role"] is None


@pytest.mark.asyncio
async def test_record_client_event_scrubs_caller_context():
    repo = _FakeRepo()
    dedup = _FakeDedup()
    real_identity = {"user_id": "u-real", "comp_id": "real", "role": "candidate"}
    await obs_res.record_client_event(
        [_client_event("scrub-ev-1")],
        events_repo=repo,
        dedup=dedup,
        identity=real_identity,
    )
    doc = repo.docs[0]
    assert doc["comp_id"] == "real"
    assert doc["user_id"] == "u-real"


@pytest.mark.asyncio
async def test_record_client_event_empty_events_returns_empty():
    repo = _FakeRepo()
    dedup = _FakeDedup()
    accepted = await obs_res.record_client_event(
        [], events_repo=repo, dedup=dedup, identity=IDENTITY
    )
    assert accepted == []
    assert repo.docs == []


@pytest.mark.asyncio
async def test_record_client_event_skips_malformed_properties_json():
    repo = _FakeRepo()
    dedup = _FakeDedup()
    events = [
        _client_event("good-1", props_json='{"ok": true}'),
        _client_event("bad-1", props_json="{not valid json"),
        _client_event("good-2", props_json='{"also": "fine"}'),
    ]
    accepted = await obs_res.record_client_event(
        events, events_repo=repo, dedup=dedup, identity=IDENTITY
    )
    assert accepted == ["good-1", "good-2"]
    assert len(repo.docs) == 2
