# Voice Task 6 Report — Groq STT + edge-tts TTS engines

**Date:** 2026-06-19
**Status:** COMPLETE — gate GREEN

---

## Files created / modified

| File | Action |
|---|---|
| `src/ai-agents/app/infra/voice/__init__.py` | Created (empty package marker) |
| `src/ai-agents/app/infra/voice/groq_stt.py` | Created — `GroqStt` concrete SttEngine |
| `src/ai-agents/app/infra/voice/edge_tts.py` | Created — `EdgeTts` concrete TtsEngine |
| `src/ai-agents/tests/test_voice_engines.py` | Created — 14 TDD tests, network never hit |
| `src/ai-agents/pyproject.toml` | Modified — added groq, edge-tts, av, numpy deps |

---

## Dependency versions installed

| Package | Version installed | Note |
|---|---|---|
| `groq` | 1.4.0 | Exact spec pin |
| `edge-tts` | 7.2.8 | Exact spec pin |
| `av` (PyAV) | 17.1.0 | Bundles ffmpeg in its wheel — import verified without system ffmpeg |
| `numpy` | 2.4.6 | Satisfies >=1.26 |

### Dockerfile ffmpeg note

PyAV 17.1.0 bundles ffmpeg in its wheel (verified: `import av` succeeds with no system ffmpeg).
**No `ffmpeg` package needed in `docker/Dockerfile`** for the gate or the venv.
If a Docker build fails on import (unusual for manylinux/platform-matched wheels), add `RUN apt-get install -y ffmpeg` as a fallback — but do not do so pre-emptively.

---

## pip-audit result

`No known vulnerabilities found` on all pinned transitive deps.
`lib (0.1.0)` skipped (local editable, not on PyPI — expected behaviour).

---

## Implementation notes

### GroqStt (`app/infra/voice/groq_stt.py`)

- `transcribe(pcm16_16k: bytes) -> str` wraps raw PCM16 mono 16 kHz in a WAV container via stdlib `wave` + `io.BytesIO` (no temp files), then calls `await client.audio.transcriptions.create(file=("u.wav", wav_bytes), model="whisper-large-v3-turbo", language="en", temperature=0.0)`.
- Client is injected (`__init__(*, client=None, api_key="", ...)`) — if no client given, `AsyncGroq(api_key=api_key)` is built lazily so the test path never constructs a real SDK client.
- Bounded retry: `max_retries=2` default, exponential backoff (`base_delay=0.5`s), raises `SttError` after all attempts. Never logs audio bytes or API keys.

### EdgeTts (`app/infra/voice/edge_tts.py`)

- `synthesize(text)` is a **plain `def`** (not `async def`) that returns `self._gen(text)` — an async generator. Callers do NOT await the call; they iterate it with `async for`. Matches the `TtsEngine` Protocol exactly.
- `_gen(text)`: awaits `_stream_mp3(text)` to accumulate all `chunk["type"]=="audio"` bytes, decodes MP3 → 48 kHz mono s16 via PyAV (`av.open` + `av.AudioResampler(format="s16", layout="mono", rate=48000)`), then yields 480-sample (960-byte) frames. Last frame is zero-padded if needed.
- Retries once on known intermittent 403 (`"403" in str(exc)` or `"Forbidden"`); raises `TtsError` on hard failure or empty audio.
- `communicate_factory` is injected for tests.

---

## Test names + counts

### `tests/test_voice_engines.py` (14 tests, all pass)

**GroqStt — WAV wrapping (3 tests):**
- `test_pcm_to_wav_has_valid_riff_header`
- `test_pcm_to_wav_encodes_correct_format_chunk`
- `test_pcm_to_wav_round_trips_audio_data`

**GroqStt — transcription (5 tests):**
- `test_groq_stt_returns_stripped_text`
- `test_groq_stt_sends_wav_file_to_client`
- `test_groq_stt_sends_correct_model_and_params`
- `test_groq_stt_raises_stt_error_after_retries`
- `test_groq_stt_retries_on_transient_error`

**EdgeTts — interface contract (1 test):**
- `test_edge_tts_synthesize_is_not_a_coroutine`

**EdgeTts — frame structure (3 tests):**
- `test_edge_tts_yields_correct_frame_size`
- `test_edge_tts_frames_are_48k_mono_int16`
- `test_edge_tts_non_audio_chunks_are_ignored`

**EdgeTts — error handling (2 tests):**
- `test_edge_tts_raises_tts_error_on_hard_failure`
- `test_edge_tts_raises_tts_error_on_empty_audio`

MP3 fixture is built in-test via PyAV (silence frames encoded to MP3, then fed back through the decode/resample path) — no committed binary, no network.

---

## Gate result

```
==> ruff format (check)  240 files already formatted
==> ruff lint (incl. security S-rules)  All checks passed!
==> pip-audit (dependency CVEs)  No known vulnerabilities found
==> lib tests      51 passed
==> admin tests   204 passed
==> ai-agents     148 passed  (+14 from Task 6)
==> mcp-data       24 passed
==> mcp-capability 31 passed
==> GATE PASSED
Total: 458 tests (baseline was 444)
```

---

## Concerns / known limits

- **edge-tts is an unofficial endpoint.** The 403-retry covers the most common intermittent failure. If Microsoft rate-limits in production, the `TtsEngine` seam makes swapping to Piper or another TTS zero-effort.
- **PyAV version 17.1.0 (cp311 ABI).** The venv runs Python 3.14; PyAV 17 ships a `cp311-abi3` wheel which is backward-compatible. If a future Docker build pulls a different platform wheel that lacks bundled ffmpeg, add `apt-get install -y ffmpeg` to the Dockerfile.
- **edge_tts.Communicate API.** The `stream()` method yields dicts with `type` and `data` keys. If a future edge-tts release changes this shape, the `communicate_factory` injection makes it easy to adapt without touching the Protocol or transport.
- **No `numpy` usage in production code.** numpy is used only in the test helper (`_make_silence_mp3`) to zero-fill the PyAV AudioFrame. The production decode path uses only `av` and `bytes`. Keeping numpy in `pyproject.toml` covers the voice-worker service's future Silero VAD (Task 8) which will need it.
