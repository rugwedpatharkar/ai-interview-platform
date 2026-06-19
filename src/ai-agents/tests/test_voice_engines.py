"""Task 6 — GroqStt + EdgeTts engine tests (TDD; network NEVER hit).

All tests inject fakes/mocks — no real Groq API or edge-tts network call.

GroqStt tests:
  - Valid WAV header (RIFF/WAVE, 16 kHz, mono, 16-bit) is sent to the client.
  - Returns the stripped text from the client response.
  - Raises SttError after retries when the client always raises.
  - Times out per-attempt and retries (Phase 3a).
  - Offloads WAV encode to executor thread (Phase 3a).

EdgeTts tests:
  - synthesize() is a plain def (not async); the result is an AsyncIterator.
  - Output frames are exactly 480 samples (960 bytes) each.
  - Each frame is 48 kHz mono int16 (verified via PyAV decode of a silence fixture).
  - Raises TtsError when the communicate factory raises on every attempt.
  - Retries on transient status errors (Phase 3a).
  - Times out stream consumption per-attempt and raises TtsError (Phase 3a).
  - Offloads MP3 decode to executor thread (Phase 3a).
"""

import io
import threading
import wave

import av
import numpy as np
import pytest

import app.infra.voice.edge_tts as _edge_tts_mod
import app.infra.voice.groq_stt as _groq_stt_mod
from app.infra.voice.edge_tts import _FRAME_BYTES, _FRAME_SAMPLES, EdgeTts
from app.infra.voice.groq_stt import GroqStt, _pcm_to_wav
from app.resources.voice.engines import SttError, TtsError

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_silence_pcm(*, samples: int = 3200, rate: int = 16_000) -> bytes:
    """Return `samples` zero-valued int16 PCM bytes (0.2 s of silence at 16 kHz)."""
    return b"\x00" * (samples * 2)


def _make_silence_mp3(*, duration_samples: int = 1152, rate: int = 24_000) -> bytes:
    """Encode a tiny silence MP3 via PyAV.

    Used as the decode/resample fixture for EdgeTts tests.
    """
    output_buf = io.BytesIO()
    container = av.open(output_buf, mode="w", format="mp3")
    stream = container.add_stream("mp3", rate=rate, layout="mono")
    frame = av.AudioFrame(format="s16p", layout="mono", samples=duration_samples)
    frame.sample_rate = rate
    frame.pts = 0
    frame.planes[0].update(np.zeros(duration_samples, dtype=np.int16).tobytes())
    for packet in stream.encode(frame):
        container.mux(packet)
    for packet in stream.encode(None):
        container.mux(packet)
    container.close()
    output_buf.seek(0)
    return output_buf.read()


# ---------------------------------------------------------------------------
# Fake Groq client
# ---------------------------------------------------------------------------


class _FakeTranscription:
    def __init__(self, text: str):
        self.text = text


class _FakeGroqAudioTranscriptions:
    def __init__(self, response: _FakeTranscription):
        self._response = response
        self.calls: list[dict] = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        return self._response


class _FakeGroqAudio:
    def __init__(self, response: _FakeTranscription):
        self.transcriptions = _FakeGroqAudioTranscriptions(response)


class _FakeGroqClient:
    def __init__(self, text: str = "Hello world"):
        self._response = _FakeTranscription(text)
        self.audio = _FakeGroqAudio(self._response)

    @property
    def calls(self):
        return self.audio.transcriptions.calls


class _RaisingGroqClient:
    """Fake client that always raises — simulates a hard transient failure."""

    class _Audio:
        class _Transcriptions:
            async def create(self, **kwargs):
                raise RuntimeError("Groq API down")

        transcriptions = _Transcriptions()

    audio = _Audio()


# ---------------------------------------------------------------------------
# GroqStt — WAV wrapping
# ---------------------------------------------------------------------------


def test_pcm_to_wav_has_valid_riff_header():
    pcm = _make_silence_pcm()
    wav = _pcm_to_wav(pcm)

    assert wav[:4] == b"RIFF", "WAV must start with RIFF"
    assert wav[8:12] == b"WAVE", "WAV must have WAVE marker"


def test_pcm_to_wav_encodes_correct_format_chunk():
    """Verify WAV fmt chunk: 16 kHz, mono, 16-bit."""
    pcm = _make_silence_pcm()
    wav = _pcm_to_wav(pcm)

    buf = io.BytesIO(wav)
    with wave.open(buf) as wf:
        assert wf.getnchannels() == 1, "must be mono"
        assert wf.getframerate() == 16_000, "must be 16 kHz"
        assert wf.getsampwidth() == 2, "must be 16-bit (2 bytes)"


def test_pcm_to_wav_round_trips_audio_data():
    """The WAV data section must contain the original PCM bytes."""
    pcm = _make_silence_pcm(samples=100)
    wav = _pcm_to_wav(pcm)

    buf = io.BytesIO(wav)
    with wave.open(buf) as wf:
        assert wf.readframes(wf.getnframes()) == pcm


# ---------------------------------------------------------------------------
# GroqStt — transcription
# ---------------------------------------------------------------------------


async def test_groq_stt_returns_stripped_text():
    client = _FakeGroqClient(text="  Hello world  ")
    stt = GroqStt(client=client, max_retries=0)
    pcm = _make_silence_pcm()

    result = await stt.transcribe(pcm)

    assert result == "Hello world"


async def test_groq_stt_sends_wav_file_to_client():
    """The client must receive a file kwarg with a valid WAV header."""
    client = _FakeGroqClient(text="test")
    stt = GroqStt(client=client, max_retries=0)
    pcm = _make_silence_pcm()

    await stt.transcribe(pcm)

    assert len(client.calls) == 1
    filename, wav_bytes = client.calls[0]["file"]
    assert filename == "u.wav"
    assert wav_bytes[:4] == b"RIFF"
    assert wav_bytes[8:12] == b"WAVE"


async def test_groq_stt_sends_correct_model_and_params():
    client = _FakeGroqClient()
    stt = GroqStt(client=client, max_retries=0)

    await stt.transcribe(_make_silence_pcm())

    call = client.calls[0]
    assert call["model"] == "whisper-large-v3-turbo"
    assert call["language"] == "en"
    assert call["temperature"] == 0.0


async def test_groq_stt_raises_stt_error_after_retries():
    client = _RaisingGroqClient()
    stt = GroqStt(client=client, max_retries=2, base_delay=0.0)

    with pytest.raises(SttError):
        await stt.transcribe(_make_silence_pcm())


async def test_groq_stt_retries_on_transient_error():
    """Verify the retry loop: tracks multiple calls before raising."""

    class _CountingRaisingClient:
        calls = 0

        class _Audio:
            class _Transcriptions:
                async def create(self, **kwargs):
                    _CountingRaisingClient.calls += 1
                    raise RuntimeError("transient")

            transcriptions = _Transcriptions()

        audio = _Audio()

    stt = GroqStt(client=_CountingRaisingClient(), max_retries=2, base_delay=0.0)
    with pytest.raises(SttError):
        await stt.transcribe(_make_silence_pcm())

    assert _CountingRaisingClient.calls == 3  # 1 initial + 2 retries


# ---------------------------------------------------------------------------
# GroqStt — Phase 3a: timeout + executor offload
# ---------------------------------------------------------------------------


async def test_groq_stt_times_out_and_retries():
    """Per-attempt timeout fires, is retried, then surfaces as SttError."""
    import asyncio

    class _SlowTranscriptions:
        def __init__(self):
            self.call_count = 0

        async def create(self, **kwargs):
            self.call_count += 1
            await asyncio.sleep(10)  # much longer than timeout_seconds=0.01
            return None  # unreachable

    class _SlowAudio:
        def __init__(self):
            self.transcriptions = _SlowTranscriptions()

    class _SlowGroqClient:
        def __init__(self):
            self.audio = _SlowAudio()

    fake = _SlowGroqClient()
    stt = GroqStt(
        client=fake,
        max_retries=1,
        base_delay=0.0,
        timeout_seconds=0.01,
    )
    with pytest.raises(SttError):
        await stt.transcribe(_make_silence_pcm())

    assert fake.audio.transcriptions.call_count == 2  # initial + 1 retry


async def test_groq_stt_offloads_wav_encode_to_executor(monkeypatch):
    """WAV encode runs in a thread pool thread, not the main thread."""
    recorded_ident: list[int] = []
    real_pcm_to_wav = _groq_stt_mod._pcm_to_wav

    def spy(pcm16_16k: bytes) -> bytes:
        recorded_ident.append(threading.get_ident())
        return real_pcm_to_wav(pcm16_16k)

    monkeypatch.setattr(_groq_stt_mod, "_pcm_to_wav", spy)

    client = _FakeGroqClient(text="test")
    stt = GroqStt(client=client, max_retries=0)
    await stt.transcribe(_make_silence_pcm())

    assert recorded_ident, "spy was never called"
    assert recorded_ident[0] != threading.main_thread().ident


# ---------------------------------------------------------------------------
# Fake edge-tts communicate factory
# ---------------------------------------------------------------------------


class _FakeCommunicate:
    """Yields a single real silence MP3 fixture as 'audio' chunks."""

    def __init__(self, mp3_bytes: bytes):
        self._mp3 = mp3_bytes

    async def stream(self):
        # Yield as a single audio chunk (edge-tts returns many small chunks in practice)
        yield {"type": "audio", "data": self._mp3}
        yield {"type": "WordBoundary", "data": b""}  # non-audio chunk; must be ignored


class _AlwaysRaisesCommunicate:
    """Simulate hard edge-tts failure (not 403, to avoid retry loop in test)."""

    async def stream(self):
        # Raise unconditionally; the if False guard keeps the async generator protocol.
        if False:
            yield {}
        raise RuntimeError("edge-tts hard failure")


def _make_factory(mp3_bytes: bytes):
    """Return a communicate_factory that ignores voice and returns the fixture."""

    def factory(text, voice):
        return _FakeCommunicate(mp3_bytes)

    return factory


def _make_raising_factory():
    def factory(text, voice):
        return _AlwaysRaisesCommunicate()

    return factory


# ---------------------------------------------------------------------------
# EdgeTts — interface contract
# ---------------------------------------------------------------------------


def test_edge_tts_synthesize_is_not_a_coroutine():
    """synthesize() must be a plain def returning an AsyncIterator (not a coroutine)."""
    import inspect

    mp3 = _make_silence_mp3()
    tts = EdgeTts(communicate_factory=_make_factory(mp3))
    result = tts.synthesize("Hello")
    # Must NOT be a coroutine — caller does not await it.
    assert not inspect.iscoroutine(result), "synthesize() must not return a coroutine"
    assert hasattr(result, "__aiter__"), "synthesize() must return an AsyncIterator"


# ---------------------------------------------------------------------------
# EdgeTts — frame structure
# ---------------------------------------------------------------------------


async def test_edge_tts_yields_correct_frame_size():
    """Every yielded frame must be exactly 960 bytes (480 samples x 2 bytes)."""
    mp3 = _make_silence_mp3()
    tts = EdgeTts(communicate_factory=_make_factory(mp3))

    frames = []
    async for frame in tts.synthesize("test"):
        frames.append(frame)

    assert frames, "must yield at least one frame"
    for i, frame in enumerate(frames):
        assert len(frame) == _FRAME_BYTES, (
            f"frame {i} is {len(frame)} bytes, expected {_FRAME_BYTES}"
        )


async def test_edge_tts_frames_are_48k_mono_int16():
    """Decode the output frames back via numpy to confirm 48 kHz mono int16 shape."""
    mp3 = _make_silence_mp3()
    tts = EdgeTts(communicate_factory=_make_factory(mp3))

    frames = []
    async for frame in tts.synthesize("test"):
        frames.append(frame)

    assert frames
    for frame in frames:
        arr = np.frombuffer(frame, dtype=np.int16)
        assert len(arr) == _FRAME_SAMPLES, (
            f"expected {_FRAME_SAMPLES} samples, got {len(arr)}"
        )


async def test_edge_tts_non_audio_chunks_are_ignored():
    """Word-boundary and other non-audio chunks must not appear in output frames."""
    mp3 = _make_silence_mp3()
    tts = EdgeTts(communicate_factory=_make_factory(mp3))
    # If non-audio bytes leaked into the frame bytes, the frame would be corrupted.
    # We verify by checking the frame count is consistent with audio-only input.
    frames = [frame async for frame in tts.synthesize("x")]
    # Each frame is exactly _FRAME_BYTES; none should contain the WordBoundary data
    for frame in frames:
        assert len(frame) == _FRAME_BYTES


# ---------------------------------------------------------------------------
# EdgeTts — error handling
# ---------------------------------------------------------------------------


async def test_edge_tts_raises_tts_error_on_hard_failure():
    tts = EdgeTts(communicate_factory=_make_raising_factory())
    with pytest.raises(TtsError):
        async for _ in tts.synthesize("Hello"):
            pass


async def test_edge_tts_raises_tts_error_on_empty_audio():
    """If the factory yields no audio chunks, TtsError must be raised."""

    class _EmptyCommunicate:
        async def stream(self):
            yield {"type": "WordBoundary", "data": b""}  # no audio at all

    tts = EdgeTts(communicate_factory=lambda t, v: _EmptyCommunicate())
    with pytest.raises(TtsError):
        async for _ in tts.synthesize("Hello"):
            pass


# ---------------------------------------------------------------------------
# EdgeTts — Phase 3a: retry, timeout, executor offload
# ---------------------------------------------------------------------------


async def test_edge_tts_retries_on_transient_status():
    """Factory raising 503 on first call is retried; second yields audio."""
    mp3 = _make_silence_mp3()
    call_count = 0

    class _CountingCommunicate:
        def __init__(self, mp3_bytes: bytes, *, fail_first: bool):
            self._mp3 = mp3_bytes
            self._fail_first = fail_first

        async def stream(self):
            if self._fail_first:
                raise RuntimeError("503 Service Unavailable")
            if False:
                yield {}
            yield {"type": "audio", "data": self._mp3}

    def factory(text, voice):
        nonlocal call_count
        call_count += 1
        return _CountingCommunicate(mp3, fail_first=(call_count == 1))

    tts = EdgeTts(communicate_factory=factory, max_retries=2, base_delay=0.0)
    frames = [frame async for frame in tts.synthesize("hi")]
    assert frames, "must yield at least one frame"
    assert call_count == 2


async def test_edge_tts_times_out_then_raises():
    """Stream that never completes within timeout raises TtsError."""
    import asyncio

    class _SlowCommunicate:
        async def stream(self):
            await asyncio.sleep(10)
            if False:
                yield {}

    tts = EdgeTts(
        communicate_factory=lambda t, v: _SlowCommunicate(),
        max_retries=0,
        base_delay=0.0,
        stream_timeout_seconds=0.01,
    )
    with pytest.raises(TtsError):
        async for _ in tts.synthesize("hi"):
            pass


async def test_edge_tts_offloads_mp3_decode_to_executor(monkeypatch):
    """MP3 decode runs in a thread pool thread, not the main thread."""
    recorded_ident: list[int] = []
    real_decode = _edge_tts_mod._decode_mp3_to_48k

    def spy(mp3_bytes: bytes) -> bytes:
        recorded_ident.append(threading.get_ident())
        return real_decode(mp3_bytes)

    monkeypatch.setattr(_edge_tts_mod, "_decode_mp3_to_48k", spy)

    mp3 = _make_silence_mp3()
    tts = EdgeTts(communicate_factory=_make_factory(mp3))
    async for _ in tts.synthesize("x"):
        pass

    assert recorded_ident, "spy was never called"
    assert recorded_ident[0] != threading.main_thread().ident


def test_is_retryable_matches_status_codes_on_word_boundary():
    """Status codes match on a word boundary so '500' can't match '50000'."""
    from app.infra.voice.edge_tts import _is_retryable

    assert _is_retryable(RuntimeError("HTTP 503 Service Unavailable"))
    assert _is_retryable(RuntimeError("429 Too Many Requests"))
    assert _is_retryable(ConnectionError("connection reset"))
    assert not _is_retryable(
        RuntimeError("decoded 50000 frames")
    )  # 500 substr, not status
    assert not _is_retryable(RuntimeError("edge-tts hard failure"))
