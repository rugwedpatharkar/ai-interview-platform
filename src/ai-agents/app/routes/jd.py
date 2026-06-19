"""gRPC JdService — recruiter-only JD drafting from an untrusted brief."""

import grpc
from lib.logging import get_logger, log_context

from app.resources.jd_assistant import improve_jd
from app.routes.grpc_common import caller_identity
from app.routes.pb import jd_pb2, jd_pb2_grpc

log = get_logger(component="route.jd_grpc")

_MAX_BRIEF_CHARS = 16_000
_RECRUITER_ROLES = ("recruiter", "company_admin")


class JdServicer(jd_pb2_grpc.JdServiceServicer):
    def __init__(self, *, tokens, llm):
        self._tokens = tokens
        self._llm = llm

    async def ImproveJd(self, request, context):
        identity = await caller_identity(context, self._tokens)
        if identity["role"] not in _RECRUITER_ROLES:
            await context.abort(grpc.StatusCode.PERMISSION_DENIED, "recruiters only")
        if len(request.brief) > _MAX_BRIEF_CHARS:
            await context.abort(grpc.StatusCode.INVALID_ARGUMENT, "brief too long")
        async with log_context(log, "grpc.jd.improve"):
            draft = await improve_jd(request.brief, llm=self._llm)
        return jd_pb2.JdResponse(
            jd_text=draft.jd_text, suggestions=list(draft.suggestions)
        )
