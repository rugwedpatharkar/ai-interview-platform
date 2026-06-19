# Voice Interview (Phase 3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this task-by-task. Steps use `- [ ]` checkboxes.
> Spec: `docs/superpowers/specs/2026-06-19-voice-interview-design.md`.

**Goal:** Add a real-time **spoken** interview — candidate speaks, the AI interviewer speaks back —
reusing the existing interviewer logic by putting voice I/O behind the established `Transport.ask()`
seam. Scoring, funnel, data ownership, and the text interview are unchanged.

**Architecture:** A new **`VoiceTransport`** implements the existing `async ask(question) -> str`
contract: `ask()` speaks the question (TTS) into a **LiveKit** room, then returns the candidate's
next transcribed utterance (VAD-segmented + STT). It drives the **existing** per-turn interviewer
loop, so the "brain" (blueprint + `next_question` + scoring) is untouched. The realtime mechanics
live behind three injected seams — `TtsEngine`, `SttEngine`, `RoomAudio` — each with a fake for
offline tests. A new **`voice-worker`** service runs one voice session per interview room; **admin**
is unchanged; **ai-agents** gains a token endpoint. (Alternative considered: LiveKit's `agents`
framework with `llm_node` override — gives built-in barge-in but owns the loop and is harder to
unit-test; documented at handoff. We can adopt its VAD/turn-detector pieces later for barge-in.)

**Tech Stack (pinned — verified current mid-2026; re-confirm at install):**
`livekit-server` (Docker, `--dev`) · `livekit` (rtc) **1.1.9** · `livekit-api` **1.1.0** ·
`silero-vad` (standalone, snakers4) · `groq` **1.4.0** (Whisper `whisper-large-v3-turbo`, chunk-per-
utterance) · `edge-tts` **7.2.8** · `av` (PyAV, MP3→PCM) · `numpy` · frontend `livekit-client` **2.19.2**.

## Global Constraints
- **LOCAL-ONLY — never run git/gh.** The skill's "commit" steps are replaced by **"run the gate"**:
  `bash scripts/check.sh` (ruff format+lint S-rules line-88, pip-audit, pytest ×5) must stay green;
  baseline today is **423 tests**. Frontend verified by `npx pnpm@9.15.0 --filter @ip/candidate build`
  + `--filter @ip/{ui,shared,api-client} typecheck`. Never `next build` while `pnpm dev` is live.
- **Robustness bar (every new module):** validate at external boundaries (LiveKit/Groq/edge-tts/mic),
  wrap every third-party/network call in try/except with `get_logger(...)` structured logs + a typed
  domain error; bounded **retries with backoff** on transient STT/TTS/RTC failures; **always release
  resources** (room disconnect, audio streams, tracks) in `finally`; no bare `except: pass`; trust
  internal typed calls (no defensive coercion). Follow `~/.claude/CLAUDE.md` (minimal, trust-the-
  system, validate-at-boundaries) and `docs/superpowers/plans/PRODUCTION_STANDARDS.md`.
- **Flexibility:** STT/TTS/RoomAudio are injected `Protocol` seams (swap Groq→Deepgram, edge-tts→Piper,
  LiveKit→other RTC without touching the interview loop). Config-driven; secrets via env only.
- **Brain unchanged:** do not modify `blueprint.py`, `interviewer.py` (`next_question`), the evaluator,
  scoring, or the funnel. The text path (`/interview/{id}/turn`) remains the regression baseline.
- **Tenancy/auth:** the RTC token is per-room, short-TTL, minted only after the existing
  `_caller_user_id` ownership check; the worker validates participant identity.

---

## File structure (new + modified)

```
docker-compose.yml                         (+livekit service, +voice-worker service)
docker/livekit.yaml                        (NEW — LiveKit dev config)
.env / .env.example                        (+LIVEKIT_*, +GROQ_API_KEY)
lib/lib/config.py                          (no change — service configs extend BaseServiceSettings)

src/ai-agents/app/
  config.py                                (+livekit_url/api_key/api_secret, +groq_api_key, +voice_*)
  routes/interview_api.py                  (+POST /interview/{id}/rtc-token; reuse _caller_user_id)
  resources/voice/                         (NEW package — the voice plane)
    __init__.py
    transport.py                           (VoiceTransport: implements `async ask(q)->str`)
    engines.py                             (TtsEngine/SttEngine/RoomAudio Protocols + errors)
    rtc_token.py                           (mint_join_token(room, identity, ttl) via livekit-api)
  infra/voice/                             (NEW — concrete engines, isolated from the loop)
    groq_stt.py                            (GroqStt: bytes->text, AsyncGroq, retries)
    edge_tts.py                            (EdgeTts: text->PCM48k frames, MP3 decode via av)
    livekit_room.py                        (LiveKitRoomAudio: join, sub frames@16k, publish 48k, VAD)
    vad.py                                 (Silero VAD utterance segmenter, 16k/512-sample)
  service/voice_worker.py                  (NEW — voice-worker entrypoint: room->VoiceTransport->loop)

src/ai-agents/tests/
  test_voice_transport.py                  (VoiceTransport with fake engines)
  test_rtc_token.py                        (token mint + endpoint auth)
  test_voice_worker.py                     (orchestration: setup->loop->finalize, fakes)
  conftest.py                              (+FakeTtsEngine/FakeSttEngine/FakeRoomAudio)

frontend/packages/shared/src/
  voice.ts                                 (NEW — createVoiceClient(admin/aiagents url, store))
  index.ts                                 (export voice client + types)
frontend/apps/candidate/
  package.json                             (+livekit-client@^2.19.2)
  app/interview/[applicationId]/page.tsx   (+voice-mode toggle + device pre-check + fallback)
  components/voice-room.tsx                (NEW — LiveKit client: join/mic/captions/reconnect)
```

**Responsibilities (one job each):** `transport.py` = the `ask()` bridge (no LiveKit/Groq imports —
only the seams). `engines.py` = the seam Protocols + `VoiceError` hierarchy. `infra/voice/*` = the
only files that import livekit/groq/edge-tts/av. `voice_worker.py` = wiring + lifecycle. This keeps
the testable logic free of heavy deps (the gate stays offline).

---

## TIER A — media path up (prove the pipes before any AI)

### Task 1 — LiveKit in docker-compose + dev config
**Files:** Create `docker/livekit.yaml`; Modify `docker-compose.yml`, `.env.example`.
**Deliverable:** `docker compose up -d livekit` healthy; `ws://localhost:7880` reachable.

- [ ] **Step 1 — `docker/livekit.yaml`** (local dev; `use_external_ip:false` is critical for localhost):
```yaml
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 51000   # small range (20 ports) — a 100-port range collided with a host
  port_range_end: 51019     # process on UDP 50071; keep it small + clear for local dev
  use_external_ip: false   # advertise 127.0.0.1 in ICE; true breaks same-machine browser↔server
keys:
  devkey: devsecret_change_me_min_32_chars_long
```
- [ ] **Step 2 — compose service** (Docker Desktop on macOS lacks usable `network_mode: host`, so map
  the UDP range explicitly with the `/udp` suffix — without it signaling connects but **audio is
  silent**):
```yaml
  livekit:
    image: livekit/livekit-server:v1.9
    command: --config /etc/livekit.yaml --dev
    restart: unless-stopped
    ports:
      - "7880:7880"
      - "7881:7881"
      - "51000-51019:51000-51019/udp"   # small clear range; matches livekit.yaml port_range_*
    volumes:
      - ./docker/livekit.yaml:/etc/livekit.yaml:ro
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:7880/"]
      interval: 5s
      timeout: 3s
      retries: 12
```
- [ ] **Step 3 — `.env.example`**: add `LIVEKIT_URL=ws://localhost:7880`, `LIVEKIT_API_KEY=devkey`,
  `LIVEKIT_API_SECRET=devsecret_change_me_min_32_chars_long`, `GROQ_API_KEY=`. (Real `.env` perms 600.)
- [ ] **Step 4 — verify:** `docker compose up -d livekit` → `docker compose ps` shows healthy;
  `curl -sf http://localhost:7880/` returns OK. (No unit test — infra.)

### Task 2 — RTC join-token endpoint (TDD)
**Files:** Create `src/ai-agents/app/resources/voice/rtc_token.py`; Modify
`src/ai-agents/app/config.py`, `src/ai-agents/app/routes/interview_api.py`; Test
`src/ai-agents/tests/test_rtc_token.py`.
**Interfaces — Produces:** `mint_join_token(room: str, identity: str, *, api_key, api_secret,
ttl_seconds=900) -> str`; endpoint `POST /interview/{application_id}/rtc-token` →
`{ "url": str, "token": str, "room": str }`. Room id = `f"interview-{application_id}"`.

- [ ] **Step 1 — config** (`config.py`, mirror the existing Settings pattern):
```python
    livekit_url: str = "ws://localhost:7880"
    livekit_api_key: str = ""        # env only
    livekit_api_secret: str = ""     # env only
    groq_api_key: str = ""           # env only
    voice_rtc_token_ttl_seconds: int = 900
```
- [ ] **Step 2 — failing test** `test_rtc_token.py`:
```python
import jwt  # PyJWT (already a dep via lib.security)
from app.resources.voice.rtc_token import mint_join_token

def test_mint_token_is_room_scoped_and_decodable():
    tok = mint_join_token("interview-a1", "u1", api_key="devkey",
                          api_secret="s" * 32, ttl_seconds=900)
    claims = jwt.decode(tok, "s" * 32, algorithms=["HS256"])
    assert claims["video"]["room"] == "interview-a1"
    assert claims["video"]["roomJoin"] is True
    assert claims["sub"] == "u1"
```
- [ ] **Step 3 — run** `(cd src/ai-agents && ../../.venv/bin/python -m pytest tests/test_rtc_token.py -v)` → FAIL (module missing).
- [ ] **Step 4 — implement** `rtc_token.py` (livekit-api builder; TTL is a `timedelta`):
```python
from datetime import timedelta
from livekit import api

def mint_join_token(room, identity, *, api_key, api_secret, ttl_seconds=900) -> str:
    return (
        api.AccessToken(api_key, api_secret)
        .with_identity(identity)
        .with_ttl(timedelta(seconds=ttl_seconds))
        .with_grants(api.VideoGrants(
            room_join=True, room=room,
            can_publish=True, can_subscribe=True, can_publish_data=True,
        ))
        .to_jwt()
    )
```
- [ ] **Step 5 — endpoint** in `interview_api.py` (reuse `_caller_user_id`; the session must exist +
  be owned by the caller — load it via `deps["sessions"].get` and 404/403 like `/turn`):
```python
@router.post("/interview/{application_id}/rtc-token")
async def rtc_token(application_id: str, request: Request):
    deps = request.app.state.deps
    user_id = _caller_user_id(request)
    session = await deps["sessions"].get(application_id)
    if session is None:
        raise HTTPException(status_code=404, detail="interview session not found")
    if session.candidate_user_id != user_id:
        raise HTTPException(status_code=403, detail="not your interview")
    s = deps["settings"]
    if not (s.livekit_api_key and s.livekit_api_secret):
        raise HTTPException(status_code=503, detail="voice interview not configured")
    room = f"interview-{application_id}"
    token = mint_join_token(room, user_id, api_key=s.livekit_api_key,
                            api_secret=s.livekit_api_secret,
                            ttl_seconds=s.voice_rtc_token_ttl_seconds)
    return {"url": s.livekit_url, "token": token, "room": room}
```
  (Add `"settings": s` to the deps dict in `main.py`'s `create_app({...})` — it currently passes
  individual deps; thread the Settings object so the route can read `livekit_*`.)
- [ ] **Step 6 — endpoint tests** (FastAPI `TestClient`, mirror existing interview_api tests): 200 with
  `{url,token,room}` for the owner; 401 no token; 403 wrong user; 404 no session; 503 when keys unset.
- [ ] **Step 7 — gate:** `bash scripts/check.sh` green (add `livekit-api` to `src/ai-agents/pyproject.toml`).

### Task 3 — frontend joins + mic echo (prove media end-to-end)
**Files:** Modify `frontend/apps/candidate/package.json` (+`livekit-client@^2.19.2`); Create
`frontend/apps/candidate/components/voice-room.tsx`; Create `frontend/packages/shared/src/voice.ts`
(+export). Temporary echo: candidate hears their own mic via LiveKit loopback (no worker yet) — proves
token + UDP + autoplay before any AI.
**Interfaces — Produces:** `createVoiceClient(aiagentsBaseUrl, store).getToken(applicationId) →
{url,token,room}`; `<VoiceRoom url token onCaption onState onEnd />`.

- [ ] **Step 1 — `voice.ts`**: `getToken()` via `authedFetch` (reuses the 401-refresh path) to
  `POST {aiagents}/interview/{id}/rtc-token`. Throw `HttpError` on non-2xx (existing pattern).
- [ ] **Step 2 — `voice-room.tsx`** (`"use client"`): `new Room({adaptiveStream,dynacast})`;
  on a user-gesture **Join** button → `room.connect(url,token)` → `setMicrophoneEnabled(true)`;
  `RoomEvent.TrackSubscribed` → `track.attach()` appended to DOM; handle
  `RoomEvent.AudioPlaybackStatusChanged` → call `room.startAudio()` from the click (autoplay gotcha);
  `ConnectionStateChanged`/`Reconnecting`/`Reconnected`/`Disconnected` → `onState`; **guard React 19
  StrictMode double-mount** with a ref; `disconnect()` in cleanup.
- [ ] **Step 3 — verify (manual, Chrome via preview):** with `livekit` + dev servers up + a started
  interview session, click Join → grant mic → hear your own audio (LiveKit echoes published tracks
  back when subscribed). Confirms token + WebRTC/UDP + autoplay. **No console errors.**
- [ ] **Step 4 — verify build:** `npx pnpm@9.15.0 --filter @ip/candidate build` green.

---

## TIER B — the voice brain loop (STT → existing interviewer → TTS)

### Task 4 — engine seams + fakes (TDD foundation)
**Files:** Create `src/ai-agents/app/resources/voice/engines.py`; Modify
`src/ai-agents/tests/conftest.py`.
**Interfaces — Produces:**
```python
class VoiceError(Exception): ...
class SttError(VoiceError): ...
class TtsError(VoiceError): ...
class RoomError(VoiceError): ...

class SttEngine(Protocol):
    async def transcribe(self, pcm16_16k: bytes) -> str: ...           # one utterance -> text
class TtsEngine(Protocol):
    async def synthesize(self, text: str) -> AsyncIterator[bytes]: ...  # -> PCM16 48k frames
class RoomAudio(Protocol):
    async def play(self, pcm16_48k: AsyncIterator[bytes]) -> None: ...  # publish TTS to the room
    async def next_utterance(self) -> bytes | None: ...                 # VAD-segmented 16k PCM; None on hangup
    async def send_caption(self, who: str, text: str) -> None: ...
    async def aclose(self) -> None: ...
```
- [ ] **Steps:** define the Protocols + error hierarchy (no third-party imports here). Add
  `FakeSttEngine` (scripted transcripts), `FakeTtsEngine` (records spoken text, yields silence
  frames), `FakeRoomAudio` (scripted utterances + records captions/played text) to `conftest.py`,
  mirroring `FakeTransport`/`FakePublisher`. Gate green (Protocols are import-only).

### Task 5 — VoiceTransport (TDD — the core seam)
**Files:** Create `src/ai-agents/app/resources/voice/transport.py`; Test
`src/ai-agents/tests/test_voice_transport.py`.
**Interfaces — Consumes:** `SttEngine`, `TtsEngine`, `RoomAudio` (Task 4). **Produces:**
`class VoiceTransport` with `async def ask(self, question: str) -> str` (the existing `Transport`
contract — see `app/resources/transport.py`).
- [ ] **Step 1 — failing test:**
```python
async def test_ask_speaks_question_then_returns_transcribed_answer(
    fake_stt, fake_tts, fake_room
):
    fake_room.set_utterances([b"<pcm-utterance-1>"])
    fake_stt.set_transcripts(["I used asyncio for concurrency."])
    vt = VoiceTransport(stt=fake_stt, tts=fake_tts, room=fake_room)
    answer = await vt.ask("How did you handle concurrency?")
    assert answer == "I used asyncio for concurrency."
    assert "How did you handle concurrency?" in fake_tts.spoken
    assert fake_room.captions[-1] == ("candidate", "I used asyncio for concurrency.")
```
- [ ] **Step 2 — run → FAIL.**
- [ ] **Step 3 — implement** (robust: caption both sides; on empty/garbled STT re-prompt once;
  on hangup return "" so the loop finalizes; every engine call try/except → typed error + log):
```python
log = get_logger(component="voice.transport")

class VoiceTransport:
    def __init__(self, *, stt, tts, room, max_retries=1):
        self._stt, self._tts, self._room, self._max_retries = stt, tts, room, max_retries

    async def ask(self, question: str) -> str:
        await self._room.send_caption("interviewer", question)
        await self._room.play(self._tts.synthesize(question))   # TtsError handled by caller boundary
        for attempt in range(self._max_retries + 1):
            pcm = await self._room.next_utterance()
            if pcm is None:
                log.info("voice: candidate hung up; ending interview")
                return ""                                       # loop finalizes (empty-answer guard)
            try:
                text = (await self._stt.transcribe(pcm)).strip()
            except SttError:
                log.exception("voice: STT failed, re-prompting")
                text = ""
            if text:
                await self._room.send_caption("candidate", text)
                return text
            if attempt < self._max_retries:
                await self._room.play(self._tts.synthesize(
                    "Sorry, I didn't catch that — could you repeat?"))
        return ""   # exhausted re-prompts -> empty answer (existing guard records it, moves on)
```
- [ ] **Step 4 — run → PASS** + add tests: hangup (`None`) → `""`; empty STT → re-prompt then `""`.
- [ ] **Step 5 — gate green.**

### Task 6 — Groq STT + edge-tts engines (TDD logic; mocked network)
**Files:** Create `src/ai-agents/app/infra/voice/groq_stt.py`, `edge_tts.py`; Tests in
`test_voice_engines.py`. Add `groq`, `edge-tts`, `av`, `numpy` to `src/ai-agents/pyproject.toml`.
- [ ] **GroqStt** — wrap PCM16/16k into an in-memory WAV (`wave` module) → `AsyncGroq().audio.
  transcriptions.create(file=("u.wav", wav_bytes), model="whisper-large-v3-turbo", language="en",
  temperature=0)`; **bounded retry w/ backoff** on transient errors; raise `SttError` on hard fail;
  log durations. Test: fake `AsyncGroq` (inject the client) → asserts WAV header + returns `.text`;
  a raising client → `SttError` after retries.
- [ ] **EdgeTts** — `edge_tts.Communicate(text, voice).stream()` → accumulate MP3 → decode+resample to
  **48 kHz mono s16** via `av.AudioResampler` → yield 480-sample (10 ms) `bytes` frames; retry on the
  known intermittent 403; raise `TtsError` on hard fail. Test (no network): feed a tiny fixed MP3
  fixture through the decode path → assert 48k/mono/int16 framing (the decode/resample is the logic
  worth testing; mock `Communicate.stream`).
- [ ] **Gate green** (network never hit in tests — clients/streams are injected/mocked).

---

## TIER C — wire the real interview + worker lifecycle

### Task 7 — voice interview orchestrator (TDD — reuse the existing loop)
**Files:** Modify `src/ai-agents/app/resources/voice/transport.py` or add
`resources/voice/session.py`: `run_voice_interview(application_id, *, transport, caller_user_id,
data, sessions, llm, publisher, clock)`. **Reuse** `start_interview` for the blueprint/first question
and `submit_turn`'s finalize semantics — do NOT duplicate scoring/finalization.
**Interfaces — Consumes:** `VoiceTransport` (Task 5), existing `interview_host` functions.
- [ ] Drive the existing per-turn loop: speak first question via `transport.ask(first_q)` → feed the
  returned answer into the same turn logic (`submit_turn`-equivalent: append, budget check,
  `next_question`, finalize). When done or budget exhausted or `ask()` returns `""`, finalize exactly
  as the text path (save_interview → publish `interview.completed` → flip status LAST). The transcript
  is identical shape → **scoring path unchanged**.
- [ ] **Tests** (fakes only — no LiveKit/Groq/network): full happy-path interview drives N turns then
  finalizes + emits `interview.completed` once; hangup mid-interview finalizes the partial transcript;
  budget exhaustion finalizes. Mirror `test_interview_host.py`.
- [ ] **Gate green.**

### Task 8 — LiveKit RoomAudio + Silero VAD (the concrete RoomAudio)
**Files:** Create `src/ai-agents/app/infra/voice/livekit_room.py`, `vad.py`.
- [ ] **`vad.py`** — Silero `VADIterator` (16 kHz, **exactly 512-sample** float32 windows; stateful;
  `reset_states()` per utterance); expose `feed(frame)->event|None` (start/end). Unit-test the
  segmentation state machine with synthetic frames (pure logic, no audio model? — load the real model;
  if too heavy for the gate, gate it behind a marker + test the buffering math with a fake VAD).
- [ ] **`LiveKitRoomAudio`** implements `RoomAudio` via `livekit.rtc`: connect to room with the worker
  token (`can_subscribe`+`can_publish`); subscribe → `rtc.AudioStream(track, sample_rate=16000)` →
  VAD-segment → `next_utterance()` returns the 16k PCM clip (or `None` on participant disconnect);
  `play()` pushes 48k frames via `rtc.AudioSource(48000,1)` + `LocalAudioTrack`/`capture_frame`
  (back-pressured = real-time pacing); `send_caption()` via `publishData(..., topic="captions")`;
  `aclose()` disconnects + drains in `finally`. **No unit test** (integration; verified in Task 9).
  Heavy exception handling + reconnect logging around every rtc call.

### Task 9 — voice-worker service + compose (integration)
**Files:** Create `src/ai-agents/app/service/voice_worker.py`; Modify `docker-compose.yml`
(+`voice-worker`), `docker/Dockerfile` if SERVICE wiring needs it.
- [ ] **`voice_worker.py`** — long-running: discover active interview rooms (start simple: the
  frontend, after `/start`, calls a new `POST /interview/{id}/voice/begin` that enqueues a job, or the
  worker reacts to a LiveKit **participant-joined webhook**; pick the webhook path — least coupling).
  Per room: mint a worker token, build `LiveKitRoomAudio` + `GroqStt` + `EdgeTts` → `VoiceTransport`
  → `run_voice_interview(...)`; wrap the whole session in try/except/finally (always `aclose()` the
  room; log + mark session resumable on failure — Redis checkpoint already persists state). Wire deps
  like `main.py` (settings, redis sessions store, llm, publisher, MCP data gateway).
- [ ] **compose `voice-worker`** — build from `docker/Dockerfile` (new SERVICE), `restart:
  unless-stopped`, env `LIVEKIT_URL=ws://livekit:7880` + keys + `GROQ_API_KEY` + common-env,
  `depends_on` livekit+redis+rabbitmq healthy.
- [ ] **Verify (manual E2E, Chrome):** start interview → Join voice → the agent **speaks the first
  question**, you answer aloud, it asks the next, captions stream, and on completion the report scores
  via the unchanged path. Tail `docker compose logs -f voice-worker`.

---

## TIER D — UX, resilience, polish

### Task 10 — candidate voice UX + text fallback
**Files:** Modify `frontend/apps/candidate/app/interview/[applicationId]/page.tsx`,
`components/voice-room.tsx`.
- [ ] Device pre-check (`navigator.mediaDevices.getUserMedia` probe) + permission UI; **fallback to the
  existing text interview** when mic denied / `SpeechRecognition`-less / `rtc-token` 503; live captions
  panel (from `DataReceived` topic `captions`); connection-quality + reconnect banner
  (`Reconnecting`/`Reconnected`); an "End interview" control; keep the existing `beforeunload` guard.
- [ ] Verify: candidate build green; manual mic-denied → text path; reconnect (kill/restore livekit)
  resumes from the Redis checkpoint.

### Task 11 — resilience + finalize
- [ ] Confirm: mid-interview disconnect → rejoin resumes (Redis checkpoint); STT/TTS hard failure →
  graceful re-prompt / session stays resumable; the **abandon-stale reaper** finalizes a dropped voice
  session (already emits `interview.abandoned`); **text interview regression** still green.
- [ ] (Deferred enhancement, documented not built: **barge-in** — interrupt TTS when the candidate
  starts speaking; needs duplex VAD while playing. Ship turn-based first.)
- [ ] Full gate `bash scripts/check.sh` green; both FE builds green; update `HANDOFF.md` + memory.

---

## Verification (end-to-end)
1. **Per backend task:** `bash scripts/check.sh` GREEN (grows from 423); new realtime/infra code is
   excluded from unit tests by living behind injected seams (engines/room) with fakes.
2. **Token/auth:** `test_rtc_token.py` proves room-scoping + 401/403/404/503.
3. **Loop correctness (offline):** `test_voice_transport.py` + `test_voice_worker.py` prove the full
   interview drives + finalizes + emits `interview.completed` once, using only fakes.
4. **Media E2E (manual, Chrome via preview):** spoken interview completes; captions; mid-interview
   reconnect resumes; mic-denied → text fallback; persisted transcript scores via the unchanged path.
5. **Regression:** the text interview (`/turn`) still works (its tests untouched + green).

## Risks / re-verify at execution
- **LiveKit UDP on Docker Desktop (mac):** if audio is silent, confirm the `/udp` range is mapped +
  `use_external_ip:false`; TURN is NOT needed for same-machine localhost.
- **livekit (rtc) frame formats:** publish source fixed at 48 kHz int16; subscribe via
  `AudioStream(sample_rate=16000)` to avoid manual resampling; edge-tts MP3 MUST be resampled to 48k
  (rate mismatch = chipmunk audio).
- **Groq Whisper is chunk-per-utterance** (no streaming) — latency floor = utterance length + 1 RTT;
  keep utterances short via VAD endpointing.
- **Pin versions** at install (livekit-api 1.1.0, livekit rtc 1.1.9, groq 1.4.0, edge-tts 7.2.8,
  livekit-client 2.19.2); re-confirm the Groq model id (`whisper-large-v3-turbo`) on the console.
- **edge-tts** is an unofficial endpoint — wrap in retry; if it rate-limits in practice, the `TtsEngine`
  seam lets us swap to Piper without touching the loop.
```
