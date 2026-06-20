"""Coding-assessment delivery + grading (transport-agnostic resources).

The candidate fetches the task (prompt + SAMPLE cases only — never the hidden answer
key), runs scratch code (ephemeral), and submits for grading against hidden test cases
+ typed answers. Execution is the stdlib lib.execution sandbox (a resource-capped
subprocess). Candidate-owned via the application (the tenant source of truth).
"""

from lib.execution import ExecLimits, run_code
from lib.logging import get_logger

from app.errors import NotFoundError, RateLimitedError, ValidationError
from app.model.coding import CodingAttempt
from app.resources.aptitude import _owned  # candidate-owns-application authz

log = get_logger(component="coding.resources")


def _normalize(s: str) -> str:
    return "\n".join(line.rstrip() for line in s.splitlines()).rstrip("\n")


def _grade_case(result, expected: str) -> bool:
    return (
        result.exit_code == 0
        and not result.timed_out
        and _normalize(result.stdout) == _normalize(expected)
    )


def _public_task(application_id, task):
    # Strip the answer key: hidden cases and the typed `accepted` list stay server-side.
    return {
        "application_id": application_id,
        "title": task.get("title", ""),
        "prompt": task.get("prompt", ""),
        "languages": task.get("languages", ["python"]),
        "starter_code": task.get("starter_code", ""),
        "sample_cases": task.get("sample_cases", []),
        "typed_questions": [
            {"id": q["id"], "prompt": q["prompt"]}
            for q in task.get("typed_questions", [])
        ],
        "cpu_seconds": task.get("cpu_seconds", 2),
        "wall_seconds": task.get("wall_seconds", 5),
    }


async def get_coding_task(identity, application_id, *, applications, tasks):
    application = await _owned(identity, application_id, applications)
    task = await tasks.get_by_job(application["job_id"])
    if task is None:
        raise NotFoundError("Coding task not ready")
    return _public_task(application_id, task)


_MAX_SOURCE = 64 * 1024
_RUN_LIMIT = 30
_RUN_WINDOW = 60


async def _rate_limit(limiter, identity, application_id):
    hit = await limiter.hit(
        f"coding_run:{identity['id']}:{application_id}", _RUN_LIMIT, _RUN_WINDOW
    )
    if not hit.allowed:
        raise RateLimitedError("Too many runs, slow down")


def _validate(task, language, source):
    if language not in task.get("languages", ["python"]):
        raise ValidationError(f"language not allowed: {language}")
    if len(source) > _MAX_SOURCE:
        raise ValidationError("source too large")


def _limits(task):
    return ExecLimits(
        cpu_seconds=task.get("cpu_seconds", 2),
        wall_seconds=float(task.get("wall_seconds", 5)),
    )


async def _owned_task(identity, application_id, applications, tasks):
    application = await _owned(identity, application_id, applications)
    task = await tasks.get_by_job(application["job_id"])
    if task is None:
        raise NotFoundError("Coding task not ready")
    return application, task


async def run_code_attempt(
    identity,
    application_id,
    language,
    source,
    stdin,
    *,
    applications,
    tasks,
    limiter,
    executor=run_code,
):
    _, task = await _owned_task(identity, application_id, applications, tasks)
    _validate(task, language, source)
    await _rate_limit(limiter, identity, application_id)
    result = await executor(language, source, stdin, limits=_limits(task))
    return {
        "stdout": result.stdout,
        "stderr": result.stderr,
        "exit_code": result.exit_code,
        "time_ms": result.time_ms,
        "timed_out": result.timed_out,
    }


def _grade_typed(task, typed_answers):
    by_id = {a["id"]: a.get("answer", "") for a in typed_answers}
    questions = task.get("typed_questions", [])
    correct = sum(
        1
        for q in questions
        if any(
            _normalize(by_id.get(q["id"], "")) == _normalize(a) for a in q["accepted"]
        )
    )
    return correct, len(questions)


async def submit_coding(
    identity,
    application_id,
    language,
    source,
    typed_answers,
    *,
    applications,
    tasks,
    attempts,
    publisher,
    limiter,
    executor=run_code,
):
    application, task = await _owned_task(identity, application_id, applications, tasks)
    _validate(task, language, source)
    await _rate_limit(limiter, identity, application_id)
    limits = _limits(task)
    hidden = task.get("hidden_cases", [])
    cases_passed = 0
    for case in hidden:
        result = await executor(language, source, case.get("stdin", ""), limits=limits)
        if _grade_case(result, case.get("expected_stdout", "")):
            cases_passed += 1
    typed_correct, typed_total = _grade_typed(task, typed_answers)
    cases_total = len(hidden)
    passed = cases_passed == cases_total and typed_correct == typed_total
    await attempts.insert(
        CodingAttempt(
            application_id=application_id,
            comp_id=application["comp_id"],
            candidate_user_id=identity["id"],
            job_id=application["job_id"],
            cases_passed=cases_passed,
            cases_total=cases_total,
            typed_correct=typed_correct,
            typed_total=typed_total,
            passed=passed,
        )
    )
    await publisher.publish(
        "coding.graded", {"application_id": application_id, "passed": passed}
    )
    log.info(
        "coding graded: app={} cases={}/{} typed={}/{} passed={}",
        application_id,
        cases_passed,
        cases_total,
        typed_correct,
        typed_total,
        passed,
    )
    return {
        "passed": passed,
        "cases_passed": cases_passed,
        "cases_total": cases_total,
        "typed_correct": typed_correct,
        "typed_total": typed_total,
    }
