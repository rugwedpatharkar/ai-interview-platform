"""gRPC RubricService routes — thin adapter over resources/rubric."""

from lib.errors import to_grpc_status
from lib.logging import bind_ids, get_logger, log_context
from lib.observability import counter, span

from app.errors import AuthDomainError
from app.resources import rubric as rubric_res
from app.routes.auth import caller_identity
from app.routes.pb import rubric_pb2, rubric_pb2_grpc

log = get_logger(component="rubric.routes")

_grpc_total = counter("admin_grpc_requests_total", "gRPC requests received", ["method"])
_grpc_errors = counter(
    "admin_grpc_errors_total",
    "gRPC requests that resulted in a domain error",
    ["method"],
)


def _comps_in(proto_comps):
    return [{"name": c.name, "weight": c.weight} for c in proto_comps]


def _to_proto(r):
    return rubric_pb2.Rubric(
        id=r["id"],
        name=r["name"],
        competencies=[
            rubric_pb2.Competency(name=c["name"], weight=c.get("weight", 1.0))
            for c in r["competencies"]
        ],
    )


class RubricServicer(rubric_pb2_grpc.RubricServiceServicer):
    def __init__(self, *, rubrics, tokens):
        self._rubrics = rubrics
        self._tokens = tokens

    async def _abort(self, context, exc, method="unknown"):
        code, msg = to_grpc_status(exc)
        log.warning(
            "rubric.routes.{}: {} code={}",
            method,
            exc,
            code.name,
        )
        _grpc_errors.labels(method=method).inc()
        await context.abort(code, msg)

    async def CreateRubric(self, request, context):
        _grpc_total.labels(method="CreateRubric").inc()
        async with log_context(log, "rubric.CreateRubric"), span("rubric.CreateRubric"):
            try:
                identity = await caller_identity(context, self._tokens)
                r = await rubric_res.create_rubric(
                    identity,
                    request.name,
                    _comps_in(request.competencies),
                    rubrics=self._rubrics,
                )
                return _to_proto(r)
            except AuthDomainError as exc:
                await self._abort(context, exc, "CreateRubric")

    async def ListRubrics(self, request, context):
        _grpc_total.labels(method="ListRubrics").inc()
        async with log_context(log, "rubric.ListRubrics"), span("rubric.ListRubrics"):
            try:
                identity = await caller_identity(context, self._tokens)
                items = await rubric_res.list_rubrics(identity, rubrics=self._rubrics)
                return rubric_pb2.RubricList(rubrics=[_to_proto(r) for r in items])
            except AuthDomainError as exc:
                await self._abort(context, exc, "ListRubrics")

    async def UpdateRubric(self, request, context):
        _grpc_total.labels(method="UpdateRubric").inc()
        async with (
            log_context(log, "rubric.UpdateRubric", **bind_ids(rubric_id=request.id)),
            span("rubric.UpdateRubric", rubric_id=request.id),
        ):
            try:
                identity = await caller_identity(context, self._tokens)
                r = await rubric_res.update_rubric(
                    identity,
                    request.id,
                    request.name,
                    _comps_in(request.competencies),
                    rubrics=self._rubrics,
                )
                return _to_proto(r)
            except AuthDomainError as exc:
                await self._abort(context, exc, "UpdateRubric")

    async def DeleteRubric(self, request, context):
        _grpc_total.labels(method="DeleteRubric").inc()
        async with (
            log_context(log, "rubric.DeleteRubric", **bind_ids(rubric_id=request.id)),
            span("rubric.DeleteRubric", rubric_id=request.id),
        ):
            try:
                identity = await caller_identity(context, self._tokens)
                await rubric_res.delete_rubric(
                    identity, request.id, rubrics=self._rubrics
                )
                return rubric_pb2.DeleteRubricResponse(ok=True)
            except AuthDomainError as exc:
                await self._abort(context, exc, "DeleteRubric")
