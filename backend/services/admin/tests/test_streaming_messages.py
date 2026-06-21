"""Tests for stream_messages resource and StreamMessages servicer."""

import asyncio
from datetime import UTC, datetime

import pytest

from app.resources.messaging import stream_messages

SECRET = "test-secret-" + "x" * 32


class _Apps:
    async def get(self, application_id):
        if application_id != "a1":
            return None
        return {
            "_id": "a1",
            "comp_id": "c1",
            "candidate_user_id": "cand1",
            "job_id": "j1",
        }


class _Messages:
    def __init__(self):
        self._docs: list[dict] = []
        self._seq = 0

    def _add(self, application_id: str, body: str) -> str:
        self._seq += 1
        _id = str(self._seq)
        self._docs.append(
            {
                "_id": _id,
                "application_id": application_id,
                "sender_role": "recruiter",
                "sender_user_id": "u1",
                "body": body,
                "created_at": datetime.now(UTC),
                "read_at": None,
            }
        )
        return _id

    async def list_after(
        self, application_id: str, since_id: str, *, limit: int
    ) -> list[dict]:
        if not since_id:
            rows = [d for d in self._docs if d["application_id"] == application_id]
        else:
            rows = [
                d
                for d in self._docs
                if d["application_id"] == application_id and d["_id"] > since_id
            ]
        return rows[:limit]


_IDENTITY = {"id": "cand1", "role": "candidate", "comp_id": None}


@pytest.mark.asyncio
async def test_stream_yields_existing_then_new():
    """Stream emits pre-existing messages then newly inserted ones."""
    msgs = _Messages()
    msgs._add("a1", "first")
    msgs._add("a1", "second")

    collected: list[dict] = []
    ticks = 0

    async def _patched_sleep(_):
        nonlocal ticks
        ticks += 1
        if ticks >= 2:
            raise asyncio.CancelledError

    gen = stream_messages(
        "a1", "", identity=_IDENTITY, applications=_Apps(), messages=msgs
    )

    original_sleep = asyncio.sleep
    asyncio.sleep = _patched_sleep
    try:
        async for m in gen:
            collected.append(m)
    except asyncio.CancelledError:
        pass
    finally:
        asyncio.sleep = original_sleep

    assert len(collected) == 2
    assert collected[0]["body"] == "first"
    assert collected[1]["body"] == "second"


@pytest.mark.asyncio
async def test_stream_resume_from_since_id():
    """since_id skips already-seen messages."""
    msgs = _Messages()
    msgs._add("a1", "old")
    second_id = msgs._add("a1", "new")

    collected: list[dict] = []
    ticks = 0

    async def _patched_sleep(_):
        nonlocal ticks
        ticks += 1
        raise asyncio.CancelledError

    gen = stream_messages(
        "a1", "1", identity=_IDENTITY, applications=_Apps(), messages=msgs
    )

    original_sleep = asyncio.sleep
    asyncio.sleep = _patched_sleep
    try:
        async for m in gen:
            collected.append(m)
    except asyncio.CancelledError:
        pass
    finally:
        asyncio.sleep = original_sleep

    assert len(collected) == 1
    assert collected[0]["id"] == second_id


@pytest.mark.asyncio
async def test_stream_cancels_cleanly():
    """CancelledError from the caller propagates without wrapping."""
    msgs = _Messages()

    async def _immediate_cancel(_):
        raise asyncio.CancelledError

    gen = stream_messages(
        "a1", "", identity=_IDENTITY, applications=_Apps(), messages=msgs
    )

    original_sleep = asyncio.sleep
    asyncio.sleep = _immediate_cancel
    try:
        async for _ in gen:
            pass
    except asyncio.CancelledError:
        pass  # expected — clean exit
    finally:
        asyncio.sleep = original_sleep
