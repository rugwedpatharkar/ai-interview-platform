import pytest

from app.errors import ForbiddenError, NotFoundError
from app.resources import coding
from app.resources.coding import _grade_case, _normalize


def _identity(uid="cand", comp_id="c1"):
    return {"id": uid, "role": "candidate", "comp_id": comp_id}


class _Apps:
    def __init__(self, app):
        self._app = app

    async def get(self, aid):
        return self._app


class _Tasks:
    def __init__(self, task):
        self._task = task

    async def get_by_job(self, job_id):
        return self._task


def _app(uid="cand"):
    return {"_id": "a1", "comp_id": "c1", "candidate_user_id": uid, "job_id": "j1"}


def _task():
    return {
        "job_id": "j1",
        "title": "Sum",
        "prompt": "Read two ints, print their sum.",
        "languages": ["python"],
        "starter_code": "",
        "sample_cases": [{"stdin": "1 2", "expected_stdout": "3"}],
        "hidden_cases": [{"stdin": "4 5", "expected_stdout": "9"}],
        "typed_questions": [{"id": "t1", "prompt": "Big-O?", "accepted": ["O(1)"]}],
        "cpu_seconds": 2,
        "wall_seconds": 5,
    }


async def test_get_task_hides_answer_key():
    dto = await coding.get_coding_task(
        _identity(), "a1", applications=_Apps(_app()), tasks=_Tasks(_task())
    )
    assert dto["title"] == "Sum"
    assert dto["sample_cases"] == [{"stdin": "1 2", "expected_stdout": "3"}]
    # Hidden cases + typed accepted answers must NEVER reach the candidate.
    assert "hidden_cases" not in dto
    assert dto["typed_questions"] == [{"id": "t1", "prompt": "Big-O?"}]


async def test_get_task_rejects_non_owner():
    with pytest.raises(ForbiddenError):
        await coding.get_coding_task(
            _identity(uid="other"),
            "a1",
            applications=_Apps(_app()),
            tasks=_Tasks(_task()),
        )


async def test_get_task_not_ready():
    with pytest.raises(NotFoundError):
        await coding.get_coding_task(
            _identity(), "a1", applications=_Apps(_app()), tasks=_Tasks(None)
        )


def test_normalize_strips_trailing_ws_and_newlines():
    assert _normalize("3 \n\n") == _normalize("3")


def test_grade_case_requires_clean_exit_and_match():
    from lib.execution import ExecResult

    ok = ExecResult(stdout="9\n", stderr="", exit_code=0, time_ms=1, timed_out=False)
    assert _grade_case(ok, "9") is True
    crashed = ExecResult(stdout="9", stderr="", exit_code=1, time_ms=1, timed_out=False)
    assert _grade_case(crashed, "9") is False
    slow = ExecResult(stdout="9", stderr="", exit_code=0, time_ms=1, timed_out=True)
    assert _grade_case(slow, "9") is False
