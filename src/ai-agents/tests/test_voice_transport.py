"""VoiceTransport unit tests (Task 5 — Tier B TDD foundation).

All tests run offline: SttEngine, TtsEngine, and RoomAudio are fakes from
conftest.py. No LiveKit, Groq, or network calls.
"""

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
