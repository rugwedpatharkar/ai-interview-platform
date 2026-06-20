"""SchedulingService over gRPC-web: auth, propose/choose CAS, ICS, list."""

import struct

import httpx
import pytest
from lib.grpcweb import GrpcWebASGI
from lib.security import TokenService

from app.routes.pb import scheduling_pb2, scheduling_pb2_grpc
from app.routes.scheduling import SchedulingServicer

_SECRET = "test-secret-" + "x" * 32
_SVC = "/admin.scheduling.v1.SchedulingService"
_SLOT = "2030-01-01T10:00:00+00:00"
_SLOT2 = "2030-01-02T11:00:00+00:00"


class _FakeApplications:
    def __init__(self, app):
        self._app = app

    async def get(self, aid):
        return self._app


class _FakeSlots:
    def __init__(self):
        self.docs = []

    async def create(self, slots):
        self.docs.append(slots.model_dump())
        return "s"

    async def get_open_for_application(self, aid):
        return next(
            (
                d
                for d in reversed(self.docs)
                if d["application_id"] == aid and d["status"] == "open"
            ),
            None,
        )

    async def supersede_open(self, aid):
        for d in self.docs:
            if d["application_id"] == aid and d["status"] == "open":
                d["status"] = "superseded"


class _FakeBookings:
    def __init__(self):
        self.docs = {}

    async def create(self, b):
        d = b.model_dump()
        self.docs[d["application_id"]] = d
        return "b"

    async def get_by_application(self, aid):
        return self.docs.get(aid)

    async def choose_if_proposed(
        self, aid, *, expected_version, chosen_start_at, duration_minutes, location
    ):
        d = self.docs.get(aid)
        if d is None or d["status"] != "proposed" or d["version"] != expected_version:
            return False
        d.update(
            status="booked",
            chosen_start_at=chosen_start_at,
            chosen_duration_minutes=duration_minutes,
            location=location,
            version=d["version"] + 1,
        )
        return True

    async def cancel_if(self, aid, *, by):
        d = self.docs.get(aid)
        if d is None or d["status"] not in ("proposed", "booked"):
            return False
        d.update(status="cancelled", cancelled_by=by, version=d["version"] + 1)
        return True

    async def reset_to_proposed(self, aid, *, location, note):
        d = self.docs.get(aid)
        if d is None:
            return False
        d.update(status="proposed", chosen_start_at=None, version=d["version"] + 1)
        return True

    async def list_for_candidate(self, cuid, *, skip=0, limit=20):
        rows = [d for d in self.docs.values() if d["candidate_user_id"] == cuid]
        return rows[skip : skip + limit]

    async def count_for_candidate(self, cuid):
        return len([d for d in self.docs.values() if d["candidate_user_id"] == cuid])


def _application(state="interview_pending"):
    return {
        "_id": "app1",
        "comp_id": "c1",
        "job_id": "j1",
        "candidate_user_id": "cand1",
        "state": state,
    }


def _app(application=None):
    grpc_app = GrpcWebASGI()
    apps = _FakeApplications(application or _application())
    scheduling_pb2_grpc.add_SchedulingServiceServicer_to_server(
        SchedulingServicer(
            applications=apps,
            slots=_FakeSlots(),
            bookings=_FakeBookings(),
            tokens=TokenService(_SECRET),
        ),
        grpc_app,
    )
    return grpc_app


def _frame(b):
    return b"\x00" + struct.pack(">I", len(b)) + b


def _ds(body):
    data, status, i = None, None, 0
    while i + 5 <= len(body):
        flag = body[i]
        (n,) = struct.unpack(">I", body[i + 1 : i + 5])
        p = body[i + 5 : i + 5 + n]
        if flag & 0x80:
            for line in p.decode().replace("\r\n", "\n").splitlines():
                if line.startswith("grpc-status:"):
                    status = int(line.split(":", 1)[1])
        else:
            data = p
        i += 5 + n
    return data, status


async def _call(app, method, req, *, metadata=None):
    transport = httpx.ASGITransport(app=app)
    headers = {"content-type": "application/grpc-web+proto", **(metadata or {})}
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as client:
        return await client.post(
            f"{_SVC}/{method}", content=_frame(req.SerializeToString()), headers=headers
        )


def _manager(uid="rec1"):
    token = TokenService(_SECRET).access_token(uid, "recruiter", "c1", "j1")
    return {"authorization": f"Bearer {token}"}


def _candidate(uid="cand1"):
    token = TokenService(_SECRET).access_token(uid, "candidate", None, "j1")
    return {"authorization": f"Bearer {token}"}


def _propose_req():
    return scheduling_pb2.ProposeSlotsRequest(
        application_id="app1",
        slots=[
            scheduling_pb2.ProposedSlot(start_at=_SLOT, duration_minutes=60),
            scheduling_pb2.ProposedSlot(start_at=_SLOT2, duration_minutes=45),
        ],
        location="Google Meet",
    )


@pytest.mark.asyncio
async def test_propose_requires_auth():
    resp = await _call(_app(), "ProposeSlots", _propose_req())
    _, status = _ds(resp.content)
    assert status == 16  # UNAUTHENTICATED


@pytest.mark.asyncio
async def test_propose_then_choose_books_over_the_wire():
    app = _app()
    resp = await _call(app, "ProposeSlots", _propose_req(), metadata=_manager())
    data, status = _ds(resp.content)
    assert status == 0
    dto = scheduling_pb2.ScheduleDTO.FromString(data)
    assert dto.status == "proposed" and len(dto.slots) == 2

    resp2 = await _call(
        app,
        "ChooseSlot",
        scheduling_pb2.ChooseSlotRequest(application_id="app1", start_at=_SLOT),
        metadata=_candidate(),
    )
    data2, status2 = _ds(resp2.content)
    assert status2 == 0
    assert scheduling_pb2.ScheduleDTO.FromString(data2).status == "booked"


@pytest.mark.asyncio
async def test_choose_lost_race_is_already_exists():
    app = _app()
    await _call(app, "ProposeSlots", _propose_req(), metadata=_manager())
    pick = scheduling_pb2.ChooseSlotRequest(application_id="app1", start_at=_SLOT)
    await _call(app, "ChooseSlot", pick, metadata=_candidate())  # first wins
    resp = await _call(app, "ChooseSlot", pick, metadata=_candidate())  # stale -> lose
    _, status = _ds(resp.content)
    assert status == 6  # ALREADY_EXISTS


@pytest.mark.asyncio
async def test_propose_not_ready_is_invalid_argument():
    app = _app(_application(state="aptitude_pending"))
    resp = await _call(app, "ProposeSlots", _propose_req(), metadata=_manager())
    _, status = _ds(resp.content)
    assert status == 3  # INVALID_ARGUMENT


@pytest.mark.asyncio
async def test_get_ics_after_booking():
    app = _app()
    await _call(app, "ProposeSlots", _propose_req(), metadata=_manager())
    await _call(
        app,
        "ChooseSlot",
        scheduling_pb2.ChooseSlotRequest(application_id="app1", start_at=_SLOT),
        metadata=_candidate(),
    )
    resp = await _call(
        app,
        "GetIcs",
        scheduling_pb2.GetIcsRequest(application_id="app1"),
        metadata=_candidate(),
    )
    data, status = _ds(resp.content)
    assert status == 0
    out = scheduling_pb2.IcsResponse.FromString(data)
    assert "BEGIN:VCALENDAR" in out.content
    assert "UID:aptura-interview-app1@aptura" in out.content


@pytest.mark.asyncio
async def test_list_candidate_interviews():
    app = _app()
    await _call(app, "ProposeSlots", _propose_req(), metadata=_manager())
    resp = await _call(
        app,
        "ListCandidateInterviews",
        scheduling_pb2.ListCandidateRequest(),
        metadata=_candidate(),
    )
    data, status = _ds(resp.content)
    assert status == 0
    out = scheduling_pb2.BookingListResponse.FromString(data)
    assert out.total == 1 and len(out.bookings) == 1
