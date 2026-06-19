"""mcp-data — MCP server exposing the platform's data tools (FastMCP, stdio).

Wraps app/tools.py `DataStore` as MCP tools; constructs MongoManager from settings. The
ai-agents service connects as an MCP client. `_jsonable` stringifies BSON ObjectIds so
tool results are JSON-serializable. Run `python -m app.server`.
"""

from bson import ObjectId
from lib.logging import configure_logging, get_logger
from lib.mongodb import MongoManager
from mcp.server.fastmcp import FastMCP

from app.config import get_settings
from app.tools import DataStore

log = get_logger(component="mcp_data.server")

_settings = get_settings()
_mongo = MongoManager(
    _settings.mongo_uri,
    _settings.mongo_db_name,
    _settings.mongo_max_pool_size,
    _settings.mongo_min_pool_size,
)
_store = DataStore(_mongo.db)
mcp = FastMCP("mcp-data", host=_settings.mcp_host, port=_settings.mcp_port)


def _jsonable(value):
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_jsonable(v) for v in value]
    return value


@mcp.tool()
async def save_profile(user_id: str, profile: dict) -> None:
    """Persist a candidate's structured profile (marks it parsed)."""
    await _store.save_profile(user_id, profile)


@mcp.tool()
async def get_job(job_id: str) -> dict | None:
    """Fetch a job document by id."""
    return _jsonable(await _store.get_job(job_id))


@mcp.tool()
async def get_profile(user_id: str) -> dict | None:
    """Fetch a candidate's structured profile by user id (for matching)."""
    return _jsonable(await _store.get_profile(user_id))


@mcp.tool()
async def save_question_plan(job_id: str, plan: dict) -> None:
    """Persist the job-level RAG-grounded question plan (built on job.published)."""
    await _store.save_question_plan(job_id, plan)


@mcp.tool()
async def get_question_plan(job_id: str) -> dict | None:
    """Fetch the cached job question plan (None if not built)."""
    return _jsonable(await _store.get_question_plan(job_id))


@mcp.tool()
async def list_applicants(scope: dict, job_id: str) -> list:
    """List a job's applicants — scope-checked (recruiter sees only own-comp jobs)."""
    return _jsonable(await _store.list_applicants(scope, job_id))


@mcp.tool()
async def get_application_status(scope: dict, application_id: str) -> dict | None:
    """Application status — scope-checked (candidate=own, recruiter=own-comp)."""
    return _jsonable(await _store.get_application_status(scope, application_id))


@mcp.tool()
async def save_aptitude_bank(job_id: str, bank: dict) -> None:
    """Persist the aptitude bank for a job."""
    await _store.save_aptitude_bank(job_id, bank)


@mcp.tool()
async def get_aptitude_bank(job_id: str) -> dict | None:
    """Fetch a job's aptitude bank (None if not built) — for idempotency."""
    return _jsonable(await _store.get_aptitude_bank(job_id))


@mcp.tool()
async def get_interview_context(application_id: str) -> dict | None:
    """Assemble transcript + blueprint + jd_text + profile for scoring."""
    return _jsonable(await _store.get_interview_context(application_id))


@mcp.tool()
async def save_report(application_id: str, report: dict) -> None:
    """Persist the interview report for an application."""
    await _store.save_report(application_id, report)


@mcp.tool()
async def get_report(application_id: str) -> dict | None:
    """Fetch a stored interview report (None if not yet scored) — for idempotency."""
    return _jsonable(await _store.get_report(application_id))


@mcp.tool()
async def get_interview_setup(application_id: str) -> dict | None:
    """Assemble comp_id/job_id/candidate/jd_text/profile to start an interview."""
    return _jsonable(await _store.get_interview_setup(application_id))


@mcp.tool()
async def save_interview(application_id: str, interview: dict) -> None:
    """Persist the completed interview (transcript + blueprint)."""
    await _store.save_interview(application_id, interview)


@mcp.tool()
async def save_proctoring_events(
    application_id: str, comp_id: str, events: list
) -> int:
    """Append advisory proctoring signals (typed events only, no raw media)."""
    return await _store.save_proctoring_events(application_id, comp_id, events)


@mcp.tool()
async def save_match_result(
    comp_id: str, job_id: str, candidate_user_id: str, score: float, reasons: list[str]
) -> bool:
    """Persist a candidate<->job match result; returns True only on the first write."""
    return await _store.save_match_result(
        comp_id, job_id, candidate_user_id, score, reasons
    )


@mcp.tool()
async def get_match_results(job_id: str = "", candidate_user_id: str = "") -> list:
    """List match results filtered by job and/or candidate (comp-scoped on read)."""
    return _jsonable(
        await _store.get_match_results(
            job_id=job_id or None, candidate_user_id=candidate_user_id or None
        )
    )


def main() -> None:
    configure_logging(_settings.service_name, _settings.log_level)
    mcp.run(transport="streamable-http")


if __name__ == "__main__":
    main()
