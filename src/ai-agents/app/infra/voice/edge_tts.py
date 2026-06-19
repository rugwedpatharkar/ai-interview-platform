"""Concrete TtsEngine backed by edge-tts + PyAV resampling.

This is the only file that imports ``edge_tts`` and ``av``. Inject a fake
``communicate_factory`` for tests so the gate runs offline.

text → edge-tts MP3 stream → PyAV decode → 48 kHz mono s16 resample →
yield 480-sample (10 ms) bytes frames to the caller.
"""

import asyncio
import io
from collections.abc import AsyncIterator

import av
import edge_tts
from lib.logging import get_logger
from lib.resilience import OperationTimeout, with_timeout

from app.resources.voice.engines import TtsError

log = get_logger(component="voice.edge_tts")

_DEFAULT_VOICE = "en-US-AvaNeural"
_OUT_RATE = 48_000
_OUT_CHANNELS = "mono"
_OUT_FORMAT = "s16"
_FRAME_SAMPLES = 480  # 10 ms @ 48 kHz
_FRAME_BYTES = _FRAME_SAMPLES * 2  # int16 = 2 bytes per sample
_TTS_STREAM_TIMEOUT_S = 30.0

_RETRYABLE_TOKENS = (
    "403",
    "429",
    "500",
    "502",
    "503",
    "504",
    "Forbidden",
    "Too Many Requests",
    "Temporarily",
)


def _is_retryable(exc: Exception) -> bool:
    """Return True when exc is a transient error worth retrying."""
    if isinstance(exc, (ConnectionError, TimeoutError, OperationTimeout)):
        return True
    msg = str(exc)
    return any(token in msg for token in _RETRYABLE_TOKENS)


def _decode_mp3_to_48k(mp3_bytes: bytes) -> bytes:
    """Decode MP3 bytes and resample to 48 kHz mono s16; return raw PCM bytes."""
    buf = io.BytesIO(mp3_bytes)
    container = av.open(buf)
    resampler = av.AudioResampler(
        format=_OUT_FORMAT, layout=_OUT_CHANNELS, rate=_OUT_RATE
    )
    pcm_chunks: list[bytes] = []
    try:
        for frame in container.decode(audio=0):
            for rf in resampler.resample(frame):
                pcm_chunks.append(bytes(rf.planes[0]))
        # Flush resampler
        for rf in resampler.resample(None):
            pcm_chunks.append(bytes(rf.planes[0]))
    finally:
        container.close()
    return b"".join(pcm_chunks)


def _chunk_into_frames(pcm: bytes) -> list[bytes]:
    """Slice PCM bytes into 480-sample (10 ms) frames; pad the last frame if needed."""
    frames: list[bytes] = []
    for i in range(0, max(len(pcm), _FRAME_BYTES), _FRAME_BYTES):
        frame = pcm[i : i + _FRAME_BYTES]
        if len(frame) < _FRAME_BYTES:
            frame = frame.ljust(_FRAME_BYTES, b"\x00")
        frames.append(frame)
    return frames


class EdgeTts:
    """TtsEngine that synthesizes via edge-tts and resamples MP3→48 kHz PCM via PyAV.

    Args:
        voice: Edge TTS voice name (default: ``en-US-AvaNeural``).
        communicate_factory: Callable ``(text, voice) -> Communicate``; tests inject a
            fake that yields fixture MP3 bytes with NO network access.
        max_retries: Additional attempts after the first on retryable errors.
        base_delay: Backoff base in seconds (doubles each retry).
        stream_timeout_seconds: Per-attempt timeout for the full stream consumption.
    """

    def __init__(
        self,
        *,
        voice: str = _DEFAULT_VOICE,
        communicate_factory=edge_tts.Communicate,
        max_retries: int = 2,
        base_delay: float = 0.5,
        stream_timeout_seconds: float = _TTS_STREAM_TIMEOUT_S,
    ) -> None:
        self._voice = voice
        self._communicate_factory = communicate_factory
        self._attempts = max_retries + 1
        self._base_delay = base_delay
        self._stream_timeout_seconds = stream_timeout_seconds

    def synthesize(self, text: str) -> AsyncIterator[bytes]:
        """Return an async iterator yielding 480-sample (10 ms) PCM16 48 kHz frames.

        The method is a plain ``def`` (not ``async def``) so callers can pass the
        returned async generator directly without an ``await``. Matches the
        ``TtsEngine`` Protocol.

        Retries on transient errors (status codes 403/429/5xx, ConnectionError,
        TimeoutError, OperationTimeout). Raises ``TtsError`` on hard failure or
        after all attempts exhaust.
        """
        return self._gen(text)

    async def _gen(self, text: str) -> AsyncIterator[bytes]:
        mp3_bytes = await self._stream_mp3(text)
        loop = asyncio.get_running_loop()
        pcm = await loop.run_in_executor(None, _decode_mp3_to_48k, mp3_bytes)
        for frame in _chunk_into_frames(pcm):
            yield frame

    async def _stream_mp3(self, text: str) -> bytes:
        """Accumulate all MP3 audio chunks from the edge-tts stream with retries."""
        last: Exception | None = None
        for attempt in range(self._attempts):
            communicate = self._communicate_factory(text, self._voice)
            chunks: list[bytes] = []

            async def _consume() -> None:
                async for chunk in communicate.stream():
                    if chunk["type"] == "audio":
                        chunks.append(chunk["data"])

            try:
                await with_timeout(
                    _consume(), self._stream_timeout_seconds, op="edge_tts.stream"
                )
            except Exception as exc:
                last = exc
                if not _is_retryable(exc):
                    log.error("edge-tts synthesis failed (non-retryable): {}", exc)
                    raise TtsError("TTS synthesis failed") from exc
                log.warning(
                    "edge-tts attempt {}/{} failed (retryable): {}",
                    attempt + 1,
                    self._attempts,
                    exc,
                )
                if attempt + 1 < self._attempts:
                    await asyncio.sleep(self._base_delay * (2**attempt))
                continue

            if not chunks:
                raise TtsError("edge-tts returned no audio data")
            log.info(
                "TTS synthesis OK text_len={} mp3_bytes={}",
                len(text),
                sum(len(c) for c in chunks),
            )
            return b"".join(chunks)

        raise TtsError("TTS synthesis failed after retries") from last
