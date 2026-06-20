"""Coding-assessment delivery + grading (transport-agnostic resources).

The candidate fetches the task (prompt + SAMPLE cases only — never the hidden answer
key), runs scratch code (ephemeral), and submits for grading against hidden test cases
+ typed answers. Execution is the stdlib lib.execution sandbox (a resource-capped
subprocess). Candidate-owned via the application (the tenant source of truth).
"""

from lib.logging import get_logger

from app.errors import NotFoundError
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
