"""FastAPI interview endpoint — candidate-facing live interview turns.

Thin transport: authenticates the candidate's access token, then calls the
interview_host resources. Collaborators live on `app.state.deps` (set by create_app) and
are overridden with fakes in tests. Domain errors map to HTTP status here; the ownership
check that a candidate drives only their own interview lives in the resource.
"""

import json

from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from jose import JWTError
from lib.logging import bind_ids, get_logger, log_context
from lib.web import CorrelationIdMiddleware, cors_config
from pydantic import BaseModel, Field

from app.config import get_settings
from app.errors import ConflictError, ForbiddenError, NotFoundError
from app.model.chat import ChatMessage
from app.model.proctoring import ProctoringEvent
from app.resources.assistant import prepare_answer
from app.resources.interview_host import start_interview, submit_turn
from app.resources.jd_assistant import improve_jd
from app.resources.proctoring import record_proctoring_events
from app.resources.voice.rtc_token import mint_join_token

log = get_logger(component="route.interview_api")
router = APIRouter()


class TurnRequest(BaseModel):
    answer: str = Field(min_length=1, max_length=32_000)


def _caller_user_id(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    try:
        claims = request.app.state.deps["tokens"].decode(
            auth[7:], expected_type="access"
        )
    except JWTError:
        raise HTTPException(status_code=401, detail="invalid token") from None
    return claims["sub"]


def _caller_identity(request: Request) -> dict:
    """Scope context from the access token; role/comp_id ride on the signed JWT."""
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    try:
        claims = request.app.state.deps["tokens"].decode(
            auth[7:], expected_type="access"
        )
    except JWTError:
        raise HTTPException(status_code=401, detail="invalid token") from None
    return {
        "user_id": claims["sub"],
        "role": str(claims.get("role", "")),
        "comp_id": claims.get("comp_id"),
    }


@router.post("/interview/{application_id}/start")
async def start(application_id: str, request: Request):
    deps = request.app.state.deps
    user_id = _caller_user_id(request)
    async with log_context(
        log,
        "api.interview.start",
        **bind_ids(application_id=application_id, user_id=user_id),
    ):
        try:
            question = await start_interview(
                application_id,
                caller_user_id=user_id,
                data=deps["data"],
                sessions=deps["sessions"],
                llm=deps["llm"],
            )
        except NotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e
        except ForbiddenError as e:
            raise HTTPException(status_code=403, detail=str(e)) from e
        except ConflictError as e:
            raise HTTPException(status_code=409, detail=str(e)) from e
    return {"question": question}


@router.post("/interview/{application_id}/turn")
async def turn(application_id: str, body: TurnRequest, request: Request):
    deps = request.app.state.deps
    user_id = _caller_user_id(request)
    if not body.answer.strip():
        raise HTTPException(status_code=400, detail="answer cannot be empty")
    async with log_context(
        log,
        "api.interview.turn",
        **bind_ids(application_id=application_id, user_id=user_id),
    ):
        try:
            decision = await submit_turn(
                application_id,
                body.answer,
                caller_user_id=user_id,
                sessions=deps["sessions"],
                data=deps["data"],
                publisher=deps["publisher"],
                llm=deps["llm"],
            )
        except NotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e
        except ForbiddenError as e:
            raise HTTPException(status_code=403, detail=str(e)) from e
    return {"done": decision.done, "question": decision.question}


class ProctorBatch(BaseModel):
    events: list[ProctoringEvent]


@router.post("/interview/{application_id}/proctor")
async def proctor(application_id: str, body: ProctorBatch, request: Request):
    deps = request.app.state.deps
    user_id = _caller_user_id(request)
    if len(body.events) > get_settings().max_proctor_events:
        raise HTTPException(status_code=400, detail="too many events")
    async with log_context(
        log,
        "api.interview.proctor",
        **bind_ids(application_id=application_id, user_id=user_id),
    ):
        try:
            accepted = await record_proctoring_events(
                application_id,
                body.events,
                caller_user_id=user_id,
                sessions=deps["sessions"],
                data=deps["data"],
            )
        except NotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e
        except ForbiddenError as e:
            raise HTTPException(status_code=403, detail=str(e)) from e
    return {"accepted": accepted}


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.post("/chat/turn")
async def chat_turn(body: ChatRequest, request: Request):
    deps = request.app.state.deps
    scope = _caller_identity(request)
    if not body.messages:
        raise HTTPException(status_code=400, detail="messages cannot be empty")
    if len(body.messages) > get_settings().max_chat_messages:
        raise HTTPException(status_code=400, detail="too many messages")
    # Plan + scoped fetch up front so a planner/tool failure is a clean 502 before the
    # stream starts; dump the validated ChatMessages so a bad turn never reaches it.
    try:
        prompt, citations = await prepare_answer(
            [m.model_dump() for m in body.messages],
            scope,
            llm=deps["llm"],
            data=deps["data"],
            capability=deps["capability"],
        )
    except Exception:
        log.exception("chat_turn: planning failed")
        raise HTTPException(status_code=502, detail="assistant unavailable") from None

    async def events():
        # Token deltas stream as they arrive; citations + done close it. A mid-stream
        # failure (no 502 possible, headers sent) surfaces as an SSE `error` event.
        try:
            async for chunk in deps["llm"].stream(prompt):
                yield _sse("text", {"text": chunk})
            for citation in citations:
                yield _sse("citation", citation)
        except Exception:
            log.exception("chat_turn: stream failed")
            yield _sse("error", {"detail": "assistant unavailable"})
            return
        yield _sse("done", {})

    return StreamingResponse(events(), media_type="text/event-stream")


class JdRequest(BaseModel):
    brief: str = Field(max_length=16_000)


@router.post("/jd/improve")
async def jd_improve(body: JdRequest, request: Request):
    deps = request.app.state.deps
    identity = _caller_identity(request)
    if identity["role"] not in ("recruiter", "company_admin"):
        raise HTTPException(status_code=403, detail="recruiters only")
    draft = await improve_jd(body.brief, llm=deps["llm"])
    return {"jd_text": draft.jd_text, "suggestions": draft.suggestions}


@router.post("/interview/{application_id}/rtc-token")
async def rtc_token(application_id: str, request: Request):
    deps = request.app.state.deps
    user_id = _caller_user_id(request)
    session = await deps["sessions"].get(application_id)
    if session is None:
        raise HTTPException(status_code=404, detail="interview session not found")
    if session.candidate_user_id != user_id:
        raise HTTPException(status_code=403, detail="not your interview")
    s = deps["settings"]
    if not (s.livekit_api_key and s.livekit_api_secret):
        raise HTTPException(status_code=503, detail="voice interview not configured")
    room = f"interview-{application_id}"
    try:
        token = mint_join_token(
            room,
            user_id,
            api_key=s.livekit_api_key,
            api_secret=s.livekit_api_secret,
            ttl_seconds=s.voice_rtc_token_ttl_seconds,
        )
    except Exception as exc:
        log.exception("rtc-token: mint failed for {}", application_id)
        raise HTTPException(
            status_code=503, detail="voice interview not configured"
        ) from exc
    return {"url": s.livekit_url, "token": token, "room": room}


def create_app(deps) -> FastAPI:
    app = FastAPI(title="ai-agents interview")
    app.state.deps = deps
    # The SPAs call these REST/SSE endpoints cross-origin with a Bearer token, so CORS
    # must allow the FE origins + the Authorization header.
    app.add_middleware(
        CORSMiddleware,
        **cors_config(deps.get("cors_origins") or []),
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["authorization", "content-type"],
    )
    app.add_middleware(CorrelationIdMiddleware)
    app.include_router(router)
    return app
