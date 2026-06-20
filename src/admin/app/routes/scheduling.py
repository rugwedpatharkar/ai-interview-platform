"""gRPC SchedulingService route layer — a thin adapter over app/resources/scheduling.

Authenticates from the access token, maps proto<->resource, and translates app.errors to
gRPC status via routes/auth._STATUS. All authz/CAS/gate logic stays in the resource.
"""

import grpc
from lib.logging import bind_ids, get_logger, log_context
from lib.observability import counter, span

from app.errors import AuthDomainError
from app.resources import scheduling as sched
from app.routes.auth import _STATUS, caller_identity
from app.routes.pb import scheduling_pb2, scheduling_pb2_grpc

log = get_logger(component="scheduling.routes")

_grpc_total = counter("admin_grpc_requests_total", "gRPC requests received", ["method"])
_grpc_errors = counter(
    "admin_grpc_errors_total",
    "gRPC requests that resulted in a domain error",
    ["method"],
)


def _iso(value):
    if not value:
        return ""
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _slot_pb(slot):
    return scheduling_pb2.ProposedSlot(
        start_at=_iso(slot["start_at"]), duration_minutes=slot["duration_minutes"]
    )


def _schedule_response(dto):
    return scheduling_pb2.ScheduleDTO(
        application_id=dto["application_id"],
        status=dto["status"],
        slots=[_slot_pb(s) for s in dto["slots"]],
        chosen_start_at=_iso(dto["chosen_start_at"]),
        chosen_duration_minutes=dto["chosen_duration_minutes"],
        location=dto["location"],
        note=dto["note"],
        cancelled_by=dto["cancelled_by"],
    )


def _booking_list_response(result):
    return scheduling_pb2.BookingListResponse(
        bookings=[
            scheduling_pb2.BookingDTO(
                application_id=r["application_id"],
                status=r["status"],
                chosen_start_at=_iso(r["chosen_start_at"]),
                chosen_duration_minutes=r["chosen_duration_minutes"],
                location=r["location"],
            )
            for r in result["bookings"]
        ],
        page=result["page"],
        page_size=result["page_size"],
        total=result["total"],
    )


def _req_slots(request):
    return [
        {"start_at": s.start_at, "duration_minutes": s.duration_minutes}
        for s in request.slots
    ]


class SchedulingServicer(scheduling_pb2_grpc.SchedulingServiceServicer):
    def __init__(
        self, *, applications, slots, bookings, tokens, notifications=None, limiter=None
    ):
        self._applications = applications
        self._slots = slots
        self._bookings = bookings
        self._tokens = tokens
        self._notifications = notifications
        self._limiter = limiter

    async def _abort(self, context, exc, method):
        log.warning(
            "scheduling.routes.{}: {} code={}",
            method,
            exc,
            _STATUS.get(type(exc), grpc.StatusCode.INTERNAL).name,
        )
        _grpc_errors.labels(method=method).inc()
        await context.abort(_STATUS.get(type(exc), grpc.StatusCode.INTERNAL), str(exc))

    def _ctx(self, method, application_id=""):
        _grpc_total.labels(method=method).inc()
        return log_context(
            log,
            f"scheduling.{method}",
            **bind_ids(application_id=application_id),
        ), span(f"scheduling.{method}", application_id=application_id)

    async def _do_propose(self, request, context, fn, method):
        lc, sp = self._ctx(method, request.application_id)
        async with lc, sp:
            try:
                identity = await caller_identity(context, self._tokens)
                dto = await fn(
                    identity,
                    request.application_id,
                    _req_slots(request),
                    request.location,
                    request.note,
                    applications=self._applications,
                    slots_repo=self._slots,
                    bookings=self._bookings,
                    notifications=self._notifications,
                    limiter=self._limiter,
                )
                return _schedule_response(dto)
            except AuthDomainError as exc:
                await self._abort(context, exc, method)

    async def ProposeSlots(self, request, context):
        return await self._do_propose(
            request, context, sched.propose_slots, "ProposeSlots"
        )

    async def Reschedule(self, request, context):
        return await self._do_propose(request, context, sched.reschedule, "Reschedule")

    async def GetSchedule(self, request, context):
        lc, sp = self._ctx("GetSchedule", request.application_id)
        async with lc, sp:
            try:
                identity = await caller_identity(context, self._tokens)
                dto = await sched.get_schedule(
                    identity,
                    request.application_id,
                    applications=self._applications,
                    slots_repo=self._slots,
                    bookings=self._bookings,
                )
                return _schedule_response(dto)
            except AuthDomainError as exc:
                await self._abort(context, exc, "GetSchedule")

    async def ChooseSlot(self, request, context):
        lc, sp = self._ctx("ChooseSlot", request.application_id)
        async with lc, sp:
            try:
                identity = await caller_identity(context, self._tokens)
                dto = await sched.choose_slot(
                    identity,
                    request.application_id,
                    request.start_at,
                    applications=self._applications,
                    slots_repo=self._slots,
                    bookings=self._bookings,
                    notifications=self._notifications,
                    limiter=self._limiter,
                )
                return _schedule_response(dto)
            except AuthDomainError as exc:
                await self._abort(context, exc, "ChooseSlot")

    async def Cancel(self, request, context):
        lc, sp = self._ctx("Cancel", request.application_id)
        async with lc, sp:
            try:
                identity = await caller_identity(context, self._tokens)
                dto = await sched.cancel(
                    identity,
                    request.application_id,
                    applications=self._applications,
                    slots_repo=self._slots,
                    bookings=self._bookings,
                    notifications=self._notifications,
                    limiter=self._limiter,
                )
                return _schedule_response(dto)
            except AuthDomainError as exc:
                await self._abort(context, exc, "Cancel")

    async def GetIcs(self, request, context):
        lc, sp = self._ctx("GetIcs", request.application_id)
        async with lc, sp:
            try:
                identity = await caller_identity(context, self._tokens)
                out = await sched.get_ics(
                    identity,
                    request.application_id,
                    applications=self._applications,
                    bookings=self._bookings,
                )
                return scheduling_pb2.IcsResponse(
                    filename=out["filename"], content=out["content"]
                )
            except AuthDomainError as exc:
                await self._abort(context, exc, "GetIcs")

    async def ListCandidateInterviews(self, request, context):
        lc, sp = self._ctx("ListCandidateInterviews")
        async with lc, sp:
            try:
                identity = await caller_identity(context, self._tokens)
                result = await sched.list_candidate_interviews(
                    identity,
                    bookings=self._bookings,
                    page=request.page,
                    page_size=request.page_size,
                )
                return _booking_list_response(result)
            except AuthDomainError as exc:
                await self._abort(context, exc, "ListCandidateInterviews")

    async def ListCompanyBookings(self, request, context):
        lc, sp = self._ctx("ListCompanyBookings")
        async with lc, sp:
            try:
                identity = await caller_identity(context, self._tokens)
                result = await sched.list_company_bookings(
                    identity,
                    request.status,
                    bookings=self._bookings,
                    page=request.page,
                    page_size=request.page_size,
                )
                return _booking_list_response(result)
            except AuthDomainError as exc:
                await self._abort(context, exc, "ListCompanyBookings")
