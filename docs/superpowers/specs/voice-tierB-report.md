# Voice Interview Tier B — Implementation Report

**Date:** 2026-06-19
**Tasks implemented:** Task 4 (engine seams + fakes) and Task 5 (VoiceTransport — TDD)
**Gate result:** GATE PASSED — 134 ai-agents tests (was 127, +7 new); 444 total across all services

---

## Files created / modified

### Created
| File | Purpose |
|---|---|
| `src/ai-agents/app/resources/voice/engines.py` | Protocol seams + `VoiceError` hierarchy (no third-party deps) |
| `src/ai-agents/app/resources/voice/transport.py` | `VoiceTransport` implementing `async ask(q) -> str` |
| `src/ai-agents/tests/test_voice_transport.py` | 7 TDD tests for `VoiceTransport` |

### Modified
| File | Change |
|---|---|
| `src/ai-agents/tests/conftest.py` | Added `fake_stt`, `fake_tts`, `fake_room` fixtures + `SttError` import |

---

## Protocol signatures (exact, as implemented)

```python
# engines.py
class VoiceError(Exception): ...
class SttError(VoiceError): ...
class TtsError(VoiceError): ...
class RoomError(VoiceError): ...

class SttEngine(Protocol):
    async def transcribe(self, pcm16_16k: bytes) -> str: ...

class TtsEngine(Protocol):
    async def synthesize(self, text: str) -> AsyncIterator[bytes]: ...

class RoomAudio(Protocol):
    async def play(self, pcm16_48k: AsyncIterator[bytes]) -> None: ...
    async def next_utterance(self) -> bytes | None: ...
    async def send_caption(self, who: str, text: str) -> None: ...
    async def aclose(self) -> None: ...
```

All three Protocols are decorated with `@runtime_checkable`. `AsyncIterator` is
imported from `collections.abc` (ruff UP035 compliance). No third-party imports in
`engines.py`.

---

## VoiceTransport behaviour

`VoiceTransport(stt, tts, room, max_retries=1)` implements the same
`async ask(question: str) -> str` contract as `Transport` (see
`app/resources/transport.py`) and drops into `conduct_interview` unchanged.

Turn flow per `ask()` call:
1. `room.send_caption("interviewer", question)` — captions the question.
2. `room.play(tts.synthesize(question))` — speaks into the room.
3. Loop up to `max_retries + 1` times:
   - `pcm = room.next_utterance()` — `None` means hangup → return `""`.
   - `stt.transcribe(pcm)` — `SttError` caught, logged, treated as empty.
   - Non-empty text → `room.send_caption("candidate", text)` → return text.
   - Empty → if retries remain: play re-prompt ("Sorry, I didn't catch that…").
4. Exhausted → return `""` (loop's empty-answer guard records it, moves on).

`TtsError` is NOT caught here — it propagates to the caller (the voice worker),
which handles it at the session boundary. This follows validate-at-boundaries.

---

## Test names and counts

File: `src/ai-agents/tests/test_voice_transport.py` — **7 tests**

| Test | Scenario |
|---|---|
| `test_ask_speaks_question_then_returns_transcribed_answer` | Happy path: question spoken, answer returned |
| `test_ask_captions_question_to_interviewer` | Interviewer caption appears first |
| `test_ask_returns_empty_string_on_hangup` | `next_utterance()` returns `None` → `""` |
| `test_ask_reprompts_on_empty_stt_then_returns_empty` | Both utterances empty → re-prompt synthesized → `""` |
| `test_ask_returns_answer_after_initial_empty_stt` | First empty, second has text → returns text |
| `test_ask_treats_stt_error_as_empty_and_reprompts` | `SttError` on first → re-prompt → second succeeds |
| `test_ask_returns_empty_when_all_stt_attempts_raise` | Both `SttError` → `""` |

Fakes in conftest.py (used as pytest fixtures):
- `fake_stt()` — scripted transcripts; `None` entry triggers `SttError`.
- `fake_tts()` — records `spoken` list; yields silence frames.
- `fake_room()` — scripted utterances; records `captions` list; drains `play()`.

---

## Gate result

```
==> GATE PASSED
ai-agents: 134 passed (was 127, +7)
lib:        51 passed
admin:     204 passed
mcp-data:   24 passed
mcp-cap:    31 passed
Total:     444 passed
```

---

## Deviations / notes

- **None.** Implementation matches the spec's Task 4 and Task 5 verbatim.
- The `engines.py` line-length limit required shortening one docstring by 2 chars
  (ruff E501 at 88 chars). Semantic content unchanged.
- The `pytest` import in the test file was unused (ruff F401) and removed by
  auto-fix; tests use `async def` directly (asyncio mode = AUTO in pyproject.toml).
- Tier A's `rtc_token.py` was untouched (already present and gate-green).

---

## Tier B fix pass — 2026-06-19

### Changes

| File | Fix |
|---|---|
| `src/ai-agents/app/resources/voice/engines.py` | Removed `async` from `TtsEngine.synthesize` Protocol method. An async-generator function is a sync callable returning `AsyncIterator[bytes]`; the previous `async def` signature described a coroutine returning an iterator, which would mislead future implementers (e.g. Task 6 EdgeTts) into writing a coroutine instead of an async generator. All callers (`transport.py`, fakes) already used the no-await async-generator convention. |
| `src/ai-agents/tests/conftest.py` | Made `_FakeRoomAudio.play()` consume the passed async iterator and append each chunk to `self.played`. Previously the iterator was drained without recording, leaving `self.played` permanently empty (misleading for Task 7 assertions). Updated the inline comment to match. |

### Test command + result

```
(cd src/ai-agents && ../../.venv/bin/python -m pytest tests/test_voice_transport.py -v)
# 7 passed in 0.04s
```

### Gate

```
bash scripts/check.sh  →  GATE PASSED
```

444 total tests across all services; 134 ai-agents tests (unchanged count — no new tests, fixes only).
