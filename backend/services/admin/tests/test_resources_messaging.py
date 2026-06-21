"""resources/messaging — application-anchored chat: authz, unread bookkeeping, DTO."""

import pytest

from app.errors import ForbiddenError, NotFoundError, ValidationError
from app.resources import messaging

CAND = {"id": "cand1", "role": "candidate", "comp_id": None}
MGR = {"id": "rec1", "role": "recruiter", "comp_id": "c1"}
OTHER_CAND = {"id": "candX", "role": "candidate", "comp_id": None}
OTHER_MGR = {"id": "recX", "role": "recruiter", "comp_id": "c2"}


class _Apps:
    def __init__(self):
        self._docs = {
            "a1": {
                "_id": "a1",
                "comp_id": "c1",
                "candidate_user_id": "cand1",
                "job_id": "j1",
            }
        }

    async def get(self, application_id):
        return self._docs.get(application_id)


class _Jobs:
    async def get_by_id(self, job_id):
        return {"_id": job_id, "title": "Engineer"}


class _Companies:
    async def names_by_ids(self, comp_ids):
        return dict.fromkeys(comp_ids, "Acme")


class _Threads:
    def __init__(self):
        self._docs = {}

    async def get(self, application_id):
        return self._docs.get(application_id)

    async def get_or_create(
        self, application_id, *, comp_id, candidate_user_id, job_title, company_name
    ):
        d = self._docs.get(application_id)
        if d is None:
            d = {
                "_id": f"t_{application_id}",
                "application_id": application_id,
                "comp_id": comp_id,
                "candidate_user_id": candidate_user_id,
                "recruiter_user_id": "",
                "job_title": job_title,
                "company_name": company_name,
                "last_message_at": None,
                "last_snippet": "",
                "unread_candidate": 0,
                "unread_recruiter": 0,
            }
            self._docs[application_id] = d
        return d

    async def record_send(
        self,
        application_id,
        *,
        last_message_at,
        last_snippet,
        recipient,
        recruiter_user_id,
    ):
        d = self._docs[application_id]
        d["last_message_at"] = last_message_at
        d["last_snippet"] = last_snippet
        d["unread_candidate" if recipient == "candidate" else "unread_recruiter"] += 1
        if recruiter_user_id:
            d["recruiter_user_id"] = recruiter_user_id

    async def mark_read(self, application_id, side):
        d = self._docs[application_id]
        d["unread_candidate" if side == "candidate" else "unread_recruiter"] = 0

    async def list_for_candidate(self, candidate_user_id, *, skip, limit):
        rows = [
            d
            for d in self._docs.values()
            if d["candidate_user_id"] == candidate_user_id
        ]
        return rows[skip : skip + limit]

    async def count_for_candidate(self, candidate_user_id):
        return sum(
            1
            for d in self._docs.values()
            if d["candidate_user_id"] == candidate_user_id
        )

    async def list_for_comp(self, comp_id, *, skip, limit):
        rows = [d for d in self._docs.values() if d["comp_id"] == comp_id]
        return rows[skip : skip + limit]

    async def count_for_comp(self, comp_id):
        return sum(1 for d in self._docs.values() if d["comp_id"] == comp_id)


class _Messages:
    def __init__(self):
        self._docs = []
        self._seq = 0

    async def add(self, message):
        self._seq += 1
        d = message.model_dump()
        d["_id"] = str(self._seq)
        self._docs.append(d)
        return d["_id"]

    async def list_by_thread(self, thread_id, *, skip, limit):
        rows = [d for d in self._docs if d["thread_id"] == thread_id]
        return rows[skip : skip + limit]

    async def count_by_thread(self, thread_id):
        return sum(1 for d in self._docs if d["thread_id"] == thread_id)

    async def mark_other_side_read(self, application_id, reader_side):
        for d in self._docs:
            if (
                d["application_id"] == application_id
                and d["sender_role"] != reader_side
            ):
                d["read_at"] = "t"


def _deps():
    return {
        "applications": _Apps(),
        "threads": _Threads(),
        "messages": _Messages(),
        "jobs": _Jobs(),
        "companies": _Companies(),
    }


@pytest.mark.asyncio
async def test_send_sets_sender_from_token_and_bumps_recipient():
    d = _deps()
    out = await messaging.send_message(MGR, "a1", "  hello  ", **d)
    assert out["sender_role"] == "recruiter" and out["sender_user_id"] == "rec1"
    assert out["body"] == "hello"  # trimmed
    thread = await d["threads"].get("a1")
    assert thread["unread_candidate"] == 1 and thread["unread_recruiter"] == 0
    assert thread["recruiter_user_id"] == "rec1"  # set on first recruiter send


@pytest.mark.asyncio
async def test_send_rejects_empty_and_oversized():
    d = _deps()
    with pytest.raises(ValidationError):
        await messaging.send_message(CAND, "a1", "   ", **d)
    with pytest.raises(ValidationError):
        await messaging.send_message(CAND, "a1", "x" * (messaging.MAX_BODY + 1), **d)


@pytest.mark.asyncio
async def test_non_owner_candidate_denied():
    with pytest.raises(ForbiddenError):
        await messaging.send_message(OTHER_CAND, "a1", "hi", **_deps())


@pytest.mark.asyncio
async def test_wrong_tenant_recruiter_not_found():
    with pytest.raises(NotFoundError):
        await messaging.send_message(OTHER_MGR, "a1", "hi", **_deps())


@pytest.mark.asyncio
async def test_list_threads_scoped_and_dto():
    d = _deps()
    await messaging.send_message(MGR, "a1", "hello", **d)
    out = await messaging.list_threads(CAND, **d)  # candidate sees their thread
    assert out["total"] == 1
    t = out["threads"][0]
    assert t["job_title"] == "Engineer" and t["company_name"] == "Acme"
    assert t["unread"] == 1 and t["last_snippet"] == "hello"
    assert "unread_candidate" not in t  # opposite-side counter scrubbed


@pytest.mark.asyncio
async def test_mark_read_zeroes_caller_side():
    d = _deps()
    await messaging.send_message(MGR, "a1", "hello", **d)  # candidate now unread=1
    out = await messaging.mark_read(CAND, "a1", **d)
    assert out["unread"] == 0
    thread = await d["threads"].get("a1")
    assert thread["unread_candidate"] == 0
