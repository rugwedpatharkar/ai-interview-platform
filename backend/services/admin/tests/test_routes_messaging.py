import grpc
import pytest
from lib.security import TokenService

from app.routes.messaging import MessagingServicer
from app.routes.pb import messaging_pb2

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

    async def get_or_create(self, application_id, **kw):
        d = self._docs.get(application_id)
        if d is None:
            d = {
                "_id": f"t_{application_id}",
                "application_id": application_id,
                "candidate_user_id": kw["candidate_user_id"],
                "comp_id": kw["comp_id"],
                "recruiter_user_id": "",
                "job_title": kw["job_title"],
                "company_name": kw["company_name"],
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
        self._docs[application_id][
            "unread_candidate" if side == "candidate" else "unread_recruiter"
        ] = 0

    async def list_for_comp(self, comp_id, *, skip, limit):
        return [d for d in self._docs.values() if d["comp_id"] == comp_id][
            skip : skip + limit
        ]

    async def count_for_comp(self, comp_id):
        return sum(1 for d in self._docs.values() if d["comp_id"] == comp_id)

    async def list_for_candidate(self, candidate_user_id, *, skip, limit):
        return [
            d
            for d in self._docs.values()
            if d["candidate_user_id"] == candidate_user_id
        ][skip : skip + limit]

    async def count_for_candidate(self, candidate_user_id):
        return sum(
            1
            for d in self._docs.values()
            if d["candidate_user_id"] == candidate_user_id
        )


class _Messages:
    def __init__(self):
        self._docs = []

    async def add(self, message):
        d = message.model_dump()
        d["_id"] = str(len(self._docs) + 1)
        self._docs.append(d)
        return d["_id"]

    async def list_by_thread(self, thread_id, *, skip, limit):
        return [d for d in self._docs if d["thread_id"] == thread_id][
            skip : skip + limit
        ]

    async def count_by_thread(self, thread_id):
        return sum(1 for d in self._docs if d["thread_id"] == thread_id)

    async def mark_other_side_read(self, application_id, reader_side):
        pass


def _servicer():
    return MessagingServicer(
        applications=_Apps(),
        threads=_Threads(),
        messages=_Messages(),
        jobs=_Jobs(),
        companies=_Companies(),
        tokens=TokenService(SECRET),
    )


def _md(uid, role, comp_id=None):
    token = TokenService(SECRET).access_token(
        sub=uid, role=role, comp_id=comp_id, jti="j1"
    )
    return FakeContext(metadata=[("authorization", f"Bearer {token}")])


@pytest.mark.asyncio
async def test_send_then_list_messages_roundtrip():
    svc = _servicer()
    sent = await svc.SendMessage(
        messaging_pb2.SendMessageRequest(application_id="a1", body="hello"),
        _md("rec1", "recruiter", "c1"),
    )
    assert sent.sender_role == "recruiter" and sent.body == "hello"
    listed = await svc.ListMessages(
        messaging_pb2.ListMessagesRequest(application_id="a1"),
        _md("cand1", "candidate"),
    )
    assert listed.total == 1 and listed.messages[0].body == "hello"


@pytest.mark.asyncio
async def test_send_empty_body_invalid_argument():
    with pytest.raises(_Aborted) as ei:
        await _servicer().SendMessage(
            messaging_pb2.SendMessageRequest(application_id="a1", body="  "),
            _md("cand1", "candidate"),
        )
    assert ei.value.code == grpc.StatusCode.INVALID_ARGUMENT


@pytest.mark.asyncio
async def test_non_owner_candidate_denied():
    with pytest.raises(_Aborted) as ei:
        await _servicer().SendMessage(
            messaging_pb2.SendMessageRequest(application_id="a1", body="hi"),
            _md("intruder", "candidate"),
        )
    assert ei.value.code == grpc.StatusCode.PERMISSION_DENIED
