"""mcp-data MCP client — the data gateway backed by the mcp-data server's tools.

Implements the same duck-typed interface the handlers use (save_profile/get_job/...),
but each call goes over MCP to the standalone mcp-data server instead of touching Mongo
directly. Swapping this in for the old in-process gateway needed no handler changes.
"""

from lib.logging import get_logger

from app.infra.mcp_result import unwrap

log = get_logger(component="infra.mcp_data")


class McpDataGateway:
    def __init__(self, manager):
        """Args:
        manager: Anything exposing ``async call_tool(name, arguments)``.
                 Typically an :class:`~app.infra.mcp_session.McpSessionManager`.
        """
        self._session = manager

    async def save_profile(self, user_id, doc):
        await self._session.call_tool(
            "save_profile", {"user_id": user_id, "profile": doc}
        )

    async def get_job(self, job_id):
        return unwrap(await self._session.call_tool("get_job", {"job_id": job_id}))

    async def get_profile(self, user_id):
        return unwrap(
            await self._session.call_tool("get_profile", {"user_id": user_id})
        )

    async def save_question_plan(self, job_id, plan):
        await self._session.call_tool(
            "save_question_plan", {"job_id": job_id, "plan": plan}
        )

    async def save_proctoring_events(self, application_id, comp_id, events):
        await self._session.call_tool(
            "save_proctoring_events",
            {"application_id": application_id, "comp_id": comp_id, "events": events},
        )

    async def get_question_plan(self, job_id):
        return unwrap(
            await self._session.call_tool("get_question_plan", {"job_id": job_id})
        )

    async def list_applicants(self, scope, job_id):
        return unwrap(
            await self._session.call_tool(
                "list_applicants", {"scope": scope, "job_id": job_id}
            )
        )

    async def get_application_status(self, scope, application_id):
        return unwrap(
            await self._session.call_tool(
                "get_application_status",
                {"scope": scope, "application_id": application_id},
            )
        )

    async def save_aptitude_bank(self, job_id, doc):
        await self._session.call_tool(
            "save_aptitude_bank", {"job_id": job_id, "bank": doc}
        )

    async def get_aptitude_bank(self, job_id):
        return unwrap(
            await self._session.call_tool("get_aptitude_bank", {"job_id": job_id})
        )

    async def get_interview_context(self, application_id):
        return unwrap(
            await self._session.call_tool(
                "get_interview_context", {"application_id": application_id}
            )
        )

    async def save_report(self, application_id, doc):
        await self._session.call_tool(
            "save_report", {"application_id": application_id, "report": doc}
        )

    async def get_report(self, application_id):
        return unwrap(
            await self._session.call_tool(
                "get_report", {"application_id": application_id}
            )
        )

    async def get_interview_setup(self, application_id):
        return unwrap(
            await self._session.call_tool(
                "get_interview_setup", {"application_id": application_id}
            )
        )

    async def save_interview(self, application_id, doc):
        await self._session.call_tool(
            "save_interview", {"application_id": application_id, "interview": doc}
        )

    async def save_match_result(
        self, comp_id, job_id, candidate_user_id, score, reasons
    ):
        return unwrap(
            await self._session.call_tool(
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
            await self._session.call_tool(
                "get_match_results",
                {"job_id": job_id or "", "candidate_user_id": candidate_user_id or ""},
            )
        )
