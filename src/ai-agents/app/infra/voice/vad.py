"""Silero VAD utterance segmenter.

Architecture
------------
``UtteranceSegmenter`` is pure state-machine logic -- it buffers 16 kHz PCM16
frames, slices them into exactly-512-sample float32 windows, feeds each window
to an injected ``VadCallable``, and accumulates the raw PCM16 into an utterance
buffer.  When the VAD reports end-of-speech the completed utterance bytes are
placed on an ``asyncio.Queue``; the caller drains it via ``next_utterance()``.

The ``VadCallable`` protocol is deliberately minimal so tests inject a
``FakeVad`` with no model or runtime dependency.

``SileroOnnxVad`` provides the production implementation using onnxruntime +
the Silero VAD v5 ONNX model bundled in this file.  It is only imported /
instantiated inside ``app/infra/voice/*``; the rest of the codebase (engines,
transport, tests) never touches onnxruntime.
"""

from __future__ import annotations

import asyncio
import contextlib
from pathlib import Path
from typing import Protocol

import numpy as np
from lib.logging import get_logger

log = get_logger(component="voice.vad")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_SAMPLE_RATE = 16_000  # Silero operates at 16 kHz
_WINDOW_SAMPLES = 512  # exactly 512 samples per inference window (32 ms)
_WINDOW_BYTES = _WINDOW_SAMPLES * 2  # 16-bit = 2 bytes / sample

_DEFAULT_ACTIVATION = 0.5  # speech probability -> speaking
_DEFAULT_DEACTIVATION = 0.35  # speech probability -> silence (activation - 0.15)
_DEFAULT_MIN_SPEECH_MS = 50  # ignore sub-50 ms blips
_DEFAULT_MIN_SILENCE_MS = 550  # 550 ms trailing silence ends the utterance

# ---------------------------------------------------------------------------
# VadCallable Protocol
# ---------------------------------------------------------------------------


class VadCallable(Protocol):
    """Callable fed one 512-sample float32 window; returns a speech probability [0,1].

    Stateful (hidden RNN state lives inside the implementor).  Call ``reset()``
    between utterances.
    """

    def __call__(self, window: np.ndarray) -> float:
        """Process one 512-sample float32 window; return speech probability."""
        ...

    def reset(self) -> None:
        """Reset internal RNN state for the next utterance."""
        ...


# ---------------------------------------------------------------------------
# UtteranceSegmenter
# ---------------------------------------------------------------------------


class UtteranceSegmenter:
    """Buffer 16 kHz PCM16 frames, VAD-segment them, emit complete utterances.

    Args:
        vad: Any callable satisfying ``VadCallable`` (real Silero or fake).
        activation_threshold: Probability above which a frame is speech.
        deactivation_threshold: Probability below which speech ends.
        min_speech_ms: Minimum run of speech before START is confirmed.
        min_silence_ms: Trailing silence (ms) required to end an utterance.
        maxsize: Max utterances queued before back-pressure (default 4).
    """

    def __init__(
        self,
        vad: VadCallable,
        *,
        activation_threshold: float = _DEFAULT_ACTIVATION,
        deactivation_threshold: float = _DEFAULT_DEACTIVATION,
        min_speech_ms: int = _DEFAULT_MIN_SPEECH_MS,
        min_silence_ms: int = _DEFAULT_MIN_SILENCE_MS,
        maxsize: int = 4,
    ) -> None:
        self._vad = vad
        self._act = activation_threshold
        self._deact = deactivation_threshold
        self._min_speech_samples = int(_SAMPLE_RATE * min_speech_ms / 1000)
        self._min_silence_samples = int(_SAMPLE_RATE * min_silence_ms / 1000)

        # PCM16 bytes not yet consumed into a complete 512-sample window
        self._pcm_buf: bytes = b""
        # raw window bytes in the current speech accumulation buffer
        self._speech_windows: list[bytes] = []
        # preallocated float32 buffer reused every window (avoids per-window alloc)
        self._f32_buf = np.zeros(_WINDOW_SAMPLES, dtype=np.float32)

        # VAD state machine
        self._speaking: bool = False
        self._speech_run: int = 0  # consecutive speech samples (confirm onset)
        self._silence_run: int = 0  # consecutive silence samples (confirm offset)

        self._queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=maxsize)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def feed(self, pcm16_16k: bytes) -> None:
        """Feed a chunk of 16 kHz PCM16 mono bytes (any size) to the segmenter.

        Internally slices the bytes into 512-sample windows and runs VAD on each.
        Completed utterances are placed on the internal queue.
        """
        self._pcm_buf += pcm16_16k
        while len(self._pcm_buf) >= _WINDOW_BYTES:
            window_bytes = self._pcm_buf[:_WINDOW_BYTES]
            self._pcm_buf = self._pcm_buf[_WINDOW_BYTES:]
            self._process_window(window_bytes)

    async def next_utterance(self) -> bytes:
        """Await the next complete utterance (16 kHz PCM16 mono bytes).

        Blocks until a full utterance is available.  The caller should
        check the LiveKit participant state externally for hangup detection.
        """
        return await self._queue.get()

    def reset(self) -> None:
        """Clear all state; discard any in-progress utterance."""
        self._pcm_buf = b""
        self._speech_windows.clear()
        self._speaking = False
        self._speech_run = 0
        self._silence_run = 0
        self._vad.reset()
        # drain any queued utterances
        while not self._queue.empty():
            with contextlib.suppress(asyncio.QueueEmpty):
                self._queue.get_nowait()

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _process_window(self, window_bytes: bytes) -> None:
        """Run VAD on exactly one 512-sample window and update state machine."""
        # Decode int16 -> float32 in [-1, 1] for Silero, reusing preallocated buffer.
        int16_arr = np.frombuffer(window_bytes, dtype=np.int16)
        np.true_divide(int16_arr, 32768.0, out=self._f32_buf)
        # VAD inference: sub-millisecond single-window run on a 1.8 MB model
        # configured single-threaded/sequential; onnxruntime releases the GIL during
        # Run. Moving to a thread would force feed() async (it is called synchronously
        # from the LiveKit AudioStream callback) and add cross-thread hazards to the
        # stateful RNN. Keep inline.
        prob = self._vad(self._f32_buf)

        if self._speaking:
            # Accumulate raw window bytes (window_bytes is already an immutable bytes
            # object from slicing -- no copy needed)
            self._speech_windows.append(window_bytes)

            if prob > self._deact:
                # Still speech -- reset silence counter
                self._silence_run = 0
            else:
                self._silence_run += _WINDOW_SAMPLES
                if self._silence_run >= self._min_silence_samples:
                    # End of utterance confirmed
                    self._finalize_utterance()
        else:
            if prob >= self._act:
                self._speech_run += _WINDOW_SAMPLES
                # Buffer candidate window even before confirming speech
                self._speech_windows.append(window_bytes)
                if self._speech_run >= self._min_speech_samples:
                    self._speaking = True
                    self._silence_run = 0
                    log.debug(
                        "VAD: speech started speech_run_samples={}", self._speech_run
                    )
            else:
                # Sub-threshold -- discard candidate buffer
                self._speech_run = 0
                self._speech_windows.clear()

    def _finalize_utterance(self) -> None:
        """Pack accumulated window bytes into PCM16 bytes and enqueue the utterance."""
        if not self._speech_windows:
            self._reset_speech_state()
            return

        pcm_bytes = b"".join(self._speech_windows)
        log.info(
            "VAD: utterance complete samples={} duration_ms={:.0f}",
            len(pcm_bytes) // 2,
            len(pcm_bytes) / 2 / _SAMPLE_RATE * 1000,
        )
        try:
            self._queue.put_nowait(pcm_bytes)
        except asyncio.QueueFull:
            log.warning("VAD: utterance queue full -- dropping oldest utterance")
            with contextlib.suppress(asyncio.QueueEmpty):
                self._queue.get_nowait()
            self._queue.put_nowait(pcm_bytes)

        self._reset_speech_state()

    def _reset_speech_state(self) -> None:
        self._speaking = False
        self._speech_run = 0
        self._silence_run = 0
        self._speech_windows.clear()
        self._vad.reset()


# ---------------------------------------------------------------------------
# SileroOnnxVad -- production VadCallable (onnxruntime, no torch)
# ---------------------------------------------------------------------------

# Path to the ONNX model extracted from livekit-plugins-silero wheel
_MODEL_PATH = Path(__file__).parent / "silero_vad.onnx"

_CONTEXT_SIZE = 64  # 16 kHz context


class SileroOnnxVad:
    """VadCallable backed by the Silero ONNX model (onnxruntime, CPU-only).

    IMAGE SIZE NOTE: onnxruntime (~25 MB) is substantially lighter than
    torch (~700 MB).  The Silero ONNX model file is ~1.8 MB.  Total
    overhead for this VAD path: ~27 MB vs ~700 MB+ for the torch path.

    Call ``SileroOnnxVad.load(onnx_path)`` to construct.  The ONNX model
    path defaults to the file bundled in this directory.
    """

    def __init__(self, session, *, sample_rate: int = _SAMPLE_RATE) -> None:
        self._sess = session
        self._sr_nd = np.array(sample_rate, dtype=np.int64)
        self._context = np.zeros((1, _CONTEXT_SIZE), dtype=np.float32)
        self._rnn_state = np.zeros((2, 1, 128), dtype=np.float32)
        # Combined input buffer: context + window
        self._input_buf = np.zeros(
            (1, _CONTEXT_SIZE + _WINDOW_SAMPLES), dtype=np.float32
        )

    @classmethod
    def load(cls, onnx_path: Path | str | None = None) -> SileroOnnxVad:
        """Load the Silero ONNX model and return a ready instance.

        Args:
            onnx_path: Path to the ``.onnx`` file. Defaults to the model
                       bundled alongside this module.

        Raises:
            FileNotFoundError: If the model file does not exist.
            RuntimeError: If onnxruntime fails to create the inference session.
        """
        import onnxruntime  # type: ignore[import]

        path = Path(onnx_path) if onnx_path else _MODEL_PATH
        if not path.exists():
            raise FileNotFoundError(
                f"Silero VAD ONNX model not found at {path}. "
                "Copy silero_vad.onnx into src/ai-agents/app/infra/voice/ "
                "or pass onnx_path explicitly."
            )

        opts = onnxruntime.SessionOptions()
        opts.add_session_config_entry("session.intra_op.allow_spinning", "0")
        opts.add_session_config_entry("session.inter_op.allow_spinning", "0")
        opts.inter_op_num_threads = 1
        opts.intra_op_num_threads = 1
        opts.execution_mode = onnxruntime.ExecutionMode.ORT_SEQUENTIAL

        try:
            session = onnxruntime.InferenceSession(
                str(path),
                providers=["CPUExecutionProvider"],
                sess_options=opts,
            )
        except Exception as exc:
            raise RuntimeError(f"Failed to load Silero ONNX session: {exc}") from exc

        log.info("Silero ONNX VAD loaded model_path={}", path)
        return cls(session)

    def __call__(self, window: np.ndarray) -> float:
        """Run one 512-sample float32 inference window; return speech probability."""
        self._input_buf[:, :_CONTEXT_SIZE] = self._context
        self._input_buf[:, _CONTEXT_SIZE:] = window

        out, self._rnn_state = self._sess.run(
            None,
            {
                "input": self._input_buf,
                "state": self._rnn_state,
                "sr": self._sr_nd,
            },
        )
        self._context = self._input_buf[:, -_CONTEXT_SIZE:]
        return float(out.item())

    def reset(self) -> None:
        """Reset RNN state and context between utterances."""
        self._context.fill(0)
        self._rnn_state.fill(0)
        self._input_buf.fill(0)
