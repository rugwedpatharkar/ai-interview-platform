"""Concrete TtsEngine backed by edge-tts + PyAV resampling.

This is the only file that imports ``edge_tts`` and ``av``. Inject a fake
``communicate_factory`` for tests so the gate runs offline.

text → edge-tts MP3 stream → PyAV decode → 48 kHz mono s16 resample →
yield 480-sample (10 ms) bytes frames to the caller.
"""

import io
from collections.abc import AsyncIterator

import av
import edge_tts
from lib.logging import get_logger

from app.resources.voice.engines import TtsError

log = get_logger(component="voice.edge_tts")

_DEFAULT_VOICE = "en-US-AvaNeural"
_OUT_RATE = 48_000
_OUT_CHANNELS = "mono"
_OUT_FORMAT = "s16"
_FRAME_SAMPLES = 480  # 10 ms @ 48 kHz
_FRAME_BYTES = _FRAME_SAMPLES * 2  # int16 = 2 bytes per sample


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
    """

    def __init__(
        self,
        *,
        voice: str = _DEFAULT_VOICE,
        communicate_factory=edge_tts.Communicate,
    ) -> None:
        self._voice = voice
        self._communicate_factory = communicate_factory

    def synthesize(self, text: str) -> AsyncIterator[bytes]:
        """Return an async iterator yielding 480-sample (10 ms) PCM16 48 kHz frames.

        The method is a plain ``def`` (not ``async def``) so callers can pass the
        returned async generator directly without an ``await``. Matches the
        ``TtsEngine`` Protocol.

        Retries once on the known intermittent 403 from edge-tts.
        Raises ``TtsError`` on hard failure.
        """
        return self._gen(text)

    async def _gen(self, text: str) -> AsyncIterator[bytes]:
        mp3_bytes = await self._stream_mp3(text)
        pcm = _decode_mp3_to_48k(mp3_bytes)
        for frame in _chunk_into_frames(pcm):
            yield frame

    async def _stream_mp3(self, text: str, *, _retry: bool = True) -> bytes:
        """Accumulate all MP3 audio chunks from the edge-tts stream."""
        communicate = self._communicate_factory(text, self._voice)
        chunks: list[bytes] = []
        try:
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    chunks.append(chunk["data"])
        except Exception as exc:
            msg = str(exc)
            if _retry and ("403" in msg or "Forbidden" in msg):
                log.warning("edge-tts 403 on first attempt, retrying once: {}", exc)
                return await self._stream_mp3(text, _retry=False)
            log.error("edge-tts synthesis failed: {}", exc)
            raise TtsError("TTS synthesis failed") from exc
        if not chunks:
            raise TtsError("edge-tts returned no audio data")
        log.info(
            "TTS synthesis OK text_len={} mp3_bytes={}",
            len(text),
            sum(len(c) for c in chunks),
        )
        return b"".join(chunks)
