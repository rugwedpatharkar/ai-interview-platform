"""Rubric CRUD: comp-scoped create/list/update/delete; cross-tenant denied."""

import pytest
from bson import ObjectId

from app.errors import ForbiddenError, NotFoundError, ValidationError
from app.resources import rubric

MGR = {"id": "r1", "role": "recruiter", "comp_id": "c1"}
OTHER = {"id": "r2", "role": "recruiter", "comp_id": "c2"}
CAND = {"id": "u1", "role": "candidate", "comp_id": ""}


class _FakeRubrics:
    def __init__(self):
        self._docs = {}
        self._seq = 0

    async def insert(self, model):
        self._seq += 1
        rid = str(self._seq)
        doc = model.model_dump()
        doc["_id"] = rid
        self._docs[rid] = doc
        return rid

    async def list_by_comp(self, comp_id):
        return [d for d in self._docs.values() if d["comp_id"] == comp_id]

    async def update_scoped(self, rubric_id, comp_id, fields):
        d = self._docs.get(rubric_id)
        if d is None or d["comp_id"] != comp_id:
            return 0
        d.update(fields)
        return 1

    async def delete_scoped(self, rubric_id, comp_id):
        d = self._docs.get(rubric_id)
        if d is None or d["comp_id"] != comp_id:
            return 0
        del self._docs[rubric_id]
        return 1


@pytest.mark.asyncio
async def test_create_and_list_scoped():
    repo = _FakeRubrics()
    created = await rubric.create_rubric(
        MGR, "Backend", [{"name": "python", "weight": 2.0}], rubrics=repo
    )
    assert created["name"] == "Backend"
    assert len(await rubric.list_rubrics(MGR, rubrics=repo)) == 1
    assert await rubric.list_rubrics(OTHER, rubrics=repo) == []  # other tenant


@pytest.mark.asyncio
async def test_update_cross_tenant_denied():
    repo = _FakeRubrics()
    created = await rubric.create_rubric(
        MGR, "Backend", [{"name": "python"}], rubrics=repo
    )
    with pytest.raises(NotFoundError):
        await rubric.update_rubric(
            OTHER, created["id"], "Hacked", [{"name": "python"}], rubrics=repo
        )


@pytest.mark.asyncio
async def test_delete_scoped_and_cross_tenant():
    repo = _FakeRubrics()
    created = await rubric.create_rubric(
        MGR, "Backend", [{"name": "python"}], rubrics=repo
    )
    with pytest.raises(NotFoundError):
        await rubric.delete_rubric(OTHER, created["id"], rubrics=repo)
    assert await rubric.delete_rubric(MGR, created["id"], rubrics=repo) == {"ok": True}


@pytest.mark.asyncio
async def test_rubric_manager_only():
    with pytest.raises(ForbiddenError):
        await rubric.list_rubrics(CAND, rubrics=_FakeRubrics())


@pytest.mark.asyncio
async def test_create_empty_competencies_rejected():
    with pytest.raises(ValidationError):
        await rubric.create_rubric(MGR, "Empty", [], rubrics=_FakeRubrics())


@pytest.mark.asyncio
async def test_update_empty_competencies_rejected():
    repo = _FakeRubrics()
    created = await rubric.create_rubric(
        MGR, "Backend", [{"name": "python"}], rubrics=repo
    )
    with pytest.raises(ValidationError):
        await rubric.update_rubric(MGR, created["id"], "Backend", [], rubrics=repo)


def test_rubric_competency_rejects_negative_weight():
    from pydantic import ValidationError as PydanticValidationError

    from app.model.rubric import RubricCompetency

    with pytest.raises(PydanticValidationError):
        RubricCompetency(name="python", weight=-1.0)


class _NoOpResult:
    matched_count = 1
    modified_count = 0  # fields unchanged -> a real no-op, but the doc WAS matched


class _NoOpCol:
    async def update_one(self, filt, update):
        return _NoOpResult()


class _NoOpDB:
    def __getitem__(self, name):
        return _NoOpCol()


async def test_update_scoped_reports_matched_not_modified():
    # A no-op update still matched the scoped doc, so the resource must not 404 an
    # idempotent save (modified_count would be 0 here).
    from app.infra.repositories.rubrics import RubricRepository

    repo = RubricRepository(_NoOpDB())
    assert await repo.update_scoped(str(ObjectId()), "c1", {"name": "x"}) == 1
