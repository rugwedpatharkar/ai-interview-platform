# Task 8 Report — LiveKit RoomAudio + Silero VAD

**Date:** 2026-06-19  
**Status:** COMPLETE — gate GREEN (477 total / 167 ai-agents, +11 new)

---

## Dependencies installed

| Package | Version | Notes |
|---|---|---|
| `livekit` (rtc) | 1.1.9 | Pinned per spec |
| `onnxruntime` | 1.27.0 | CPU-only; no torch |
| `flatbuffers` | 25.12.19 | Transitive from onnxruntime |

Added to `src/ai-agents/pyproject.toml`:
```
"livekit==1.1.9",
"onnxruntime>=1.18",
```

**pip-audit:** No known vulnerabilities found for any of the new transitive deps.

---

## VAD path: ONNX (not torch)

**Chosen:** onnxruntime + Silero ONNX model v5 (extracted from `livekit-plugins-silero==1.6.1` wheel).

**Image-size note:** onnxruntime is ~25 MB + the ONNX model file is ~1.8 MB bundled at
`src/ai-agents/app/infra/voice/silero_vad.onnx`. Total VAD overhead: ~27 MB.
The torch path (`livekit-plugins-silero` with `livekit-agents` + `openai` + `opentelemetry`
stack) would add ~700 MB+ to the image. ONNX path was chosen decisively.

The `livekit-plugins-silero` package itself was **not** installed; only the ONNX model file
was extracted from its wheel. This avoids pulling `livekit-agents`, `openai`, `sounddevice`,
and the full OpenTelemetry stack.

---

## Files created / modified

| File | Purpose |
|---|---|
| `src/ai-agents/app/infra/voice/vad.py` | `UtteranceSegmenter` + `VadCallable` protocol + `SileroOnnxVad` |
| `src/ai-agents/app/infra/voice/livekit_room.py` | `LiveKitRoomAudio` implementing `RoomAudio` Protocol |
| `src/ai-agents/app/infra/voice/silero_vad.onnx` | Silero VAD v5 ONNX model (2.2 MB) |
| `src/ai-agents/tests/test_vad.py` | 11 unit tests for `UtteranceSegmenter` |
| `src/ai-agents/pyproject.toml` | Added `livekit==1.1.9`, `onnxruntime>=1.18` |

---

## Segmenter tests (11 total, all passing)

All tests in `tests/test_vad.py` use `FakeVad` — no model or onnxruntime is loaded at all:

| Test | What it verifies |
|---|---|
| `test_utterance_emitted_after_speech_then_silence` | Basic state machine: speech window -> silence window -> utterance emitted |
| `test_utterance_contains_speech_windows` | Exact byte count matches accumulated windows |
| `test_two_sequential_utterances` | Two separate speech segments produce two distinct utterances |
| `test_sub_threshold_blip_not_emitted` | Below-activation windows produce no utterance |
| `test_onset_requires_min_speech_duration` | `min_speech_ms` gate enforced (one window insufficient when 64ms required) |
| `test_partial_window_buffered` | Sub-window-sized feed() calls accumulate correctly |
| `test_partial_leftover_does_not_create_spurious_utterance` | Half-window feed does not call VAD |
| `test_reset_clears_in_progress` | `reset()` clears speaking state, buffer, and pcm_buf |
| `test_reset_drains_queued_utterances` | `reset()` empties the queue |
| `test_vad_reset_called_between_utterances` | VAD's `reset()` called once per finalized utterance |
| `test_utterance_bytes_are_valid_int16` | Emitted bytes round-trip through numpy int16 |

---

## Gate

```
==> GATE PASSED
477 total (51 lib + 204 admin + 167 ai-agents + 24 mcp-data + 31 mcp-capability)
Baseline was 466; +11 new tests (all VAD segmenter).
```

---

## Live verification needed

**`LiveKitRoomAudio` is integration-only — no unit test was written for it.**

Verification requires a live LiveKit server (`docker compose up -d livekit`) and a candidate
participant joining the room.  This is deferred to Task 9 (voice-worker E2E).

Key items to verify in Task 9:
- `connect()` successfully joins the room
- `track_subscribed` fires and `_feed_loop` starts draining 16 kHz frames to the segmenter
- `play()` pushes 48 kHz int16 frames via `capture_frame` (real-time paced)
- `send_caption()` publishes JSON on topic `"captions"` (visible in browser `DataReceived`)
- `aclose()` disconnects cleanly; the feed task is cancelled before disconnect
- `next_utterance()` returns `None` when participant leaves (hangup race)

---

## Task 8 fix pass (2026-06-19)

### Fix 1 — CRITICAL: Missing `await` in `send_caption`

**Problem:** `self._room.local_participant.publish_data(...)` was called without `await`.
In livekit 1.1.9, `LocalParticipant.publish_data` is `async def` (confirmed by reading
`.venv/lib/python3.14/site-packages/livekit/rtc/participant.py` line 206). The unawaited
coroutine object was silently discarded — captions were NEVER sent and the `try/except`
never fired.

**Fix:** Added `await` at line 204 of `livekit_room.py`. The surrounding method
`send_caption` is already `async def`, so no other change was needed.

**API compatibility:** The installed version's signature is
`async def publish_data(self, payload: Union[bytes, str], *, reliable: bool = True,
destination_identities: List[str] = [], topic: str = "") -> None`.
The existing call site (`publish_data(payload, reliable=True, topic="captions")`) matches
exactly — no adaptation required.

### Fix 2 — Minor robustness: `_feed_task` leak guard

**Problem:** `_on_track_subscribed` assigned `self._feed_task = asyncio.ensure_future(...)`
unconditionally. A second audio track subscription (unlikely but possible) would orphan the
first task — it would keep running but become uncancellable via `aclose()`.

**Fix:** Added an early-return guard: if `self._feed_task` is not None and not done, log a
warning and return without creating a second task. `aclose()` already cancels `_feed_task`
and was not changed.

### Grep result — other unawaited coroutine calls

All async calls in `livekit_room.py` are properly awaited:

| Line | Call | Status |
|---|---|---|
| 94 | `await self._room.connect(...)` | OK |
| 144 | `await self._audio_source.capture_frame(frame)` | OK |
| 204 | `await self._room.local_participant.publish_data(...)` | FIXED (was missing `await`) |
| 227 | `await self._room.local_participant.unpublish_track(...)` | OK |
| 237 | `await self._room.disconnect()` | OK |
| 258 | `await self._room.local_participant.publish_track(...)` | OK |

`.on(...)` (lines 89–90) and `.name` / `.num_participants` (lines 105–106) are synchronous — correct.

### Gate

```
==> GATE PASSED
426 total (204 admin + 167 ai-agents + 24 mcp-data + 31 mcp-capability)
All tests GREEN; file imports cleanly.
```

---

## Implementation notes

**`UtteranceSegmenter` design:**
- Pure state machine with injected `VadCallable` — zero model dependency in unit tests
- Buffers sub-window bytes in `_pcm_buf` until a full 512-sample window is available
- Candidate windows buffered pre-onset (so speech start is included in the utterance)
- `asyncio.QueueFull` handled: drops the oldest queued utterance to make room (logged)
- `reset()` drains the queue synchronously with `contextlib.suppress(QueueEmpty)`

**`LiveKitRoomAudio` design:**
- `segmenter` and `room` are injected (testability + flexibility)
- `connect()` is separate from `__init__` so the caller can use it as a context manager or control timing
- Track publication is lazy (only when `play()` is first called) — avoids publishing a silent track before the agent speaks
- `next_utterance()` uses `asyncio.wait(FIRST_COMPLETED)` to race the utterance queue against the hangup event; the losing task is properly cancelled and awaited
- `aclose()` wraps cleanup in `try/finally` so disconnect always runs
