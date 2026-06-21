"""Concrete SttEngine backed by Groq Whisper.

This is the only file that imports ``groq``. Inject a fake client for tests
so the gate runs offline — no network is ever touched in tests.

PCM16 mono 16 kHz bytes → WAV (stdlib wave) → Groq transcription → stripped text.
"""

import asyncio
import io
import time
import wave

from groq import AsyncGroq
from lib.logging import get_logger
from lib.observability import counter, histogram
from lib.resilience import with_timeout

from app.resources.voice.engines import SttError

log = get_logger(component="voice.groq_stt")

_MODEL = "whisper-large-v3-turbo"
_SAMPLE_RATE = 16_000
_SAMPLE_WIDTH = 2  # 16-bit = 2 bytes
_CHANNELS = 1
_STT_TIMEOUT_S = 30.0

_stt_total = counter("stt_transcribe_total", "Groq STT transcription calls")
_stt_errors = counter("stt_transcribe_errors_total", "Groq STT calls that failed")
_stt_duration = histogram(
    "stt_transcribe_duration_ms", "Groq STT transcription duration (ms)"
)


def _pcm_to_wav(pcm16_16k: bytes) -> bytes:
    """Wrap raw PCM16 mono 16 kHz bytes in a minimal in-memory WAV container."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(_CHANNELS)
        wf.setsampwidth(_SAMPLE_WIDTH)
        wf.setframerate(_SAMPLE_RATE)
        wf.writeframes(pcm16_16k)
    return buf.getvalue()


class GroqStt:
    """SttEngine that uses Groq Whisper for transcription.

    Args:
        client: Pre-built ``AsyncGroq`` client (tests inject a fake).
        api_key: Used to build a real ``AsyncGroq`` lazily if no client given.
        model: Whisper model id (default: ``whisper-large-v3-turbo``).
        max_retries: Number of additional attempts after the first on transient errors.
        base_delay: Backoff base in seconds (doubles each retry).
        timeout_seconds: Per-attempt timeout for the Groq network call.
    """

    def __init__(
        self,
        *,
        client: AsyncGroq | None = None,
        api_key: str = "",
        model: str = _MODEL,
        max_retries: int = 2,
        base_delay: float = 0.5,
        timeout_seconds: float = _STT_TIMEOUT_S,
    ) -> None:
        self._client = client or AsyncGroq(api_key=api_key)
        self._model = model
        self._attempts = max_retries + 1
        self._base_delay = base_delay
        self._timeout_seconds = timeout_seconds

    async def transcribe(self, pcm16_16k: bytes) -> str:
        """Transcribe one VAD-segmented utterance to text.

        Wraps the PCM bytes in a WAV container, sends to Groq Whisper with
        bounded retries on transient errors. Raises ``SttError`` after all
        attempts fail. Never logs the audio bytes or API key.
        """
        loop = asyncio.get_running_loop()
        wav_bytes = await loop.run_in_executor(None, _pcm_to_wav, pcm16_16k)
        _stt_total.inc()
        last: Exception | None = None
        for attempt in range(self._attempts):
            t0 = time.monotonic()
            try:
                resp = await with_timeout(
                    self._client.audio.transcriptions.create(
                        file=("u.wav", wav_bytes),
                        model=self._model,
                        language="en",
                        temperature=0.0,
                    ),
                    self._timeout_seconds,
                    op="groq.transcribe",
                )
                elapsed = time.monotonic() - t0
                _stt_duration.observe(elapsed * 1000)
                log.info(
                    "STT transcription OK attempt={} duration_ms={:.0f}",
                    attempt + 1,
                    elapsed * 1000,
                )
                return resp.text.strip()
            except Exception as exc:
                last = exc
                elapsed = time.monotonic() - t0
                log.warning(
                    "STT attempt {}/{} failed after {:.0f}ms: {}",
                    attempt + 1,
                    self._attempts,
                    elapsed * 1000,
                    exc,
                )
                if attempt + 1 < self._attempts:
                    await asyncio.sleep(self._base_delay * (2**attempt))
        _stt_errors.inc()
        raise SttError("STT failed after retries") from last
