"""FastAPI practice endpoints — the one REST surface on ai-agents (post-G6 all-gRPC).

Detached, candidate-private mock interview: authenticates the candidate access token,
then drives the practice resources. Collaborators live on ``app.state.deps`` (set by
``create_practice_app``), overridden with fakes in tests. NO comp_id / job_id /
application_id in any route — practice never reaches the funnel. Domain errors map to
HTTP status here; ownership lives in the resource.
"""

from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError
from lib.logging import bind_ids, get_logger, log_context
from lib.web import CorrelationIdMiddleware, cors_config
from pydantic import BaseModel, Field

from app.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.resources.practice import (
    get_practice_feedback,
    list_practice_sessions,
    start_practice,
    submit_practice_turn,
)

log = get_logger(component="route.practice_api")
router = APIRouter()

# Domain error -> HTTP status. Same mapping the interview routes used.
_STATUS = {
    NotFoundError: 404,
    ForbiddenError: 403,
    ConflictError: 409,
    ValidationError: 400,
}


class StartRequest(BaseModel):
    topic: str | None = None
    jd_text: str | None = None


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


def _abort(exc) -> HTTPException:
    return HTTPException(status_code=_STATUS[type(exc)], detail=str(exc))


@router.post("/practice/start")
async def practice_start(body: StartRequest, request: Request):
    deps = request.app.state.deps
    user_id = _caller_user_id(request)
    async with log_context(log, "api.practice.start", **bind_ids(user_id=user_id)):
        try:
            practice_id, question = await start_practice(
                topic=body.topic,
                jd_text=body.jd_text,
                caller_user_id=user_id,
                data=deps["data"],
                sessions=deps["practice_sessions"],
                llm=deps["llm"],
            )
        except ValidationError as e:
            raise _abort(e) from e
    return {"practice_id": practice_id, "question": question}


@router.post("/practice/{practice_id}/turn")
async def practice_turn(practice_id: str, body: TurnRequest, request: Request):
    deps = request.app.state.deps
    user_id = _caller_user_id(request)
    async with log_context(log, "api.practice.turn", **bind_ids(user_id=user_id)):
        try:
            decision = await submit_practice_turn(
                practice_id,
                body.answer,
                caller_user_id=user_id,
                sessions=deps["practice_sessions"],
                data=deps["data"],
                llm=deps["llm"],
            )
        except (NotFoundError, ForbiddenError, ConflictError) as e:
            raise _abort(e) from e
    return {"done": decision.done, "question": decision.question or ""}


@router.get("/practice/sessions")
async def practice_sessions(request: Request):
    deps = request.app.state.deps
    user_id = _caller_user_id(request)
    rows = await list_practice_sessions(caller_user_id=user_id, data=deps["data"])
    return {"sessions": rows}


@router.get("/practice/{practice_id}/feedback")
async def practice_feedback(practice_id: str, request: Request):
    deps = request.app.state.deps
    user_id = _caller_user_id(request)
    async with log_context(log, "api.practice.feedback", **bind_ids(user_id=user_id)):
        try:
            summary = await get_practice_feedback(
                practice_id,
                caller_user_id=user_id,
                data=deps["data"],
                sessions=deps["practice_sessions"],
            )
        except (NotFoundError, ConflictError) as e:
            raise _abort(e) from e
    return {
        "evaluation_summary": summary.get("evaluation_summary", ""),
        "feedback": summary.get("feedback", {}),
    }


def create_practice_app(deps) -> FastAPI:
    app = FastAPI(title="ai-agents practice")
    app.state.deps = deps
    # The candidate SPA calls these cross-origin with a Bearer token, so CORS must
    # allow the FE origins + the Authorization header.
    app.add_middleware(
        CORSMiddleware,
        **cors_config(deps.get("cors_origins") or []),
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["authorization", "content-type"],
    )
    app.add_middleware(CorrelationIdMiddleware)
    app.include_router(router)
    return app
