"""gRPC ChatService — server-streaming recruiting-assistant chat.

Mirrors the old /chat/turn SSE route: plan + scoped fetch up front, then stream token
deltas (`text`), then citations, then `done`. A planner/tool or mid-stream LLM error
arrives as an `error` event (the stream still ends cleanly, as the SSE route did). An
auth/validation failure aborts BEFORE the stream opens, so an expired token surfaces as
UNAUTHENTICATED and the FE transport refreshes-and-retries.
"""

import grpc
from lib.logging import get_logger, log_context

from app.resources.assistant import prepare_answer
from app.routes.grpc_common import caller_identity
from app.routes.pb import chat_pb2, chat_pb2_grpc

log = get_logger(component="route.chat_grpc")


def _citation(c):
    return chat_pb2.Citation(
        url=c.get("url", ""), topic=c.get("topic", ""), snippet=c.get("snippet", "")
    )


class ChatServicer(chat_pb2_grpc.ChatServiceServicer):
    def __init__(self, *, tokens, llm, data, capability, settings):
        self._tokens = tokens
        self._llm = llm
        self._data = data
        self._capability = capability
        self._settings = settings

    async def Chat(self, request, context):
        scope = await caller_identity(context, self._tokens)
        messages = [{"role": m.role, "content": m.content} for m in request.messages]
        if not messages:
            await context.abort(
                grpc.StatusCode.INVALID_ARGUMENT, "messages cannot be empty"
            )
        if len(messages) > self._settings.max_chat_messages:
            await context.abort(grpc.StatusCode.INVALID_ARGUMENT, "too many messages")
        async with log_context(log, "grpc.chat"):
            # Plan + scoped fetch up front; a planner/tool failure ends the stream
            # with one `error` event (the SSE route 502'd before opening the stream).
            try:
                prompt, citations = await prepare_answer(
                    messages,
                    scope,
                    llm=self._llm,
                    data=self._data,
                    capability=self._capability,
                )
            except Exception:
                log.exception("chat: planning failed")
                yield chat_pb2.ChatEvent(error="assistant unavailable")
                return
            try:
                async for chunk in self._llm.stream(prompt):
                    yield chat_pb2.ChatEvent(text=chunk)
                for citation in citations:
                    yield chat_pb2.ChatEvent(citation=_citation(citation))
            except Exception:
                log.exception("chat: stream failed")
                yield chat_pb2.ChatEvent(error="assistant unavailable")
                return
            yield chat_pb2.ChatEvent(done=chat_pb2.Done())
