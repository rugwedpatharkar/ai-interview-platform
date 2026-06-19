from datetime import UTC, datetime, timedelta

import pytest
from pymongo.errors import DuplicateKeyError

from app.errors import ConflictError, ForbiddenError, ValidationError
from app.model.application import Application
from app.resources import aptitude

_IDENTITY_ORDER = lambda n: list(range(n))  # noqa: E731 — deterministic permute for tests


def _identity(user_id="u1"):
    return {"id": user_id, "role": "candidate", "comp_id": None}


def _bank(correct=(0, 1, 2)):
    return {
        "job_id": "j1",
        "questions": [
            {
                "question": f"q{i}",
                "options": ["a", "b", "c", "d"],
                "correct_index": c,
                "topic": "python",
            }
            for i, c in enumerate(correct)
        ],
    }


async def _seed_application(fakes, state="aptitude_pending", candidate="u1"):
    return await fakes["applications"].insert(
        Application(comp_id="c1", job_id="j1", candidate_user_id=candidate, state=state)
    )


def _seed_job(fakes, threshold=60, time_limit_min=20):
    fakes["jobs"]._docs["j1"] = {
        "_id": "j1",
        "comp_id": "c1",
        "aptitude_config": {
            "pass_threshold": threshold,
            "time_limit_min": time_limit_min,
        },
    }


def _seed_delivery(fakes, app_id, order=(0, 1, 2), minutes_ago=0):
    fakes["deliveries"]._docs[app_id] = {
        "application_id": app_id,
        "comp_id": "c1",
        "job_id": "j1",
        "order": list(order),
        "delivered_at": datetime.now(UTC) - timedelta(minutes=minutes_ago),
    }


async def test_get_test_strips_answer_key(fakes):
    app_id = await _seed_application(fakes)
    fakes["banks"]._by_job["j1"] = _bank()
    test = await aptitude.get_aptitude_test(
        _identity(),
        app_id,
        applications=fakes["applications"],
        banks=fakes["banks"],
        deliveries=fakes["deliveries"],
        permute=_IDENTITY_ORDER,
    )
    assert len(test["questions"]) == 3
    assert "correct_index" not in test["questions"][0]


async def test_get_test_rejects_non_owner(fakes):
    app_id = await _seed_application(fakes, candidate="owner")
    fakes["banks"]._by_job["j1"] = _bank()
    with pytest.raises(ForbiddenError):
        await aptitude.get_aptitude_test(
            _identity("intruder"),
            app_id,
            applications=fakes["applications"],
            banks=fakes["banks"],
            deliveries=fakes["deliveries"],
        )


async def test_get_test_delivery_is_idempotent(fakes):
    app_id = await _seed_application(fakes)
    fakes["banks"]._by_job["j1"] = _bank()
    kw = {
        "applications": fakes["applications"],
        "banks": fakes["banks"],
        "deliveries": fakes["deliveries"],
    }
    first = await aptitude.get_aptitude_test(_identity(), app_id, **kw)
    second = await aptitude.get_aptitude_test(_identity(), app_id, **kw)
    assert [q["question"] for q in first["questions"]] == [
        q["question"] for q in second["questions"]
    ]


async def test_randomized_order_grades_by_mapping_back(fakes):
    app_id = await _seed_application(fakes)
    fakes["banks"]._by_job["j1"] = _bank(correct=(0, 1, 2))
    _seed_job(fakes, threshold=60)
    # reverse permutation: served order is [q2, q1, q0]
    test = await aptitude.get_aptitude_test(
        _identity(),
        app_id,
        applications=fakes["applications"],
        banks=fakes["banks"],
        deliveries=fakes["deliveries"],
        permute=lambda n: list(reversed(range(n))),
    )
    assert [q["question"] for q in test["questions"]] == ["q2", "q1", "q0"]
    # Answer each served question's correct index, in served order → 100%.
    result = await aptitude.grade_aptitude(
        _identity(),
        app_id,
        [2, 1, 0],
        applications=fakes["applications"],
        jobs=fakes["jobs"],
        banks=fakes["banks"],
        attempts=fakes["attempts"],
        deliveries=fakes["deliveries"],
        publisher=fakes["publisher"],
    )
    assert result["score"] == 100


async def test_grade_passes_and_emits(fakes):
    app_id = await _seed_application(fakes)
    fakes["banks"]._by_job["j1"] = _bank(correct=(0, 1, 2))
    _seed_job(fakes, threshold=60)
    _seed_delivery(fakes, app_id)
    result = await aptitude.grade_aptitude(
        _identity(),
        app_id,
        [0, 1, 2],
        applications=fakes["applications"],
        jobs=fakes["jobs"],
        banks=fakes["banks"],
        attempts=fakes["attempts"],
        deliveries=fakes["deliveries"],
        publisher=fakes["publisher"],
    )
    assert result["score"] == 100
    assert result["passed"] is True
    assert ("aptitude.graded", {"application_id": app_id, "passed": True}) in fakes[
        "publisher"
    ].published
    assert len(fakes["attempts"].records) == 1


async def test_grade_fails_below_threshold(fakes):
    app_id = await _seed_application(fakes)
    fakes["banks"]._by_job["j1"] = _bank(correct=(0, 1, 2))
    _seed_job(fakes, threshold=60)
    _seed_delivery(fakes, app_id)
    result = await aptitude.grade_aptitude(
        _identity(),
        app_id,
        [0, 3, 3],  # in-range but wrong on q1/q2 → 1 of 3 correct = 33%
        applications=fakes["applications"],
        jobs=fakes["jobs"],
        banks=fakes["banks"],
        attempts=fakes["attempts"],
        deliveries=fakes["deliveries"],
        publisher=fakes["publisher"],
    )
    assert result["score"] == 33
    assert result["passed"] is False


async def test_grade_rejects_wrong_answer_count(fakes):
    app_id = await _seed_application(fakes)
    fakes["banks"]._by_job["j1"] = _bank()
    _seed_job(fakes)
    _seed_delivery(fakes, app_id)
    with pytest.raises(ValidationError):
        await aptitude.grade_aptitude(
            _identity(),
            app_id,
            [0, 1],  # 2 answers, 3 questions
            applications=fakes["applications"],
            jobs=fakes["jobs"],
            banks=fakes["banks"],
            attempts=fakes["attempts"],
            deliveries=fakes["deliveries"],
            publisher=fakes["publisher"],
        )


async def test_grade_rejects_out_of_range_answer(fakes):
    app_id = await _seed_application(fakes)
    fakes["banks"]._by_job["j1"] = _bank()
    _seed_job(fakes)
    _seed_delivery(fakes, app_id)
    with pytest.raises(ValidationError):
        await aptitude.grade_aptitude(
            _identity(),
            app_id,
            [0, 1, 4],  # 4 indexes past the 4-option question (valid: 0-3)
            applications=fakes["applications"],
            jobs=fakes["jobs"],
            banks=fakes["banks"],
            attempts=fakes["attempts"],
            deliveries=fakes["deliveries"],
            publisher=fakes["publisher"],
        )


async def test_grade_rejects_when_not_pending(fakes):
    app_id = await _seed_application(fakes, state="interviewed")
    fakes["banks"]._by_job["j1"] = _bank()
    _seed_delivery(fakes, app_id)
    with pytest.raises(ValidationError):
        await aptitude.grade_aptitude(
            _identity(),
            app_id,
            [0, 1, 2],
            applications=fakes["applications"],
            jobs=fakes["jobs"],
            banks=fakes["banks"],
            attempts=fakes["attempts"],
            deliveries=fakes["deliveries"],
            publisher=fakes["publisher"],
        )


async def test_grade_without_delivery_rejected(fakes):
    app_id = await _seed_application(fakes)
    fakes["banks"]._by_job["j1"] = _bank()
    _seed_job(fakes)
    with pytest.raises(ValidationError):
        await aptitude.grade_aptitude(
            _identity(),
            app_id,
            [0, 1, 2],
            applications=fakes["applications"],
            jobs=fakes["jobs"],
            banks=fakes["banks"],
            attempts=fakes["attempts"],
            deliveries=fakes["deliveries"],
            publisher=fakes["publisher"],
        )


async def test_grade_rejects_after_time_limit(fakes):
    app_id = await _seed_application(fakes)
    fakes["banks"]._by_job["j1"] = _bank(correct=(0, 1, 2))
    _seed_job(fakes, time_limit_min=20)
    _seed_delivery(fakes, app_id, minutes_ago=25)  # past the 20-min limit
    with pytest.raises(ValidationError):
        await aptitude.grade_aptitude(
            _identity(),
            app_id,
            [0, 1, 2],
            applications=fakes["applications"],
            jobs=fakes["jobs"],
            banks=fakes["banks"],
            attempts=fakes["attempts"],
            deliveries=fakes["deliveries"],
            publisher=fakes["publisher"],
        )


async def test_grade_duplicate_submission_is_conflict(fakes):
    app_id = await _seed_application(fakes)
    fakes["banks"]._by_job["j1"] = _bank(correct=(0, 1, 2))
    _seed_job(fakes)
    _seed_delivery(fakes, app_id)

    class _DupAttempts:
        async def insert(self, attempt):
            raise DuplicateKeyError("duplicate application_id")

    with pytest.raises(ConflictError):
        await aptitude.grade_aptitude(
            _identity(),
            app_id,
            [0, 1, 2],
            applications=fakes["applications"],
            jobs=fakes["jobs"],
            banks=fakes["banks"],
            attempts=_DupAttempts(),
            deliveries=fakes["deliveries"],
            publisher=fakes["publisher"],
        )
