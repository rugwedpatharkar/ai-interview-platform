import pytest
from lib.execution import ExecResult
from pymongo.errors import DuplicateKeyError

from app.errors import (
    ForbiddenError,
    NotFoundError,
    RateLimitedError,
    ValidationError,
)
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

    ok = ExecResult(stdout="9\n", stderr="", exit_code=0, time_ms=1, timed_out=False)
    assert _grade_case(ok, "9") is True
    crashed = ExecResult(stdout="9", stderr="", exit_code=1, time_ms=1, timed_out=False)
    assert _grade_case(crashed, "9") is False
    slow = ExecResult(stdout="9", stderr="", exit_code=0, time_ms=1, timed_out=True)
    assert _grade_case(slow, "9") is False


class _Hit:
    def __init__(self, allowed):
        self.allowed = allowed
        self.retry_after = 5


class _Limiter:
    def __init__(self, allowed=True):
        self._allowed = allowed
        self.hits = []

    async def hit(self, key, limit, window):
        self.hits.append((key, limit, window))
        return _Hit(self._allowed)


class _Attempts:
    def __init__(self):
        self.inserted = []

    async def insert(self, attempt):
        doc = attempt.model_dump()
        if any(r["application_id"] == doc["application_id"] for r in self.inserted):
            raise DuplicateKeyError("duplicate application_id")
        self.inserted.append(doc)

    async def get_by_application(self, application_id):
        return next(
            (r for r in self.inserted if r["application_id"] == application_id), None
        )


class _Pub:
    def __init__(self):
        self.events = []

    async def publish(self, key, payload):
        self.events.append((key, payload))


def _exec_returning(stdout, exit_code=0, timed_out=False):

    async def _fake(language, source, stdin="", *, limits=None):
        return ExecResult(
            stdout=stdout,
            stderr="",
            exit_code=exit_code,
            time_ms=1,
            timed_out=timed_out,
        )

    return _fake


async def test_run_code_is_ephemeral():
    out = await coding.run_code_attempt(
        _identity(),
        "a1",
        "python",
        "print(1)",
        "",
        applications=_Apps(_app()),
        tasks=_Tasks(_task()),
        limiter=_Limiter(),
        executor=_exec_returning("1\n"),
    )
    assert out["stdout"].strip() == "1" and out["exit_code"] == 0


async def test_run_code_rejects_unlisted_language():
    with pytest.raises(ValidationError):
        await coding.run_code_attempt(
            _identity(),
            "a1",
            "rust",
            "x",
            "",
            applications=_Apps(_app()),
            tasks=_Tasks(_task()),
            limiter=_Limiter(),
            executor=_exec_returning(""),
        )


async def test_run_code_rate_limited():
    with pytest.raises(RateLimitedError):
        await coding.run_code_attempt(
            _identity(),
            "a1",
            "python",
            "print(1)",
            "",
            applications=_Apps(_app()),
            tasks=_Tasks(_task()),
            limiter=_Limiter(allowed=False),
            executor=_exec_returning("1\n"),
        )


async def test_submit_grades_hidden_cases_and_typed():
    attempts, pub = _Attempts(), _Pub()
    out = await coding.submit_coding(
        _identity(),
        "a1",
        "python",
        "print(sum(map(int, input().split())))",
        [{"id": "t1", "answer": "O(1)"}],
        applications=_Apps(_app()),
        tasks=_Tasks(_task()),
        attempts=attempts,
        publisher=pub,
        limiter=_Limiter(),
        executor=_exec_returning("9\n"),  # hidden case "4 5" expects "9"
    )
    assert out["cases_passed"] == 1 and out["cases_total"] == 1
    assert out["typed_correct"] == 1 and out["typed_total"] == 1
    assert out["passed"] is True
    assert len(attempts.inserted) == 1
    assert ("coding.graded", {"application_id": "a1", "passed": True}) in pub.events


async def test_submit_fails_when_case_mismatches():
    out = await coding.submit_coding(
        _identity(),
        "a1",
        "python",
        "print(0)",
        [],
        applications=_Apps(_app()),
        tasks=_Tasks(_task()),
        attempts=_Attempts(),
        publisher=_Pub(),
        limiter=_Limiter(),
        executor=_exec_returning("0\n"),  # expected "9" → mismatch
    )
    assert out["cases_passed"] == 0 and out["passed"] is False


async def test_submit_is_idempotent_on_resubmit():
    # A resubmit returns the RECORDED result, re-emits coding.graded, and does NOT
    # re-execute the candidate code (recovers a lost publish + ignores double-submit).
    attempts, pub = _Attempts(), _Pub()
    runs = []

    def _counting_exec(stdout):
        async def _fake(language, source, stdin="", *, limits=None):
            runs.append(1)
            return ExecResult(
                stdout=stdout, stderr="", exit_code=0, time_ms=1, timed_out=False
            )

        return _fake

    deps = {
        "applications": _Apps(_app()),
        "tasks": _Tasks(_task()),
        "attempts": attempts,
        "publisher": pub,
        "limiter": _Limiter(),
    }
    first = await coding.submit_coding(
        _identity(),
        "a1",
        "python",
        "print(9)",
        [{"id": "t1", "answer": "O(1)"}],
        executor=_counting_exec("9\n"),
        **deps,
    )
    runs_after_first = len(runs)
    second = await coding.submit_coding(
        _identity(),
        "a1",
        "python",
        "print(0)",
        [],
        executor=_counting_exec("0\n"),
        **deps,
    )
    assert second == first  # recorded result, not a re-grade
    assert len(runs) == runs_after_first  # executor NOT re-run on resubmit
    assert (
        pub.events.count(
            ("coding.graded", {"application_id": "a1", "passed": first["passed"]})
        )
        == 2
    )
