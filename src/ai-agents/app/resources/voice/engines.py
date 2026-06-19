"""Voice engine seam Protocols + typed error hierarchy.

No third-party imports here — keep this dep-free so the gate stays offline.
Concrete implementations (Groq STT, edge-tts TTS, LiveKit RoomAudio) live in
``app/infra/voice/`` and are the only files that import those heavy deps.
"""

from collections.abc import AsyncIterator
from typing import Protocol, runtime_checkable


class VoiceError(Exception):
    """Base for all voice-plane errors."""


class SttError(VoiceError):
    """Speech-to-text transcription failed (hard, after retries)."""


class TtsError(VoiceError):
    """Text-to-speech synthesis failed (hard, after retries)."""


class RoomError(VoiceError):
    """LiveKit room / media transport error."""


@runtime_checkable
class SttEngine(Protocol):
    async def transcribe(self, pcm16_16k: bytes) -> str:
        """Transcribe one VAD-segmented utterance (PCM16, 16 kHz) to text."""
        ...


@runtime_checkable
class TtsEngine(Protocol):
    def synthesize(self, text: str) -> AsyncIterator[bytes]:
        """Synthesize *text*; yield PCM16 48 kHz frames (10 ms / 480 samples each)."""
        ...


@runtime_checkable
class RoomAudio(Protocol):
    async def play(self, pcm16_48k: AsyncIterator[bytes]) -> None:
        """Publish a TTS frame stream to the LiveKit room."""
        ...

    async def next_utterance(self) -> bytes | None:
        """Return the next VAD-segmented 16 kHz PCM utterance, or None on hangup."""
        ...

    async def send_caption(self, who: str, text: str) -> None:
        """Broadcast a caption data message to all room participants."""
        ...

    async def aclose(self) -> None:
        """Disconnect from the room and release all media resources."""
        ...
