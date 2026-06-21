"""VoiceTransport unit tests (Task 5 — Tier B TDD foundation).

All tests run offline: SttEngine, TtsEngine, and RoomAudio are fakes from
conftest.py. No LiveKit, Groq, or network calls.
"""

from lib.resilience import OperationTimeout

from app.resources.voice.transport import VoiceTransport

# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


async def test_ask_speaks_question_then_returns_transcribed_answer(
    fake_stt, fake_tts, fake_room
):
    room = fake_room()
    stt = fake_stt()
    tts = fake_tts()
    room.set_utterances([b"<pcm-utterance-1>"])
    stt.set_transcripts(["I used asyncio for concurrency."])

    vt = VoiceTransport(stt=stt, tts=tts, room=room)
    answer = await vt.ask("How did you handle concurrency?")

    assert answer == "I used asyncio for concurrency."
    assert "How did you handle concurrency?" in tts.spoken
    assert ("candidate", "I used asyncio for concurrency.") in room.captions


async def test_ask_captions_question_to_interviewer(fake_stt, fake_tts, fake_room):
    room = fake_room()
    stt = fake_stt()
    tts = fake_tts()
    room.set_utterances([b"<pcm>"])
    stt.set_transcripts(["Some answer."])

    vt = VoiceTransport(stt=stt, tts=tts, room=room)
    await vt.ask("Tell me about yourself.")

    # The first caption must be the interviewer speaking the question.
    assert room.captions[0] == ("interviewer", "Tell me about yourself.")


# ---------------------------------------------------------------------------
# Hangup — candidate drops the call
# ---------------------------------------------------------------------------


async def test_ask_returns_empty_string_on_hangup(fake_stt, fake_tts, fake_room):
    room = fake_room()
    stt = fake_stt()
    tts = fake_tts()
    room.set_utterances([None])  # None = hangup / participant disconnected

    vt = VoiceTransport(stt=stt, tts=tts, room=room)
    answer = await vt.ask("Tell me about yourself.")

    assert answer == ""


# ---------------------------------------------------------------------------
# Empty / garbled STT — re-prompt once then give up
# ---------------------------------------------------------------------------


async def test_ask_reprompts_on_empty_stt_then_returns_empty(
    fake_stt, fake_tts, fake_room
):
    room = fake_room()
    stt = fake_stt()
    tts = fake_tts()
    # Two utterances: both transcribe to empty → exhausts retries → ""
    room.set_utterances([b"<pcm-1>", b"<pcm-2>"])
    stt.set_transcripts(["", ""])

    vt = VoiceTransport(stt=stt, tts=tts, room=room, max_retries=1)
    answer = await vt.ask("Describe a challenge.")

    assert answer == ""
    # The re-prompt TTS text must have been synthesized.
    assert any("repeat" in spoken.lower() for spoken in tts.spoken)


async def test_ask_returns_answer_after_initial_empty_stt(
    fake_stt, fake_tts, fake_room
):
    room = fake_room()
    stt = fake_stt()
    tts = fake_tts()
    # First utterance is empty; second has a real answer.
    room.set_utterances([b"<pcm-1>", b"<pcm-2>"])
    stt.set_transcripts(["", "Got it on the retry."])

    vt = VoiceTransport(stt=stt, tts=tts, room=room, max_retries=1)
    answer = await vt.ask("Describe a challenge.")

    assert answer == "Got it on the retry."
    assert ("candidate", "Got it on the retry.") in room.captions


# ---------------------------------------------------------------------------
# STT raises SttError — treated as empty, follows retry logic
# ---------------------------------------------------------------------------


async def test_ask_treats_stt_error_as_empty_and_reprompts(
    fake_stt, fake_tts, fake_room
):
    room = fake_room()
    stt = fake_stt()
    tts = fake_tts()
    # None sentinel in transcripts triggers SttError; second attempt succeeds.
    room.set_utterances([b"<pcm-1>", b"<pcm-2>"])
    stt.set_transcripts([None, "Recovered after STT error."])

    vt = VoiceTransport(stt=stt, tts=tts, room=room, max_retries=1)
    answer = await vt.ask("What's your greatest strength?")

    assert answer == "Recovered after STT error."


async def test_ask_returns_empty_when_all_stt_attempts_raise(
    fake_stt, fake_tts, fake_room
):
    room = fake_room()
    stt = fake_stt()
    tts = fake_tts()
    room.set_utterances([b"<pcm-1>", b"<pcm-2>"])
    stt.set_transcripts([None, None])  # both raise SttError

    vt = VoiceTransport(stt=stt, tts=tts, room=room, max_retries=1)
    answer = await vt.ask("Tell me about yourself.")

    assert answer == ""


# ---------------------------------------------------------------------------
# OperationTimeout from next_utterance — silence re-prompt
# ---------------------------------------------------------------------------


class _TimeoutThenPcmRoom:
    """Fake room: first next_utterance raises OperationTimeout; second returns PCM."""

    def __init__(self, pcm: bytes):
        self._calls = 0
        self._pcm = pcm
        self.captions = []
        self.played = []

    async def play(self, pcm16_48k):
        async for chunk in pcm16_48k:
            self.played.append(chunk)

    async def next_utterance(self) -> bytes | None:
        self._calls += 1
        if self._calls == 1:
            raise OperationTimeout("livekit.next_utterance", 0.01)
        return self._pcm

    async def send_caption(self, who: str, text: str) -> None:
        self.captions.append((who, text))

    async def aclose(self) -> None:
        pass


class _AlwaysTimeoutRoom:
    """Fake room: next_utterance always raises OperationTimeout."""

    def __init__(self):
        self.captions = []
        self.played = []

    async def play(self, pcm16_48k):
        async for chunk in pcm16_48k:
            self.played.append(chunk)

    async def next_utterance(self) -> bytes | None:
        raise OperationTimeout("livekit.next_utterance", 0.01)

    async def send_caption(self, who: str, text: str) -> None:
        self.captions.append((who, text))

    async def aclose(self) -> None:
        pass


async def test_ask_reprompts_on_utterance_timeout_then_returns_answer(
    fake_stt, fake_tts
):
    """Silence timeout on attempt 0 triggers re-prompt; attempt 1 succeeds."""
    room = _TimeoutThenPcmRoom(b"<pcm>")
    stt = fake_stt()
    tts = fake_tts()
    stt.set_transcripts(["Recovered."])

    vt = VoiceTransport(stt=stt, tts=tts, room=room, max_retries=1)
    answer = await vt.ask("Tell me about yourself.")

    assert answer == "Recovered."
    # A re-prompt was synthesized (the retry prompt contains "repeat")
    assert any("repeat" in spoken.lower() for spoken in tts.spoken)


async def test_ask_returns_empty_when_all_attempts_time_out(fake_stt, fake_tts):
    """When every attempt hits OperationTimeout, ask() returns empty string."""
    room = _AlwaysTimeoutRoom()
    stt = fake_stt()
    tts = fake_tts()

    vt = VoiceTransport(stt=stt, tts=tts, room=room, max_retries=1)
    answer = await vt.ask("Tell me about yourself.")

    assert answer == ""
