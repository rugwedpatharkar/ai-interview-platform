"""Editable interview rubrics (recruiter-facing) — comp-scoped CRUD.

A rubric is a reusable named set of competencies that can later seed an interview
blueprint. All operations are manager-only and scoped to the caller's company.
"""

from lib.logging import get_logger
from lib.schemas import Role

from app.errors import ForbiddenError, NotFoundError, ValidationError
from app.model.rubric import Rubric, RubricCompetency

log = get_logger(component="rubric.resources")

_MANAGER_ROLES = {Role.company_admin.value, Role.recruiter.value}


def _require_manager(identity):
    if identity["role"] not in _MANAGER_ROLES:
        raise ForbiddenError("Only company users can manage rubrics")


def _comps(competencies):
    if not competencies:
        raise ValidationError("A rubric needs at least one competency")
    return [RubricCompetency(**c).model_dump() for c in competencies]


def _to_response(doc):
    return {
        "id": str(doc["_id"]),
        "name": doc.get("name", ""),
        "competencies": doc.get("competencies", []),
    }


async def create_rubric(identity, name, competencies, *, rubrics):
    _require_manager(identity)
    comps = _comps(competencies)
    rubric_id = await rubrics.insert(
        Rubric(comp_id=identity["comp_id"], name=name, competencies=comps)
    )
    return {"id": rubric_id, "name": name, "competencies": comps}


async def list_rubrics(identity, *, rubrics):
    _require_manager(identity)
    return [_to_response(d) for d in await rubrics.list_by_comp(identity["comp_id"])]


async def update_rubric(identity, rubric_id, name, competencies, *, rubrics):
    _require_manager(identity)
    comps = _comps(competencies)
    fields = {"name": name, "competencies": comps}
    if await rubrics.update_scoped(rubric_id, identity["comp_id"], fields) == 0:
        raise NotFoundError("Rubric not found")
    return {"id": rubric_id, "name": name, "competencies": comps}


async def delete_rubric(identity, rubric_id, *, rubrics):
    _require_manager(identity)
    if await rubrics.delete_scoped(rubric_id, identity["comp_id"]) == 0:
        raise NotFoundError("Rubric not found")
    return {"ok": True}
