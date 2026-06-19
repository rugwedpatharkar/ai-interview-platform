# Async Video Interview (Inc 6, Pillar C) — Design

> **Context.** Canonical v2 design: `docs/superpowers/v2/2026-06-19-v2-architecture-overview-design.md`
> (read §5 Pillar C + the Inc 6 row in §8). This is the **async / one-way recorded** video
> answer modality. It is a sibling of the **voice** interview, whose backend is **already built**
> and whose remaining frontend/E2E is owned by `docs/superpowers/plans/2026-06-19-voice-interview.md`
> (TIER D) — **this doc does not touch voice**. Personal project, online is fine, free stack.
> **Local-only; never run git/gh.**

## 1. Goal & scope
**In scope.** A candidate answers each interview question by **recording a short video clip in the
browser** (no live agent, no real-time media plane), uploading it; the backend **transcribes the
clip's audio** (reuse `GroqStt`) and feeds the resulting text into the **same per-turn interviewer
loop** the text and voice paths already use. The transcript is the **identical `Transcript` /
`TranscriptTurn` shape**, so scoring, the funnel, and the recruiter report are **byte-for-byte the
same path**. Clips persist in object storage; a `video_answers` row records
`{application_id, question, object_key, transcript}` per turn.

**The seam.** A `VideoAnswerTransport` implements the existing `Transport.ask(question) -> str`
contract (`src/ai-agents/app/resources/transport.py`): `ask(question)` returns the STT transcript of
the **already-uploaded** clip for that question. This mirrors how `VoiceTransport` implements the
same contract over live engines — **the interview brain does not change** (the §11/Pillar-C exit
criterion: "video implements `Transport.ask`, no change to the interview logic").

**Out of scope (deferred / explicitly not built):**
- **Voice** (live spoken) — already built backend; FE/E2E owned by the voice plan. Not here.
- **Video proctoring / face or voice *identity*** — permanently cut per the v2 overview (§2, §6).
  We transcribe audio; we do **not** analyze the video frames for identity, affect, or attention.
- **Avatar / talking-head agent, multi-language STT, live transcription, retake limits beyond a
  simple cap, transcoding/CDN delivery** — YAGNI for the demo. One clip per question, English STT.
- **Recruiter clip playback UI** — the recruiter scores from the transcript exactly as today; a
  presigned-GET "watch the clip" link on the report is a thin, optional follow-up (Open question Q4).

## 2. Where it fits (reuse map — what changes, what doesn't)

| Layer | Component | Status |
|---|---|---|
| Seam | `Transport.ask(q) -> str` (`resources/transport.py`) | **reused unchanged** — `VideoAnswerTransport` is a 2nd adapter alongside `VoiceTransport` |
| Brain | `blueprint.py`, `interviewer.next_question`, `interview_host` finalize, evaluator, scoring, funnel | **reused UNCHANGED** (identical transcript shape) |
| STT | `GroqStt` (`infra/voice/groq_stt.py`) + `SttEngine` Protocol | **reused** for transcription; one new decode helper feeds it container audio (clips are webm/mp4, not raw PCM) |
| Storage | `lib/lib/storage` `ObjectStorage` | **extended**: add `presigned_put_url` (upload) — `put`/`get_raw`/`presigned_get_url`/`delete_raw` already exist |
| Upload | résumé-upload presign pattern (`admin/resources/profile.upload_resume`) | **reused as the template** (validate → tenant-namespaced key → store reference) |
| REST | `interview_api.py` `/interview/{id}/turn` + `_caller_user_id` + session-ownership check | **reused as the template** for the new video endpoints |
| Frontend | `frontend/apps/candidate/app/interview/[applicationId]/page.tsx` (mode selector: text + planned voice) | **extended**: add a **video mode** + a `MediaRecorder` recorder component |
| Erasure | `CandidateEraser` (`admin/resources/compliance.py`) | **extended**: purge `video_answers` rows + their clips (the Inc 0 cascade extension) |

**Voice is separate.** No file under `resources/voice/*` or `infra/voice/*` is modified except the
**reuse of `GroqStt`** (and the `SttEngine`/`VoiceError`→`SttError` types it already exports). The
voice worker, LiveKit, VAD, edge-tts, and `rtc_token` are untouched.

## 3. Design

### 3.1 Per-turn flow (client-paced, no live loop)
Async video is **turn-by-turn and candidate-paced** — there is no server-driven loop holding a
connection open (contrast: voice runs `conduct_interview` in a worker). Each question is its own
record → upload → transcribe → one brain turn → next question cycle, which maps **directly onto the
existing `submit_turn` semantics** (the text path already does exactly one `next_question` per HTTP
call). The only difference from text is **where the answer text comes from**: STT of an uploaded
clip instead of a typed string.

```
Candidate (browser)                 ai-agents (REST)                 storage / brain
──────────────────                  ────────────────                 ───────────────
start interview ───────────────────► POST /interview/{id}/start  ──► first question (existing)
                                          (unchanged)
record clip for Q ──┐
(MediaRecorder)     │  ask for upload URL
                    └──► POST /interview/{id}/video/upload-url ───► presigned_put_url(comp_id,
                                       (owner-checked)               "video-answers", key)
PUT clip bytes ─────────────────────► (direct to MinIO/S3, presigned PUT — bytes skip the API)
                    ┌── submit the recorded answer
                    └──► POST /interview/{id}/video/turn  ──────►  load+owner-check session
                          { object_key }                          → GroqStt.transcribe(clip audio)
                                                                  → VideoAnswerTransport.ask() == that text
                                                                  → existing submit_turn logic:
                                                                    append TranscriptTurn(q, transcript),
                                                                    budget check, next_question,
                                                                    persist video_answers row
                          ◄── { done, question }                  finalize == text path when done:
                                                                    save_interview → publish
                                                                    interview.completed → Evaluator
```

On `done`, finalize is the **existing** `interview_host._finalize` (save transcript → publish
`interview.completed` → flip status LAST). The transcript is the same `Transcript` model → the
Evaluator and report read path are unaffected.

### 3.2 `VideoAnswerTransport` — the seam adapter
`src/ai-agents/app/resources/video/transport.py` (new package, mirrors `resources/voice/`):

```python
class VideoAnswerTransport:
    """Implements Transport.ask(): returns the STT transcript of an uploaded clip.

    Unlike VoiceTransport (which awaits live VAD-segmented audio), this resolves a
    single already-uploaded clip per question. The brain calls ask() identically.
    """
    def __init__(self, *, stt: SttEngine, storage, clips: AsyncIterator[ClipRef]): ...
    async def ask(self, question: str) -> str:
        clip = await anext(self._clips, None)      # next recorded answer; None => no more
        if clip is None:
            return ""                                # finalizes via the existing empty-answer guard
        audio = await self._storage.get_raw(clip.object_key)
        return (await self._stt.transcribe_clip(audio)).strip()   # "" on empty/garbled
```

- It imports **nothing heavy** (no groq/av) — only the injected `SttEngine` + storage seams, so the
  gate stays offline (same discipline as `VoiceTransport`).
- It is what the **offline `conduct_interview` harness** drives in tests (fake STT + fake storage),
  exactly as `VoiceTransport` is tested with fake engines. In production the per-turn REST path
  (§3.4) is the live driver, but the adapter keeps the modality behind the one seam the brain knows.
- `ask()` returning `""` (no clip / empty STT) triggers the **existing empty-answer guard** → the
  loop finalizes cleanly. No new finalize logic.

### 3.3 Transcription — reuse `GroqStt`, add a decode step
`GroqStt.transcribe(pcm16_16k: bytes)` expects **raw PCM16 mono 16 kHz**; browser `MediaRecorder`
clips are a **webm/mp4 container** (Opus/AAC audio). Bridge with one decode helper in
`infra/video/clip_decode.py` (PyAV — **already a voice dependency**): demux+decode the clip's audio
stream → resample to PCM16/16k → hand to the **unchanged** `GroqStt`. Exposed as
`SttEngine.transcribe_clip(container_bytes) -> str` (a thin sibling of `transcribe`), so the
`VideoAnswerTransport` depends only on the Protocol. `SttError` (already defined in
`resources/voice/engines.py`) is the typed failure; bounded retry/backoff already lives in `GroqStt`.

> Rationale: do not re-implement Whisper calling, retries, or WAV framing — only the container→PCM
> front-end is new, and PyAV already does this for edge-tts MP3 decode in the voice path.

### 3.4 REST endpoints (ai-agents `interview_api.py`, owner-checked like `/turn`)
Both reuse `_caller_user_id` + the session-ownership check (`session.candidate_user_id == user_id`),
returning the same `404 / 403 / 503` shape as `/interview/{id}/rtc-token`:

- **`POST /interview/{application_id}/video/upload-url`** → `{ "object_key", "url", "method": "PUT",
  "headers": {...} }`. Validates the session exists + is owned + `in_progress`; derives a
  tenant-namespaced key `f"{comp_id}/video-answers/{application_id}/{uuid4().hex}.webm"`; returns a
  **short-TTL presigned PUT** (`storage.presigned_put_url`, clamped like the GET path). `503` when
  storage is unconfigured. The candidate uploads bytes **directly** to MinIO/S3 — large media never
  transits the API.
- **`POST /interview/{application_id}/video/turn`** with `{ "object_key": str }` → `{ "done",
  "question" }`. Owner-checked; **validates the `object_key` belongs to this application's prefix**
  (`f"{comp_id}/video-answers/{application_id}/"`) so a caller can't point a turn at someone else's
  object. Calls a new `submit_video_turn` resource that: transcribes the clip (via `GroqStt`),
  records the `video_answers` row, then runs the **existing** `submit_turn` body (append, budget,
  `next_question`, finalize). Empty/garbled transcript → records an empty answer (existing guard),
  advances — no dead end.

`"settings"` and `"storage"` are threaded onto `app.state.deps` in `main.py` (settings already added
for `rtc-token`; add the `ObjectStorage` instance the same way).

### 3.5 Storage & data
- **Clips:** `ObjectStorage`, category `"video-answers"`, key prefix per `(comp_id, application_id)`.
  SSE-S3 at rest is already enforced by `put`/presign. New method `presigned_put_url(comp_id,
  category, key, content_type, ttl=None)` mirrors `presigned_get_url` (clamped TTL, tenant-prefixed
  key); the candidate PUTs to it. Recordings in MinIO were always the P4/Inc-6 plan.
- **`video_answers` collection** (admin owns Mongo; written via the mcp-data gateway like other
  interview artifacts): `{ comp_id, application_id, question, object_key, transcript, created_at }`.
  One row per answered question. Index `(comp_id, application_id)` declared in
  `admin/infra/db.py` (the single index authority). The `object_key` is the exact handle
  `get_raw`/`delete_raw` consume — no re-derivation needed.
- **Transcript** stays the existing `Transcript`/`TranscriptTurn` — the per-turn answer is the STT
  text. `video_answers` is an **additive audit/asset trail**; the scored artifact is the transcript,
  unchanged.

### 3.6 Frontend (candidate)
- **Mode selector** on `app/interview/[applicationId]/page.tsx`: today text (+ planned voice). Add a
  **video** option. Default remains text; modality is the candidate's choice.
- **`components/video-recorder.tsx`** (`"use client"`): `MediaRecorder` over
  `getUserMedia({video, audio})` — per question: live preview, Record/Stop, a **re-record** before
  submit, then Upload (PUT to the presigned URL) → POST `/video/turn` → render the next question.
  Bounded clip length + a small retake cap (config) to keep STT latency and storage sane.
- **Device pre-check + fallback to text:** probe `getUserMedia`; on no camera/mic, denied permission,
  unsupported `MediaRecorder`, or a `503` from `upload-url`, **fall back to the existing text
  interview** (no dead end) — the same fallback principle the voice mode uses.
- Reuse `authedFetch` (401-refresh) and the existing `HttpError` handling for both calls.

### 3.7 Auth / tenancy
Per-application, **owner-checked exactly like `/turn`**: `_caller_user_id` from the access token →
`session.candidate_user_id == user_id` (else 403), session must exist (else 404) and be `in_progress`.
Every `video_answers` doc and query carries `comp_id`; the upload key and the turn's `object_key` are
prefixed `{comp_id}/video-answers/{application_id}/` and validated server-side, so neither a presigned
URL nor a turn can cross a tenant or an application boundary.

## 4. Key decisions & tradeoffs
- **Async one-way, not live.** A recorded-clip model needs **no LiveKit/SFU, no VAD, no worker** —
  far simpler than voice and a good fit for "answer on your own time." Tradeoff: no barge-in /
  natural turn-taking (irrelevant for one-way) and STT latency is per-clip (acceptable; the candidate
  isn't waiting in a live call).
- **Reuse `GroqStt` + add only a decoder.** Same free STT, retries, and error type as voice; only the
  container→PCM front-end is new (PyAV already vendored). Avoids a second STT integration.
- **Presigned PUT, bytes skip the API.** Media uploads go **client → object store** directly (résumé
  pattern, extended to PUT). Keeps ai-agents stateless and off the large-payload path; the API only
  mints URLs and records the `object_key`.
- **Map onto `submit_turn`, don't fork the brain.** The video turn is the text turn with an
  STT-derived answer. `VideoAnswerTransport` keeps the modality behind the `Transport.ask` seam for
  the offline harness; the live path reuses the existing per-turn finalize. **Zero brain edits.**
- **Transcript is the scored artifact; the clip is an asset.** Scoring/funnel/report read the
  transcript (identical shape) → no evaluator or report change. `video_answers` adds the clip trail.
- **Cut video identity/affect analysis.** We transcribe audio only — staying out of the EU-prohibited
  biometric/affect zone the v2 overview permanently excludes.

## 5. Testing approach (offline gate stays green)
- **`VideoAnswerTransport` (unit, offline):** a **fake `SttEngine`** (scripted transcripts; reuse the
  `fake_stt` fixture pattern in `conftest.py`) + a **fake storage** (in-memory `object_key → bytes`,
  mirroring `lib/tests/test_storage.py`'s `FakeS3Client`). Assert `ask(q)` fetches the clip and
  returns the scripted transcript; empty/`None` clip → `""`; `SttError` surfaces as `""`
  (records-empty-answer guard). No network, no models, no PyAV in this test (storage + STT are
  injected fakes).
- **`submit_video_turn` (unit, offline):** drive N turns with a fake STT + fake storage + fake
  sessions/data/publisher (the existing fixtures) → asserts each turn appends a `TranscriptTurn`,
  writes a `video_answers` row, and on `done` finalizes **exactly once** (one `interview.completed`),
  mirroring `test_interview_host.py`. Proves the brain/finalize path is shared, not duplicated.
- **`ObjectStorage.presigned_put_url` (lib unit):** extend `lib/tests/test_storage.py` with the
  existing `FakeS3Client.generate_presigned_url` to assert tenant-prefixed key + clamped TTL.
- **Endpoints (FastAPI `TestClient`):** `upload-url` and `video/turn` → `200` for the owner,
  `401` no token, `403` wrong user / cross-application `object_key`, `404` no session, `503` storage
  unconfigured — mirroring the existing interview_api + `rtc-token` tests.
- **Clip decode (`infra/video/clip_decode.py`):** a tiny fixed webm/mp4 fixture → assert PCM16/mono/
  16 k framing (the decode/resample is the logic worth testing; the Groq call is mocked, as in the
  existing `GroqStt` tests). If the model/codec is too heavy for the gate, gate it behind a marker and
  test the framing math with a fake decoder — same escape hatch the voice VAD test uses.
- **Regression:** the **text path is the baseline** — its tests are untouched and stay green; the
  evaluator/scoring tests do not change (identical transcript). `bash scripts/check.sh` stays green
  (baseline **423** tests; this only grows it). All new heavy deps (PyAV, Groq, S3) sit behind
  injected seams with fakes.

## 6. Open questions
1. **Live driver shape.** Lock the per-turn REST endpoints (§3.4) as primary, with
   `VideoAnswerTransport` + `conduct_interview` as the offline harness — vs. driving the live path
   through the adapter too. (Leaning: REST per-turn primary; adapter for tests + the §11 seam proof.)
2. **Retake / clip-length caps.** Max clip seconds + max retakes per question (config) — bound STT
   latency and storage; pick defaults during planning.
3. **Container/codec from `MediaRecorder`.** Pin the recorded mime (`video/webm;codecs=vp8,opus` vs
   mp4/h264 across browsers) and confirm the PyAV decode path covers it; fall back to text if the
   browser offers no supported recorder mime.
4. **Recruiter clip access.** A presigned-GET "watch clip" link on the report (read-only, owner-comp,
   short-TTL) — thin follow-up, or out of scope for the demo? Transcript-only scoring needs neither.
5. **Clip retention/TTL.** Whether clips get a storage lifecycle/TTL independent of erasure (e.g.
   auto-expire raw video after scoring) — the erasure cascade (§Inc 0) already deletes them on
   right-to-erasure regardless.
