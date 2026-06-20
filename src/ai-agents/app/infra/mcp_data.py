"""mcp-data MCP client — the data gateway backed by the mcp-data server's tools.

Implements the same duck-typed interface the handlers use (save_profile/get_job/...),
but each call goes over MCP to the standalone mcp-data server instead of touching Mongo
directly. Swapping this in for the old in-process gateway needed no handler changes.
"""

import time

from lib.logging import get_logger
from lib.observability import counter, histogram, span

from app.infra.mcp_result import unwrap

log = get_logger(component="infra.mcp_data")

# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------
_mcp_data_total = counter(
    "mcp_data_call_total", "mcp-data tool call invocations", labels=["tool"]
)
_mcp_data_errors = counter(
    "mcp_data_call_errors_total", "mcp-data tool call errors", labels=["tool"]
)
_mcp_data_duration = histogram(
    "mcp_data_call_duration_ms", "mcp-data tool call duration (ms)", labels=["tool"]
)


class McpDataGateway:
    def __init__(self, manager):
        """Args:
        manager: Anything exposing ``async call_tool(name, arguments)``.
                 Typically an :class:`~app.infra.mcp_session.McpSessionManager`.
        """
        self._session = manager

    async def _call(self, tool: str, args: dict):
        """Call a tool and observe metrics; propagate exceptions."""
        _mcp_data_total.labels(tool=tool).inc()
        t0 = time.monotonic()
        try:
            async with span("mcp_data." + tool, tool=tool):
                result = await self._session.call_tool(tool, args)
        except Exception:
            _mcp_data_errors.labels(tool=tool).inc()
            _mcp_data_duration.labels(tool=tool).observe((time.monotonic() - t0) * 1000)
            raise
        _mcp_data_duration.labels(tool=tool).observe((time.monotonic() - t0) * 1000)
        return result

    async def save_profile(self, user_id, doc):
        await self._call("save_profile", {"user_id": user_id, "profile": doc})

    async def get_job(self, job_id):
        return unwrap(await self._call("get_job", {"job_id": job_id}))

    async def get_profile(self, user_id):
        return unwrap(await self._call("get_profile", {"user_id": user_id}))

    async def save_question_plan(self, job_id, plan):
        await self._call("save_question_plan", {"job_id": job_id, "plan": plan})

    async def save_proctoring_events(self, application_id, comp_id, events):
        await self._call(
            "save_proctoring_events",
            {"application_id": application_id, "comp_id": comp_id, "events": events},
        )

    async def get_question_plan(self, job_id):
        return unwrap(await self._call("get_question_plan", {"job_id": job_id}))

    async def list_applicants(self, scope, job_id):
        return unwrap(
            await self._call("list_applicants", {"scope": scope, "job_id": job_id})
        )

    async def get_application_status(self, scope, application_id):
        return unwrap(
            await self._call(
                "get_application_status",
                {"scope": scope, "application_id": application_id},
            )
        )

    async def save_aptitude_bank(self, job_id, doc):
        await self._call("save_aptitude_bank", {"job_id": job_id, "bank": doc})

    async def get_aptitude_bank(self, job_id):
        return unwrap(await self._call("get_aptitude_bank", {"job_id": job_id}))

    async def get_interview_context(self, application_id):
        return unwrap(
            await self._call(
                "get_interview_context", {"application_id": application_id}
            )
        )

    async def save_report(self, application_id, doc):
        await self._call(
            "save_report", {"application_id": application_id, "report": doc}
        )

    async def get_report(self, application_id):
        return unwrap(
            await self._call("get_report", {"application_id": application_id})
        )

    async def get_interview_setup(self, application_id):
        return unwrap(
            await self._call("get_interview_setup", {"application_id": application_id})
        )

    async def get_proctoring_events(self, application_id):
        return unwrap(
            await self._call(
                "get_proctoring_events", {"application_id": application_id}
            )
        )

    async def save_interview(self, application_id, doc):
        await self._call(
            "save_interview", {"application_id": application_id, "interview": doc}
        )

    async def save_match_result(
        self, comp_id, job_id, candidate_user_id, score, reasons
    ):
        return unwrap(
            await self._call(
                "save_match_result",
                {
                    "comp_id": comp_id,
                    "job_id": job_id,
                    "candidate_user_id": candidate_user_id,
                    "score": score,
                    "reasons": reasons,
                },
            )
        )

    async def get_match_results(self, job_id=None, candidate_user_id=None):
        return unwrap(
            await self._call(
                "get_match_results",
                {"job_id": job_id or "", "candidate_user_id": candidate_user_id or ""},
            )
        )

    async def save_practice_summary(self, user_id, summary):
        await self._call(
            "save_practice_summary", {"user_id": user_id, "summary": summary}
        )

    async def get_practice_summary(self, user_id, practice_id):
        return unwrap(
            await self._call(
                "get_practice_summary",
                {"user_id": user_id, "practice_id": practice_id},
            )
        )

    async def list_practice_summaries(self, user_id):
        return unwrap(await self._call("list_practice_summaries", {"user_id": user_id}))
