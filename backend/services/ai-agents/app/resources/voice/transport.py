"""VoiceTransport — implements the Transport.ask() seam over voice I/O engines.

This module imports NOTHING from livekit, groq, edge-tts, or any other heavy
dep. It only talks to the three injected Protocol seams (SttEngine, TtsEngine,
RoomAudio) so the gate remains fully offline.

Robustness contract (per spec):
- Both sides of every turn are captioned (interviewer question + candidate answer).
- Empty or garbled STT triggers one re-prompt (configurable via max_retries).
- SttError is caught, logged, and treated as an empty transcript (→ re-prompt).
- None from next_utterance() means the candidate hung up; ask() returns "" so
  the existing interview loop calls finalize and exits cleanly.
- TtsError propagates to the caller — that's a fatal media failure the worker
  must handle at the boundary (outside this seam).
"""

from lib.logging import get_logger
from lib.resilience import OperationTimeout

from app.resources.voice.engines import SttError

log = get_logger(component="voice.transport")

_RETRY_PROMPT = "Sorry, I didn't catch that — could you repeat?"


class VoiceTransport:
    """Bridge between the text-based interview loop and the voice I/O engines.

    Implements the same ``async ask(question) -> str`` contract as the existing
    ``Transport`` Protocol so it drops into ``conduct_interview`` unchanged.
    """

    def __init__(self, *, stt, tts, room, max_retries: int = 1):
        self._stt = stt
        self._tts = tts
        self._room = room
        self._max_retries = max_retries

    async def ask(self, question: str) -> str:
        """Speak *question* into the room, then return the candidate's answer.

        Returns:
            The transcribed answer text, or ``""`` on hangup / exhausted retries.
        """
        await self._room.send_caption("interviewer", question)
        await self._room.play(self._tts.synthesize(question))

        for attempt in range(self._max_retries + 1):
            try:
                pcm = await self._room.next_utterance()
            except OperationTimeout as exc:
                log.info("voice: no speech in {}s; re-prompting", exc.seconds)
                text = ""
            else:
                if pcm is None:
                    log.info("voice: candidate hung up; ending interview")
                    return ""

                try:
                    text = (await self._stt.transcribe(pcm)).strip()
                except SttError:
                    log.exception("voice: STT failed on attempt {}", attempt)
                    text = ""

            if text:
                await self._room.send_caption("candidate", text)
                return text

            if attempt < self._max_retries:
                await self._room.play(self._tts.synthesize(_RETRY_PROMPT))

        log.info(
            "voice: exhausted {} re-prompt(s); returning empty answer",
            self._max_retries,
        )
        return ""
