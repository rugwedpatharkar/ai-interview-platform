"""gRPC RubricService routes — thin adapter over resources/rubric."""

import grpc
from lib.logging import get_logger

from app.errors import AuthDomainError
from app.resources import rubric as rubric_res
from app.routes.auth import _STATUS, caller_identity
from app.routes.pb import rubric_pb2, rubric_pb2_grpc

log = get_logger(component="rubric.routes")


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

    async def _abort(self, context, exc):
        await context.abort(_STATUS.get(type(exc), grpc.StatusCode.INTERNAL), str(exc))

    async def CreateRubric(self, request, context):
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
            await self._abort(context, exc)

    async def ListRubrics(self, request, context):
        try:
            identity = await caller_identity(context, self._tokens)
            items = await rubric_res.list_rubrics(identity, rubrics=self._rubrics)
            return rubric_pb2.RubricList(rubrics=[_to_proto(r) for r in items])
        except AuthDomainError as exc:
            await self._abort(context, exc)

    async def UpdateRubric(self, request, context):
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
            await self._abort(context, exc)

    async def DeleteRubric(self, request, context):
        try:
            identity = await caller_identity(context, self._tokens)
            await rubric_res.delete_rubric(identity, request.id, rubrics=self._rubrics)
            return rubric_pb2.DeleteRubricResponse(ok=True)
        except AuthDomainError as exc:
            await self._abort(context, exc)
