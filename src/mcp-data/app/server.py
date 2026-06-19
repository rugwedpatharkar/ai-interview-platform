"""mcp-data — MCP server exposing the platform's data tools (FastMCP, stdio).

Wraps app/tools.py `DataStore` as MCP tools; constructs MongoManager from settings. The
ai-agents service connects as an MCP client. `_jsonable` stringifies BSON ObjectIds so
tool results are JSON-serializable. Run `python -m app.server`.
"""

from typing import Literal

from bson import ObjectId
from lib.logging import bind_ids, configure_logging, get_logger, log_context
from lib.mongodb import MongoManager
from lib.observability import init_tracing, start_metrics_server
from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, TypeAdapter, ValidationError

from app.config import get_settings
from app.tools import DataStore


class _ProctoringEventInput(BaseModel):
    type: Literal[
        "gaze_off_screen",
        "head_turned_away",
        "lips_move_no_audio",
        "audio_no_lip_move",
        "body_out_of_frame",
        "second_face",
        "phone_detected",
        "camera_occluded",
        "virtual_camera",
        "second_voice",
        "keyboard_typing",
        "synthetic_audio_suspected",
        "tab_hidden",
        "window_blur",
        "fullscreen_exit",
        "copy",
        "paste_large",
        "devtools_open",
        "multi_monitor",
        "screen_share",
        "keystroke_anomaly",
        "ip_geo_anomaly",
    ]
    at: str
    meta: dict | None = None


_proctoring_event_list_adapter = TypeAdapter(list[_ProctoringEventInput])

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
    async with log_context(log, "tool.save_profile", **bind_ids(user_id=user_id)):
        await _store.save_profile(user_id, profile)


@mcp.tool()
async def get_job(job_id: str) -> dict | None:
    """Fetch a job document by id."""
    async with log_context(log, "tool.get_job", **bind_ids(job_id=job_id)):
        return _jsonable(await _store.get_job(job_id))


@mcp.tool()
async def get_profile(user_id: str) -> dict | None:
    """Fetch a candidate's structured profile by user id (for matching)."""
    async with log_context(log, "tool.get_profile", **bind_ids(user_id=user_id)):
        return _jsonable(await _store.get_profile(user_id))


@mcp.tool()
async def save_question_plan(job_id: str, plan: dict) -> None:
    """Persist the job-level RAG-grounded question plan (built on job.published)."""
    async with log_context(log, "tool.save_question_plan", **bind_ids(job_id=job_id)):
        await _store.save_question_plan(job_id, plan)


@mcp.tool()
async def get_question_plan(job_id: str) -> dict | None:
    """Fetch the cached job question plan (None if not built)."""
    async with log_context(log, "tool.get_question_plan", **bind_ids(job_id=job_id)):
        return _jsonable(await _store.get_question_plan(job_id))


@mcp.tool()
async def list_applicants(scope: dict, job_id: str) -> list:
    """List a job's applicants — scope-checked (recruiter sees only own-comp jobs)."""
    async with log_context(
        log,
        "tool.list_applicants",
        **bind_ids(job_id=job_id, comp_id=scope.get("comp_id", "")),
    ):
        return _jsonable(await _store.list_applicants(scope, job_id))


@mcp.tool()
async def get_application_status(scope: dict, application_id: str) -> dict | None:
    """Application status — scope-checked (candidate=own, recruiter=own-comp)."""
    async with log_context(
        log,
        "tool.get_application_status",
        **bind_ids(application_id=application_id),
    ):
        return _jsonable(await _store.get_application_status(scope, application_id))


@mcp.tool()
async def save_aptitude_bank(job_id: str, bank: dict) -> None:
    """Persist the aptitude bank for a job."""
    async with log_context(log, "tool.save_aptitude_bank", **bind_ids(job_id=job_id)):
        await _store.save_aptitude_bank(job_id, bank)


@mcp.tool()
async def get_aptitude_bank(job_id: str) -> dict | None:
    """Fetch a job's aptitude bank (None if not built) — for idempotency."""
    async with log_context(log, "tool.get_aptitude_bank", **bind_ids(job_id=job_id)):
        return _jsonable(await _store.get_aptitude_bank(job_id))


@mcp.tool()
async def get_interview_context(application_id: str) -> dict | None:
    """Assemble transcript + blueprint + jd_text + profile for scoring."""
    async with log_context(
        log,
        "tool.get_interview_context",
        **bind_ids(application_id=application_id),
    ):
        return _jsonable(await _store.get_interview_context(application_id))


@mcp.tool()
async def save_report(application_id: str, report: dict) -> None:
    """Persist the interview report for an application."""
    async with log_context(
        log, "tool.save_report", **bind_ids(application_id=application_id)
    ):
        await _store.save_report(application_id, report)


@mcp.tool()
async def get_report(application_id: str) -> dict | None:
    """Fetch a stored interview report (None if not yet scored) — for idempotency."""
    async with log_context(
        log, "tool.get_report", **bind_ids(application_id=application_id)
    ):
        return _jsonable(await _store.get_report(application_id))


@mcp.tool()
async def get_interview_setup(application_id: str) -> dict | None:
    """Assemble comp_id/job_id/candidate/jd_text/profile to start an interview."""
    async with log_context(
        log,
        "tool.get_interview_setup",
        **bind_ids(application_id=application_id),
    ):
        return _jsonable(await _store.get_interview_setup(application_id))


@mcp.tool()
async def save_interview(application_id: str, interview: dict) -> None:
    """Persist the completed interview (transcript + blueprint)."""
    async with log_context(
        log, "tool.save_interview", **bind_ids(application_id=application_id)
    ):
        await _store.save_interview(application_id, interview)


@mcp.tool()
async def save_proctoring_events(
    application_id: str, comp_id: str, events: list
) -> int:
    """Append advisory proctoring signals (typed events only, no raw media)."""
    async with log_context(
        log,
        "tool.save_proctoring_events",
        **bind_ids(application_id=application_id, comp_id=comp_id),
    ):
        try:
            validated = _proctoring_event_list_adapter.validate_python(events)
        except ValidationError as exc:
            raise ValueError(f"invalid proctoring events: {exc}") from exc
        return await _store.save_proctoring_events(
            application_id, comp_id, [e.model_dump() for e in validated]
        )


@mcp.tool()
async def save_match_result(
    comp_id: str, job_id: str, candidate_user_id: str, score: float, reasons: list[str]
) -> bool:
    """Persist a candidate<->job match result; returns True only on the first write."""
    async with log_context(
        log,
        "tool.save_match_result",
        **bind_ids(comp_id=comp_id, job_id=job_id),
    ):
        return await _store.save_match_result(
            comp_id, job_id, candidate_user_id, score, reasons
        )


@mcp.tool()
async def get_match_results(job_id: str = "", candidate_user_id: str = "") -> list:
    """List match results filtered by job and/or candidate (comp-scoped on read)."""
    async with log_context(
        log,
        "tool.get_match_results",
        **bind_ids(job_id=job_id),
    ):
        return _jsonable(
            await _store.get_match_results(
                job_id=job_id or None, candidate_user_id=candidate_user_id or None
            )
        )


def main() -> None:
    configure_logging(_settings.service_name, _settings.log_level)
    init_tracing(_settings.service_name, enabled=_settings.tracing_enabled)
    import asyncio

    asyncio.get_event_loop().run_until_complete(
        start_metrics_server(_settings.metrics_port)
    )
    mcp.run(transport="streamable-http")


if __name__ == "__main__":
    main()
