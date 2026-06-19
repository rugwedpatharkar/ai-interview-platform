"""Unit tests for LiveKitRoomAudio resilience features (Phase 3b).

All tests use small duck-typed fakes — no real LiveKit server.
livekit.rtc is installed so the module imports fine; we bypass connect()
by constructing LiveKitRoomAudio with a fake room and setting internal state
directly.
"""

from __future__ import annotations

import asyncio

import pytest
from lib.resilience import OperationTimeout

from app.infra.voice.livekit_room import LiveKitRoomAudio

# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------


class _FakeSegmenter:
    """Minimal UtteranceSegmenter fake."""

    def __init__(self, utterance: bytes | None = None, *, hang: bool = False):
        self._utterance = utterance
        self._hang = hang

    def feed(self, data: bytes) -> None:
        pass

    async def next_utterance(self) -> bytes:
        if self._hang:
            await asyncio.sleep(3600)
        return self._utterance  # type: ignore[return-value]


class _ErrorStream:
    """Async iterator that raises mid-way."""

    def __aiter__(self):
        return self

    async def __anext__(self):
        raise RuntimeError("stream exploded")


class _NormalStream:
    """Async iterator that ends immediately."""

    def __aiter__(self):
        return self

    async def __anext__(self):
        raise StopAsyncIteration


class _FakeRoom:
    """Minimal rtc.Room duck-type for tests that call aclose()."""

    def __init__(self, *, disconnect_hang: bool = False):
        self._hang = disconnect_hang
        self.on_handlers: dict = {}

    def on(self, event: str, handler) -> None:
        self.on_handlers[event] = handler

    async def disconnect(self) -> None:
        if self._hang:
            await asyncio.sleep(3600)


def _make_room(
    segmenter=None,
    fake_room=None,
    *,
    utterance_timeout_s: float = 90.0,
    disconnect_timeout_s: float = 10.0,
) -> LiveKitRoomAudio:
    """Construct LiveKitRoomAudio with injected fakes (no connect())."""
    seg = segmenter or _FakeSegmenter(b"pcm")
    room = fake_room or _FakeRoom()
    return LiveKitRoomAudio(
        url="ws://fake",
        token="t",
        segmenter=seg,
        room=room,
        utterance_timeout_s=utterance_timeout_s,
        disconnect_timeout_s=disconnect_timeout_s,
    )


# ---------------------------------------------------------------------------
# _feed_loop: must set _candidate_left on exit
# ---------------------------------------------------------------------------


async def test_feed_loop_sets_candidate_left_on_stream_error():
    """A stream error in _feed_loop must unblock next_utterance()."""
    room_audio = _make_room()
    await room_audio._feed_loop(_ErrorStream(), "candidate-1")
    assert room_audio._candidate_left.is_set()


async def test_feed_loop_sets_candidate_left_on_normal_end():
    """Normal stream end in _feed_loop must also unblock next_utterance()."""
    room_audio = _make_room()
    await room_audio._feed_loop(_NormalStream(), "candidate-1")
    assert room_audio._candidate_left.is_set()


# ---------------------------------------------------------------------------
# next_utterance: happy path and hangup
# ---------------------------------------------------------------------------


async def test_next_utterance_returns_segment():
    """next_utterance returns the PCM bytes from the segmenter."""
    room_audio = _make_room(segmenter=_FakeSegmenter(b"pcm"))
    result = await room_audio.next_utterance()
    assert result == b"pcm"


async def test_next_utterance_returns_none_on_hangup():
    """When _candidate_left is set and segmenter hangs, next_utterance returns None."""
    room_audio = _make_room(segmenter=_FakeSegmenter(hang=True))
    room_audio._candidate_left.set()
    result = await room_audio.next_utterance()
    assert result is None


# ---------------------------------------------------------------------------
# next_utterance: timeout raises OperationTimeout
# ---------------------------------------------------------------------------


async def test_next_utterance_raises_timeout_on_silence():
    """next_utterance raises OperationTimeout when silence exceeds the timeout."""
    room_audio = _make_room(
        segmenter=_FakeSegmenter(hang=True),
        utterance_timeout_s=0.01,
    )
    # _candidate_left is NOT set — this is a silence timeout, not a hangup
    with pytest.raises(OperationTimeout):
        await room_audio.next_utterance()


# ---------------------------------------------------------------------------
# aclose: hung disconnect must not stall shutdown
# ---------------------------------------------------------------------------


async def test_aclose_survives_hung_disconnect():
    """aclose() must return even when room.disconnect() never completes."""
    hung_room = _FakeRoom(disconnect_hang=True)
    room_audio = _make_room(fake_room=hung_room, disconnect_timeout_s=0.01)
    # feed_task=None, audio_track=None — skip those teardown branches
    room_audio._feed_task = None
    room_audio._audio_track = None
    # Must return without hanging or raising
    await room_audio.aclose()
