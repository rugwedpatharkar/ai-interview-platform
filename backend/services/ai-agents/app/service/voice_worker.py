"""Voice-worker service — reacts to LiveKit webhooks, runs one voice session per room.

Trigger model
-------------
LiveKit POSTs webhooks on room events.  This service runs a small FastAPI HTTP
server exposing ``POST /livekit/webhook``.  Every incoming event is validated
with the LiveKit ``WebhookReceiver`` (HMAC-SHA256 over the raw body using the
configured API secret).

On ``participant_joined`` for a room named ``interview-{application_id}`` where
the joining participant is the candidate (identity NOT the worker's own prefix),
the worker spawns exactly one ``run_voice_interview`` task for that room.
A per-process ``set`` guards against double-spawn if the event fires more than
once before the session is set up.

Per-room lifecycle
------------------
1. Mint a short-TTL worker join token (distinct identity ``agent-{application_id}``).
2. Build ``LiveKitRoomAudio`` + ``GroqStt`` + ``EdgeTts`` → ``VoiceTransport``.
3. ``await run_voice_interview(...)``.
4. ``finally`` block: always ``await room.aclose()``; remove room from in-flight set;
   log any failure.

Dependencies are wired like ``main.py``:
  settings → redis → RedisInterviewStore + Publisher + LLM + MCP data gateway.

Lifecycle
---------
``serve()`` starts a ``McpSessionManager`` (keeping the MCP session alive and
self-healing for the duration), starts uvicorn, and cancels all in-flight tasks
on shutdown.  ``main()`` = ``asyncio.run(serve())``.
"""

from __future__ import annotations

import asyncio
import re

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from lib.logging import configure_logging, get_logger
from lib.observability import init_tracing, start_metrics_server
from lib.rabbitmq import Publisher
from lib.redis import create_redis
from lib.resilience import OperationTimeout, with_timeout
from lib.web import CorrelationIdMiddleware

from app.config import get_settings
from app.infra.factory import get_llm
from app.infra.mcp_data import McpDataGateway
from app.infra.mcp_session import McpSessionManager
from app.infra.sessions import RedisInterviewStore
from app.infra.voice.edge_tts import EdgeTts
from app.infra.voice.groq_stt import GroqStt
from app.infra.voice.livekit_room import LiveKitRoomAudio
from app.infra.voice.vad import SileroOnnxVad, UtteranceSegmenter
from app.resources.voice.rtc_token import mint_join_token
from app.resources.voice.session import run_voice_interview
from app.resources.voice.transport import VoiceTransport
from lib import timeouts

log = get_logger(component="voice_worker")

# Matches room names produced by the rtc-token endpoint: "interview-{application_id}"
_ROOM_RE = re.compile(r"^interview-(.+)$")

# The event type LiveKit sends when a participant enters a room
_PARTICIPANT_JOINED = "participant_joined"

# Fallback shutdown timeout used only if settings cannot be loaded (unreachable in
# normal operation — settings are validated at startup before serve() runs).
_SHUTDOWN_TIMEOUT_S = 10.0


# ---------------------------------------------------------------------------
# Pure decision function — fully unit-testable, no I/O
# ---------------------------------------------------------------------------


def should_start_session(
    event_type: str,
    room_name: str,
    participant_identity: str,
    worker_identity_prefix: str,
    in_flight: set[str] | dict[str, asyncio.Task],
) -> str | None:
    """Decide whether this webhook event should trigger a new voice session.

    This function is pure — it reads no state, makes no network calls, and is
    injected with the relevant context so tests can cover all branches without
    a running server.

    Args:
        event_type: LiveKit webhook event type string (e.g. ``"participant_joined"``).
        room_name: Room name from the webhook payload.
        participant_identity: Identity of the participant who triggered the event.
        worker_identity_prefix: The prefix used for worker participants (e.g.
            ``"agent-"``).  Any identity that starts with this prefix is a worker
            and must NOT trigger a new session.
        in_flight: Set of application_ids for rooms that already have an active
            session task.  Modified externally; never mutated by this function.

    Returns:
        The ``application_id`` string to start a session for, or ``None`` if this
        event should be ignored (wrong event type, non-interview room, worker
        participant, or already in-flight).
    """
    if event_type != _PARTICIPANT_JOINED:
        return None

    m = _ROOM_RE.match(room_name)
    if m is None:
        return None  # not an interview room

    application_id = m.group(1)

    if participant_identity.startswith(worker_identity_prefix):
        return None  # worker joining its own room — ignore

    if application_id in in_flight:
        log.warning(
            "voice_worker: duplicate participant_joined room={} (already in-flight)",
            room_name,
        )
        return None

    return application_id


# ---------------------------------------------------------------------------
# Shutdown helper
# ---------------------------------------------------------------------------


async def cancel_in_flight(
    in_flight: dict[str, asyncio.Task], *, timeout_s: float
) -> None:
    """Cancel and await all in-flight session tasks (bounded)."""
    tasks = list(in_flight.values())
    if not tasks:
        return
    for t in tasks:
        t.cancel()
    try:
        await with_timeout(
            asyncio.gather(*tasks, return_exceptions=True),
            timeout_s,
            op="voice_worker.shutdown",
        )
    except OperationTimeout:
        log.warning(
            "voice_worker: {} session(s) did not cancel within {}s",
            len(tasks),
            timeout_s,
        )


# ---------------------------------------------------------------------------
# Per-room session runner
# ---------------------------------------------------------------------------


async def _safe_aclose_room(room_audio, application_id: str) -> None:
    """Close the LiveKit room, logging (not raising) any teardown error."""
    try:
        await room_audio.aclose()
    except Exception as exc:
        log.warning("voice_worker: room.aclose() error for {}: {}", application_id, exc)


async def _run_session(
    application_id: str,
    candidate_identity: str,
    *,
    settings,
    sessions,
    data,
    publisher,
    llm,
    in_flight: dict[str, asyncio.Task],
) -> None:
    """Build media objects, run the interview, tear down on exit."""
    worker_identity = f"{settings.voice_worker_identity_prefix}{application_id}"
    room_name = f"interview-{application_id}"

    log.info(
        "voice_worker: starting session application_id={} worker_identity={}",
        application_id,
        worker_identity,
    )

    worker_token = mint_join_token(
        room_name,
        worker_identity,
        api_key=settings.livekit_api_key,
        api_secret=settings.livekit_api_secret,
        ttl_seconds=settings.voice_rtc_token_ttl_seconds,
    )

    try:
        vad = SileroOnnxVad.load()
    except Exception as exc:
        log.error("voice_worker: failed to load Silero VAD: {}", exc)
        in_flight.pop(application_id, None)
        return

    segmenter = UtteranceSegmenter(
        vad,
        activation_threshold=settings.voice_vad_activation,
        deactivation_threshold=settings.voice_vad_deactivation,
        min_speech_ms=settings.voice_vad_min_speech_ms,
        min_silence_ms=settings.voice_vad_min_silence_ms,
    )
    room_audio = LiveKitRoomAudio(
        url=settings.livekit_url,
        token=worker_token,
        segmenter=segmenter,
        utterance_timeout_s=settings.voice_utterance_timeout_s,
        play_timeout_s=settings.voice_play_timeout_s,
        disconnect_timeout_s=settings.voice_disconnect_timeout_s,
    )

    try:
        await room_audio.connect()
    except Exception as exc:
        log.error("voice_worker: failed to connect to room {} : {}", room_name, exc)
        in_flight.pop(application_id, None)
        await _safe_aclose_room(room_audio, application_id)
        return

    stt = GroqStt(
        api_key=settings.groq_api_key,
        timeout_seconds=settings.voice_stt_timeout_s,
        max_retries=settings.voice_stt_max_retries,
    )
    tts = EdgeTts(
        voice=settings.voice_tts_voice,
        max_retries=settings.voice_tts_max_retries,
        stream_timeout_seconds=settings.voice_tts_stream_timeout_s,
    )
    transport = VoiceTransport(stt=stt, tts=tts, room=room_audio)

    try:
        await run_voice_interview(
            application_id,
            transport=transport,
            caller_user_id=candidate_identity,
            data=data,
            sessions=sessions,
            llm=llm,
            publisher=publisher,
        )
        log.info("voice_worker: session completed application_id={}", application_id)
    except Exception:
        log.exception(
            "voice_worker: session {} failed; session left resumable in Redis",
            application_id,
        )
    finally:
        in_flight.pop(application_id, None)
        await _safe_aclose_room(room_audio, application_id)


# ---------------------------------------------------------------------------
# FastAPI webhook server
# ---------------------------------------------------------------------------


def _build_webhook_app(
    *, settings, sessions, data, publisher, llm, in_flight: dict[str, asyncio.Task]
) -> FastAPI:
    """Construct the FastAPI webhook listener with all deps closed over."""
    from livekit import api as livekit_api

    app = FastAPI(title="voice-worker-webhook")
    app.add_middleware(CorrelationIdMiddleware)
    receiver = livekit_api.WebhookReceiver(
        settings.livekit_api_key, settings.livekit_api_secret
    )

    @app.post("/livekit/webhook")
    async def livekit_webhook(request: Request):
        body = await request.body()
        auth_header = request.headers.get("Authorization", "")

        try:
            event = receiver.receive(body.decode(), auth_header)
        except Exception as exc:
            log.warning("voice_worker: webhook validation failed: {}", exc)
            raise HTTPException(status_code=400, detail="invalid webhook") from exc

        event_type = event.event
        room_name = event.room.name if event.room else ""
        participant_identity = event.participant.identity if event.participant else ""

        log.debug(
            "voice_worker: webhook event={} room={} participant={}",
            event_type,
            room_name,
            participant_identity,
        )

        application_id = should_start_session(
            event_type,
            room_name,
            participant_identity,
            settings.voice_worker_identity_prefix,
            in_flight,
        )

        if application_id is not None:
            # in-process dedup; cross-replica dedup (Redis SETNX) deferred to Phase 4.
            in_flight[application_id] = asyncio.ensure_future(
                _run_session(
                    application_id,
                    participant_identity,
                    settings=settings,
                    sessions=sessions,
                    data=data,
                    publisher=publisher,
                    llm=llm,
                    in_flight=in_flight,
                )
            )
            log.info(
                "voice_worker: session task spawned application_id={} task={}",
                application_id,
                in_flight[application_id].get_name(),
            )

        return {"ok": True}

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    return app


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


async def serve() -> None:
    s = get_settings()
    configure_logging(s.service_name, s.log_level)
    if s.otlp_endpoint:
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (
            OTLPSpanExporter,
        )

        init_tracing(
            s.service_name,
            exporter=OTLPSpanExporter(endpoint=s.otlp_endpoint, insecure=True),
        )
    else:
        init_tracing(s.service_name, enabled=s.tracing_enabled)
    await start_metrics_server(s.metrics_port)
    log.info("voice-worker starting on port {}", s.voice_worker_http_port)

    redis = create_redis(s.redis_url)
    publisher = Publisher(s.rabbitmq_url, s.rabbitmq_exchange)
    await publisher.connect()

    llm = get_llm(s)

    # McpSessionManager owns the streamablehttp_client lifecycle and self-heals on
    # transport drops — an mcp-data restart no longer crashes the voice-worker. The
    # explicit call_timeout prevents a hung MCP from stalling the live voice loop.
    data_manager = McpSessionManager(s.mcp_data_url, call_timeout_s=timeouts.mcp_call())
    await data_manager.start()
    data = McpDataGateway(data_manager)
    sessions = RedisInterviewStore(redis)

    registry: dict[str, asyncio.Task] = {}

    webhook_app = _build_webhook_app(
        settings=s,
        sessions=sessions,
        data=data,
        publisher=publisher,
        llm=llm,
        in_flight=registry,
    )

    config = uvicorn.Config(
        webhook_app,
        host=s.http_host,
        port=s.voice_worker_http_port,
        log_level=s.log_level.lower(),
    )
    server = uvicorn.Server(config)
    log.info(
        "voice-worker webhook listening on {}:{}",
        s.http_host,
        s.voice_worker_http_port,
    )
    try:
        await server.serve()
    finally:
        await cancel_in_flight(registry, timeout_s=s.voice_shutdown_timeout_s)
        await publisher.close()
        await redis.aclose()
        await data_manager.aclose()
        log.info("voice-worker stopped")


def main() -> None:
    asyncio.run(serve())


if __name__ == "__main__":
    main()
