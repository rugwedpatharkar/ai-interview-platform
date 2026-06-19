"""Unit tests for UtteranceSegmenter (app/infra/voice/vad.py).

All tests use a ``FakeVad`` -- a scripted VAD callable that returns pre-set
speech probabilities with no model or onnxruntime dependency.  This keeps
the gate fully offline.

Segmenter defaults:
- activation_threshold = 0.5
- deactivation_threshold = 0.35
- min_speech_ms = 50  -> 800 samples @ 16 kHz
- min_silence_ms = 550 -> 8800 samples @ 16 kHz

One window = 512 samples = 32 ms.
800 / 512 -> 2 consecutive windows needed to confirm speech onset.
8800 / 512 -> 18 consecutive silence windows to confirm end.

Tests intentionally use simple configurations (min_speech_ms=32 so one
window triggers onset) to keep the fixture data small.
"""

from __future__ import annotations

import asyncio

import numpy as np
import pytest

from app.infra.voice.vad import _WINDOW_BYTES, _WINDOW_SAMPLES, UtteranceSegmenter

# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------


def _silence_window() -> bytes:
    """One 512-sample zero-byte window (16 kHz PCM16 mono)."""
    return b"\x00" * _WINDOW_BYTES


def _noise_window(amplitude: int = 1000) -> bytes:
    """One 512-sample window of constant-value int16 (represents audio)."""
    arr = np.full(_WINDOW_SAMPLES, amplitude, dtype=np.int16)
    return arr.tobytes()


class FakeVad:
    """Scripted VAD callable: returns probabilities from a pre-set sequence.

    Extra calls beyond the sequence return ``below`` (default 0.0).
    """

    def __init__(self, probs: list[float], *, below: float = 0.0) -> None:
        self._probs = iter(probs)
        self._below = below
        self.calls: list[float] = []
        self.resets: int = 0

    def __call__(self, window: np.ndarray) -> float:
        p = next(self._probs, self._below)
        self.calls.append(p)
        return p

    def reset(self) -> None:
        self.resets += 1


def _make_seg(
    probs: list[float], *, min_speech_ms: int = 32, min_silence_ms: int = 32
) -> tuple[UtteranceSegmenter, FakeVad]:
    """Create a segmenter with a scripted FakeVad.

    min_speech_ms=32 -> one 512-sample window confirms speech onset (<=32 ms).
    min_silence_ms=32 -> one silence window after deactivation ends utterance.
    """
    vad = FakeVad(probs)
    seg = UtteranceSegmenter(
        vad,
        activation_threshold=0.5,
        deactivation_threshold=0.35,
        min_speech_ms=min_speech_ms,
        min_silence_ms=min_silence_ms,
    )
    return seg, vad


# ---------------------------------------------------------------------------
# Test: basic utterance emitted on speech + silence sequence
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_utterance_emitted_after_speech_then_silence():
    """VAD fires SPEECH on one window, then SILENCE -> emits utterance."""
    probs = [0.8, 0.1]
    seg, _vad = _make_seg(probs, min_speech_ms=32, min_silence_ms=32)

    seg.feed(_noise_window())  # prob=0.8 -> speech onset confirmed (>=32 ms)
    seg.feed(_silence_window())  # prob=0.1 -> below deact -> silence run -> emit

    utterance = await asyncio.wait_for(seg.next_utterance(), timeout=1.0)
    assert len(utterance) > 0
    assert len(utterance) % 2 == 0  # even bytes (int16)
    assert utterance != b""


@pytest.mark.asyncio
async def test_utterance_contains_speech_windows():
    """Emitted utterance contains exactly the speech + trailing silence samples."""
    probs = [0.8, 0.8, 0.1]  # two speech windows, one silence
    seg, _ = _make_seg(probs, min_speech_ms=32, min_silence_ms=32)

    seg.feed(_noise_window())
    seg.feed(_noise_window())
    seg.feed(_silence_window())

    utterance = await asyncio.wait_for(seg.next_utterance(), timeout=1.0)
    # 3 windows accumulated (w1 as candidate, w2 speech, w3 silence)
    assert len(utterance) == 3 * _WINDOW_BYTES


# ---------------------------------------------------------------------------
# Test: multiple utterances emitted sequentially
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_two_sequential_utterances():
    """Two separate speech segments produce two separate utterances."""
    probs = [0.8, 0.1, 0.8, 0.1]
    seg, vad = _make_seg(probs, min_speech_ms=32, min_silence_ms=32)

    for _ in range(4):
        seg.feed(_noise_window())

    u1 = await asyncio.wait_for(seg.next_utterance(), timeout=1.0)
    u2 = await asyncio.wait_for(seg.next_utterance(), timeout=1.0)

    assert u1 != b""
    assert u2 != b""
    assert vad.resets == 2  # reset called once per finalized utterance


# ---------------------------------------------------------------------------
# Test: sub-threshold blips are discarded (no utterance emitted)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sub_threshold_blip_not_emitted():
    """A single below-threshold window should not trigger an utterance."""
    probs = [0.2, 0.2, 0.2]  # all below activation=0.5
    seg, _ = _make_seg(probs)

    seg.feed(_noise_window())
    seg.feed(_noise_window())
    seg.feed(_noise_window())

    # Queue must remain empty
    assert seg._queue.empty()


@pytest.mark.asyncio
async def test_onset_requires_min_speech_duration():
    """With min_speech_ms=64 (2 windows), one speech window must not trigger onset."""
    probs = [0.8, 0.1]  # speech then silence
    vad = FakeVad(probs)
    seg = UtteranceSegmenter(
        vad,
        activation_threshold=0.5,
        deactivation_threshold=0.35,
        min_speech_ms=64,  # needs 2 windows = 1024 samples
        min_silence_ms=32,
    )

    seg.feed(_noise_window())  # prob=0.8 -> speech_run=512, need 1024 -> no onset
    seg.feed(_silence_window())  # prob=0.1 -> below threshold -> reset candidate

    assert seg._queue.empty()


# ---------------------------------------------------------------------------
# Test: partial window in feed() is buffered, not dropped
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_partial_window_buffered():
    """Feeding partial frames accumulates until a full window is available."""
    probs = [0.8, 0.1]
    seg, _ = _make_seg(probs, min_speech_ms=32, min_silence_ms=32)

    # Split one window into three unequal chunks
    w = _noise_window()
    half = len(w) // 2
    seg.feed(w[:100])
    seg.feed(w[100:half])
    seg.feed(w[half:])  # now a full window is available -> processed

    # Feed the silence window to close the utterance
    seg.feed(_silence_window())

    utterance = await asyncio.wait_for(seg.next_utterance(), timeout=1.0)
    assert len(utterance) > 0


@pytest.mark.asyncio
async def test_partial_leftover_does_not_create_spurious_utterance():
    """Bytes less than one window do NOT trigger VAD -- no utterance emitted."""
    probs = [0.8]
    seg, vad = _make_seg(probs)

    # Feed 256 bytes (half a window) -- should not call VAD at all
    seg.feed(_silence_window()[:256])

    assert len(vad.calls) == 0
    assert seg._queue.empty()


# ---------------------------------------------------------------------------
# Test: reset() clears in-progress utterance
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reset_clears_in_progress():
    """reset() discards buffered speech and resets the VAD state."""
    probs = [0.8, 0.8]
    seg, vad = _make_seg(probs, min_speech_ms=32, min_silence_ms=32)

    seg.feed(_noise_window())  # prob=0.8 -> speaking starts
    assert seg._speaking is True

    seg.reset()

    assert not seg._speaking
    assert seg._speech_windows == []
    assert seg._pcm_buf == b""
    assert seg._queue.empty()
    assert vad.resets >= 1


@pytest.mark.asyncio
async def test_reset_drains_queued_utterances():
    """reset() also discards utterances already in the queue."""
    probs = [0.8, 0.1, 0.8, 0.1]
    seg, _ = _make_seg(probs, min_speech_ms=32, min_silence_ms=32)

    for _ in range(4):
        seg.feed(_noise_window())

    # Queue should have two utterances
    assert not seg._queue.empty()

    seg.reset()
    assert seg._queue.empty()


# ---------------------------------------------------------------------------
# Test: VAD .reset() is called between utterances
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_vad_reset_called_between_utterances():
    """UtteranceSegmenter resets the VAD model after each finalized utterance."""
    probs = [0.8, 0.1, 0.8, 0.1]
    seg, vad = _make_seg(probs, min_speech_ms=32, min_silence_ms=32)

    for _ in range(4):
        seg.feed(_noise_window())

    _ = await asyncio.wait_for(seg.next_utterance(), timeout=1.0)
    _ = await asyncio.wait_for(seg.next_utterance(), timeout=1.0)

    # reset() called once per utterance finalized
    assert vad.resets == 2


# ---------------------------------------------------------------------------
# Test: utterance bytes are valid PCM16 (even length)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_utterance_bytes_are_valid_int16():
    """Emitted utterance can be parsed as int16 PCM without error."""
    probs = [0.9, 0.0]
    seg, _ = _make_seg(probs, min_speech_ms=32, min_silence_ms=32)

    seg.feed(_noise_window())
    seg.feed(_silence_window())

    utterance = await asyncio.wait_for(seg.next_utterance(), timeout=1.0)
    # Round-trip through numpy
    arr = np.frombuffer(utterance, dtype=np.int16)
    assert arr.dtype == np.int16
    assert len(arr) > 0


# ---------------------------------------------------------------------------
# Test: raw-bytes accumulation (Phase 3a)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_utterance_equals_concatenation_of_fed_windows():
    """Emitted utterance bytes == exact concatenation of the fed window bytes."""
    noise = _noise_window()
    silence = _silence_window()
    probs = [0.8, 0.8, 0.1]
    seg, _ = _make_seg(probs, min_speech_ms=32, min_silence_ms=32)

    seg.feed(noise)
    seg.feed(noise)
    seg.feed(silence)

    utterance = await asyncio.wait_for(seg.next_utterance(), timeout=1.0)
    assert utterance == noise + noise + silence
