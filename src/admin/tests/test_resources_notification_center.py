"""resources/notification read/ack — recipient-scoped feed + fresh unread + notify."""

import pytest

from app.errors import NotFoundError
from app.resources import notification


class _FakeNotifs:
    def __init__(self):
        self._docs = {}
        self._seq = 0
        self._dedup = set()

    async def insert_dedup(self, n):
        key = (n.user_id, n.dedup_key)
        if n.dedup_key is not None and key in self._dedup:
            return False
        if n.dedup_key is not None:
            self._dedup.add(key)
        self._seq += 1
        d = n.model_dump()
        d["_id"] = str(self._seq)
        self._docs[d["_id"]] = d
        return True

    async def list_by_user(self, user_id, *, unread_only=False, limit=50, skip=0):
        rows = [d for d in self._docs.values() if d["user_id"] == user_id]
        if unread_only:
            rows = [d for d in rows if d["read_at"] is None]
        rows.sort(key=lambda d: d["_id"], reverse=True)
        return rows[skip : skip + limit]

    async def count_for(self, user_id, unread_only):
        rows = [d for d in self._docs.values() if d["user_id"] == user_id]
        if unread_only:
            rows = [d for d in rows if d["read_at"] is None]
        return len(rows)

    async def unread_count(self, user_id):
        return sum(
            1
            for d in self._docs.values()
            if d["user_id"] == user_id and d["read_at"] is None
        )

    async def mark_read(self, user_id, notification_id):
        d = self._docs.get(notification_id)
        if d is None or d["user_id"] != user_id:
            return False
        d["read_at"] = "2026-06-20T00:00:00+00:00"
        return True

    async def mark_all_read(self, user_id):
        for d in self._docs.values():
            if d["user_id"] == user_id and d["read_at"] is None:
                d["read_at"] = "2026-06-20T00:00:00+00:00"


@pytest.mark.asyncio
async def test_list_is_recipient_scoped_with_fresh_unread():
    n = _FakeNotifs()
    await notification.notify_event(
        "u1", "c1", "new_message", notifications=n, subject="Hi"
    )
    await notification.notify_event("u1", "c1", "shortlisted", notifications=n)
    await notification.notify_event("u2", "c1", "new_message", notifications=n)
    out = await notification.list_notifications("u1", notifications=n)
    assert out["total"] == 2 and out["unread_count"] == 2
    assert {x["kind"] for x in out["notifications"]} == {"new_message", "shortlisted"}


@pytest.mark.asyncio
async def test_unread_only_filter_and_page_size_cap():
    n = _FakeNotifs()
    await notification.notify_event("u1", None, "new_message", notifications=n)
    out = await notification.list_notifications(
        "u1", notifications=n, unread_only=True, page_size=999
    )
    assert out["page_size"] == 50 and out["total"] == 1


@pytest.mark.asyncio
async def test_mark_read_returns_fresh_count_and_scopes():
    n = _FakeNotifs()
    await notification.notify_event("u1", None, "new_message", notifications=n)
    out = await notification.list_notifications("u1", notifications=n)
    nid = out["notifications"][0]["id"]
    remaining = await notification.mark_read("u1", nid, notifications=n)
    assert remaining == 0
    with pytest.raises(NotFoundError):  # not the caller's row
        await notification.mark_read("u2", nid, notifications=n)


@pytest.mark.asyncio
async def test_notify_event_is_idempotent_on_dedup_key():
    n = _FakeNotifs()
    a = await notification.notify_event(
        "u1", None, "new_message", notifications=n, dedup_key="msg-1"
    )
    b = await notification.notify_event(
        "u1", None, "new_message", notifications=n, dedup_key="msg-1"
    )
    assert a is True and b is False  # redelivered trigger is a no-op
    assert (await notification.list_notifications("u1", notifications=n))["total"] == 1
