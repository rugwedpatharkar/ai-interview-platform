# Async Video Interview (Inc 6, Pillar C) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this task-by-task. Steps use `- [ ]`
> checkboxes. Spec: `docs/superpowers/v2/2026-06-19-async-video-interview-design.md`. Canonical
> design: `docs/superpowers/v2/2026-06-19-v2-architecture-overview-design.md` (Inc 6, Pillar C).

**Goal:** Add an **async / one-way recorded video** answer modality — the candidate records a clip
per question, uploads it, the backend transcribes the audio (**reuse `GroqStt`**), and the
transcript feeds the **same per-turn interviewer loop**. Scoring, funnel, data ownership, the
evaluator, and the text + voice interviews are **unchanged**.

**Architecture:** A new **`VideoAnswerTransport`** implements the existing `async ask(question) ->
str` contract (`src/ai-agents/app/resources/transport.py`): `ask()` returns the STT transcript of an
already-uploaded clip. It is a **2nd adapter** alongside the built `VoiceTransport`; the brain
(blueprint + `next_question` + finalize + evaluator) is untouched (identical `Transcript` shape).
The live path is **per-turn REST**, client-paced, mapping onto the existing `submit_turn` finalize —
the answer text just comes from STT of a clip instead of a typed string. Heavy deps (PyAV decode,
Groq, S3) sit behind injected seams (`SttEngine`, storage) with fakes, so the gate stays offline.

**Voice is out of scope.** Do NOT modify `resources/voice/*`, `infra/voice/*`, `voice_worker.py`,
`rtc_token`, LiveKit, VAD, or edge-tts — **except reusing** `GroqStt` and the `SttEngine` /
`SttError` types it already exports. The remaining voice FE/E2E is `../plans/2026-06-19-voice-interview.md`
TIER D; this plan never rewrites it.

**Tech stack (reuse-first):** `GroqStt` (`whisper-large-v3-turbo`, already vendored) · `av` (PyAV —
already a voice dep) for clip-container → PCM16/16k decode · `lib.storage.ObjectStorage` (MinIO/S3,
`+presigned_put_url`) · frontend browser **`MediaRecorder`** + `getUserMedia` (no new FE dep).

## Global constraints
- **LOCAL-ONLY — never run git/gh.** "Commit" steps are replaced by **"run the gate"**:
  `bash scripts/check.sh` (ruff format+lint S-rules line-88, pip-audit, pytest ×5) must stay green;
  baseline today is **423 tests**. Frontend verified by
  `npx pnpm@9.15.0 --filter @ip/candidate build` + `--filter @ip/{ui,shared,api-client} typecheck`.
  Never `next build` while `pnpm dev` is live.
- **Brain unchanged:** do not modify `blueprint.py`, `interviewer.py` (`next_question`), the evaluator,
  scoring, the funnel, or `interview_host._finalize`. The text path (`/interview/{id}/turn`) is the
  regression baseline; the evaluator/scoring tests are untouched (identical transcript shape).
- **Robustness bar (every new module):** validate at external boundaries (uploaded clip, STT, storage,
  `MediaRecorder`); wrap each third-party/network call in try/except with `get_logger(...)` structured
  logs + a typed domain error (`SttError`, reuse); bounded retry/backoff already lives in `GroqStt`;
  release resources in `finally`; no bare `except: pass`; trust internal typed calls. Follow
  `~/.claude/CLAUDE.md` (minimal, trust-the-system, validate-at-boundaries) +
  `docs/superpowers/plans/PRODUCTION_STANDARDS.md`.
- **Flexibility:** STT + storage are injected seams (swap Groq→Deepgram, MinIO→S3 without touching the
  turn logic). Config-driven; secrets via env only.
- **Tenancy/auth:** per-application, owner-checked exactly like `/turn`; every `video_answers` doc +
  query carries `comp_id`; the upload key and the turn's `object_key` are prefixed
  `{comp_id}/video-answers/{application_id}/` and validated server-side (no cross-tenant /
  cross-application object).

---

## File structure (new + modified)

```
lib/lib/storage/client.py                  (+presigned_put_url — mirrors presigned_get_url)
lib/tests/test_storage.py                  (+presigned PUT test via existing FakeS3Client)

src/ai-agents/app/
  config.py                                (no new secrets — reuses groq_api_key; +video_max_clip_seconds/_retakes/_clip_bytes/_clip_retention_days)
  routes/interview_api.py                  (+POST /video/upload-url, +POST /video/turn; reuse _caller_user_id)
  resources/video/                         (NEW package — the async-video plane; mirrors resources/voice/)
    __init__.py
    transport.py                           (VideoAnswerTransport: implements `async ask(q)->str`)
    session.py                             (submit_video_turn: STT + video_answers row + reuse submit_turn finalize)
  infra/video/                             (NEW — the only file importing av)
    __init__.py
    clip_decode.py                         (decode webm/mp4 container bytes -> PCM16 mono 16k)
  resources/voice/groq_stt.py              (+transcribe_clip(container_bytes): decode then reuse transcribe; reuses GroqStt)

src/ai-agents/tests/
  test_video_transport.py                  (VideoAnswerTransport with fake STT + fake storage)
  test_video_session.py                    (submit_video_turn: N turns -> finalize once; cross-app object_key 403; STT-error-vs-empty; test_video_answer_no_frame_processing)
  test_video_endpoints.py                  (upload-url + video/turn: 200/401/403/404/503; size-cap in upload-url; retryable SttError not 200-empty)
  test_clip_decode.py                      (WebM/Opus + MP4/AAC fixtures -> PCM16/16k; no-audio + unsupported-codec -> SttError)
  conftest.py                              (+fake_storage fixture; reuse fake_stt/sessions/data/publisher)

src/admin/app/
  infra/repositories/video_answers.py      (NEW — delete_by_user / delete_by_applications / list_by_*)
  infra/db.py                              (+video_answers index (comp_id, application_id))
  resources/compliance.py                  (CandidateEraser: +video_answers cascade + clip delete_raw)
  main.py                                  (+video_answers repo into CandidateEraser deps)
src/admin/tests/test_resources_compliance.py (+assert video_answers + clips purged on erase)

frontend/apps/candidate/
  app/interview/[applicationId]/page.tsx   (+video-mode option + device pre-check + text fallback)
  components/video-recorder.tsx            (NEW — MediaRecorder: record/preview/retake/upload/turn)
frontend/packages/shared/src/
  video.ts                                 (NEW — makeVideoClient: getUploadTarget()/submitTurn() via authedFetch; putClip() via XHR for upload progress)
  index.ts                                 (export video client + putClip + types)
frontend/apps/candidate/lib/auth.tsx       (+video client wired beside interview/chat/proctor)
```

**Responsibilities (one job each):** `resources/video/transport.py` = the `ask()` bridge (no
av/groq imports — only the `SttEngine` + storage seams). `resources/video/session.py` = the per-turn
glue that reuses `submit_turn`'s finalize. `infra/video/clip_decode.py` = the only file importing
`av`. `groq_stt.transcribe_clip` = decode-then-`transcribe` (reuses the existing Whisper call +
retries). This keeps the testable logic free of heavy deps (the gate stays offline).

---

## TIER A — the seam (VideoAnswerTransport behind Transport, failing test first)

### Task 1 — fake storage fixture + reuse fake STT (TDD foundation)
**Files:** Modify `src/ai-agents/tests/conftest.py`.
- [ ] **Step 1** — add a `fake_storage` fixture: an in-memory `object_key -> bytes` store with
  `async get_raw(object_key) -> bytes`, `async delete_raw(object_key)`, and a `put_raw(key, bytes)`
  test-seed helper (mirror `lib/tests/test_storage.py`'s `FakeS3Client`; record deleted keys).
- [ ] **Step 2** — confirm `fake_stt` (scripted transcripts, `None`→`SttError`) is reusable as-is for
  the video transport; add a `transcribe_clip` method to the fake delegating to its scripted list (so
  the fake satisfies the extended `SttEngine`). Gate green (fixtures are import-only).

### Task 2 — `VideoAnswerTransport` (TDD — the core seam)
**Files:** Create `src/ai-agents/app/resources/video/__init__.py`,
`src/ai-agents/app/resources/video/transport.py`; Test `src/ai-agents/tests/test_video_transport.py`.
**Interfaces — Consumes:** `SttEngine` (with `transcribe_clip`), storage (`get_raw`), an
`AsyncIterator` of clip refs. **Produces:** `class VideoAnswerTransport` with
`async def ask(self, question: str) -> str` (the existing `Transport` contract — see
`app/resources/transport.py`; sibling of `VoiceTransport`).
- [ ] **Step 1 — failing test:**
```python
async def test_ask_returns_transcript_of_uploaded_clip(fake_stt, fake_storage):
    storage = fake_storage()
    storage.put_raw("c/video-answers/a1/x.webm", b"<clip-bytes>")
    stt = fake_stt(); stt.set_transcripts(["I used asyncio for concurrency."])
    vt = VideoAnswerTransport(
        stt=stt, storage=storage,
        clips=aiter_of([ClipRef(object_key="c/video-answers/a1/x.webm")]),
    )
    assert await vt.ask("How did you handle concurrency?") == "I used asyncio for concurrency."

async def test_ask_returns_empty_when_no_more_clips(fake_stt, fake_storage):
    vt = VideoAnswerTransport(stt=fake_stt(), storage=fake_storage(), clips=aiter_of([]))
    assert await vt.ask("Q") == ""           # finalizes via existing empty-answer guard
```
- [ ] **Step 2 — run** `(cd src/ai-agents && ../../.venv/bin/python -m pytest tests/test_video_transport.py -v)` → FAIL (module missing).
- [ ] **Step 3 — implement** `transport.py` (no av/groq imports; mirror `VoiceTransport`'s seam-only
  discipline + docstring):
```python
class VideoAnswerTransport:
    def __init__(self, *, stt, storage, clips):
        self._stt, self._storage, self._clips = stt, storage, clips

    async def ask(self, question: str) -> str:
        clip = await anext(self._clips, None)
        if clip is None:
            log.info("video: no more clips; ending interview")
            return ""
        audio = await self._storage.get_raw(clip.object_key)
        try:
            return (await self._stt.transcribe_clip(audio)).strip()
        except SttError:
            log.exception("video: STT failed for {}", clip.object_key)
            return ""          # records empty answer (existing guard), loop advances
```
- [ ] **Step 4 — run → PASS** + add tests: `SttError` → `""`; empty transcript → `""`.
- [ ] **Step 5 — gate green.**

---

## TIER B — transcription (reuse GroqStt) + storage presign

### Task 3 — `transcribe_clip` decode path (TDD logic; mocked network)
**Files:** Create `src/ai-agents/app/infra/video/__init__.py`,
`src/ai-agents/app/infra/video/clip_decode.py`; Modify `src/ai-agents/app/resources/voice/groq_stt.py`
(+`transcribe_clip`); Test `src/ai-agents/tests/test_clip_decode.py`. Confirm `av` is already in
`src/ai-agents/pyproject.toml` (voice dep); add if missing.
- [ ] **Step 1 — `clip_decode.py`** — `decode_to_pcm16_16k(container_bytes: bytes) -> bytes`: open the
  in-memory container with `av`, demux the **audio** stream, decode + `av.AudioResampler` to mono s16
  @ 16 kHz, concatenate frames → raw PCM16 bytes. Validate at the boundary (no audio stream → raise
  `SttError("clip has no audio")`); wrap av calls in try/except → `SttError` + structured log;
  release the container in `finally`.
- [ ] **Step 1b — codec enforcement (resolves "codec enforcement: Safari AAC vs Chrome Opus"):** the
  decode helper is the **single validator** that STT only ever receives a decodable container. Confirm
  the vendored PyAV/ffmpeg build decodes **both** Chrome's **WebM/Opus** and Safari's **MP4/AAC** (add
  a tiny MP4/AAC fixture alongside the WebM/Opus one and assert both yield PCM16/mono/16k). A codec
  PyAV can't open must raise `SttError("unsupported audio codec: <name>")` (catch the av open/decode
  error and re-raise as `SttError`, never let an undecodable blob reach `transcribe`). This is the
  server backstop; the FE `MediaRecorder.isTypeSupported` probe + text fallback (Task F2/F3) is the
  front guard.
- [ ] **Step 2 — `GroqStt.transcribe_clip`** — `async def transcribe_clip(self, container_bytes:
  bytes) -> str: return await self.transcribe(decode_to_pcm16_16k(container_bytes))`. Reuses the
  **existing** WAV-wrap + Whisper call + retries unchanged. (Add `transcribe_clip` to the `SttEngine`
  Protocol in `resources/voice/engines.py` as an additive method — voice ignores it.)
- [ ] **Step 3 — tests** — a tiny fixed webm/mp4 fixture → assert PCM16/mono/16k framing
  (the decode/resample is the logic worth testing); the Groq client is **injected/mocked** as in the
  existing `GroqStt` tests (no network). No-audio container → `SttError`. If the codec is too heavy
  for the gate, gate the real-decode test behind a marker and test the framing math with a fake
  decoder (same escape hatch the voice VAD test uses).
- [ ] **Step 4 — gate green** (network/codecs never hit in the default gate run).

### Task 4 — `ObjectStorage.presigned_put_url` (TDD, lib) — tenant-prefixed, TTL-clamped, **size-capped**
**Files:** Modify `lib/lib/storage/client.py`; Test `lib/tests/test_storage.py`.
- [ ] **Step 1 — failing test** (extend with the existing `FakeS3Client.generate_presigned_url`):
```python
async def test_presigned_put_url_is_tenant_prefixed_and_clamped():
    s = _storage_with_fake()
    url = await s.presigned_put_url("c1", "video-answers", "a1/x.webm",
                                    content_type="video/webm", ttl=99999)
    assert "c1/video-answers/a1/x.webm" in url
    assert "exp=3600" in url       # clamped to presign_ttl_max
```
- [ ] **Step 2 — run → FAIL.**
- [ ] **Step 3 — implement** mirroring `presigned_get_url` (clamp TTL, tenant-prefixed `_key`,
  `generate_presigned_url("put_object", Params={Bucket, Key, ContentType}, ExpiresIn=...)`).
- [ ] **Step 4 — size cap (resolves "presigned size limit"):** add a `max_bytes: int | None = None`
  param; when set, sign a **`content-length-range` condition** (`0..max_bytes`) into the presigned
  request so **S3/MinIO rejects an oversized PUT at the storage layer** — the bytes never land and
  ai-agents never buffers them. Add a test asserting the condition is present/clamped when `max_bytes`
  is passed and absent when `None` (back-compat for non-video presigns). The caller (Task 6) passes
  `video_max_clip_bytes`.
- [ ] **Step 5 — run → PASS; gate green** (`cd lib && pytest -q`).

---

## TIER C — wire the live per-turn path (reuse submit_turn finalize)

### Task 5 — `submit_video_turn` resource (TDD — reuse the existing finalize)
**Files:** Create `src/ai-agents/app/resources/video/session.py`; Test
`src/ai-agents/tests/test_video_session.py`. **Reuse** `interview_host.submit_turn`'s finalize
semantics — do NOT duplicate scoring/finalization.
**Interfaces — Produces:** `async def submit_video_turn(application_id, object_key, *,
caller_user_id, sessions, data, publisher, llm, stt, storage) -> InterviewTurnDecision`.
- [ ] **Step 1 — failing test** (fakes only — no av/groq/network): seed `fake_storage` with a clip,
  script `fake_stt`; drive a turn → asserts a `TranscriptTurn(question, transcript)` is appended, a
  `video_answers` row is written (`save_video_answer` on fake data), and the returned decision matches
  the next question; a happy-path N-turn run finalizes **exactly once** (one `interview.completed`),
  mirroring `test_interview_host.py`.
- [ ] **Step 2 — run → FAIL.**
- [ ] **Step 3 — implement:** owner-check session (`NotFoundError`/`ForbiddenError`, status
  `in_progress`); **airtight `object_key` validation FIRST** (resolves "airtight `object_key`
  ownership"): derive `expected_prefix = f"{session.comp_id}/video-answers/{application_id}/"` from the
  **owner-checked session** (never the request body) and `raise ForbiddenError` if
  `not object_key.startswith(expected_prefix)` — this gate runs **before** any `storage.get_raw`, so a
  forged key never triggers a fetch (no existence oracle, no cross-tenant read). Then transcribe
  `await stt.transcribe_clip(await storage.get_raw(object_key))`; persist the `video_answers` row via
  the data gateway (`save_video_answer(application_id, {comp_id, question, object_key, transcript})`);
  then run the **existing** per-turn body — append `TranscriptTurn`, budget check, `next_question`, and
  on `done`/budget call `interview_host._finalize` (import + reuse; do not re-implement).
- [ ] **Step 3b — STT error vs empty (resolves "STT error vs empty differentiation"):** wrap the
  `transcribe_clip` call so the **two outcomes stay distinct** —
  - **`SttError`** (network/API/decode/no-audio, after `GroqStt`'s bounded retry): do **NOT** record an
    empty answer and do **NOT** advance — re-raise a typed **retryable** error the endpoint maps so the
    FE keeps the take and offers Retry (a swallowed real answer must never become a silent empty turn).
  - **Empty transcript** (`transcribe_clip` returns `""`/whitespace — Whisper heard no speech): record
    an **empty `TranscriptTurn`** (existing empty-answer guard) and **advance** — a genuine no-speech
    answer, not a failure.
  Add a one-line comment at the `except SttError` site explaining *why* (don't conflate a failed read
  with a silent answer).
- [ ] **Step 4 — run → PASS** + tests:
  - `test_video_turn_rejects_cross_application_object_key`: owner for `a1`/`c1`, `object_key`
    `"c1/video-answers/a2/stolen.webm"` (same tenant, **other application**) → `ForbiddenError` **and**
    assert the fake storage's `get_raw` was **never called** (zero reads); a second case
    `"c2/video-answers/a1/x.webm"` (**other tenant**) → also rejected.
  - empty STT (`""`) → records an empty answer and advances (next question returned);
  - **`SttError` → resumable**: the turn does **not** advance and **no** `video_answers`/transcript is
    written for that turn (distinct from the empty case);
  - hangup-equivalent (no more clips / explicit empty) finalizes the partial; budget exhaustion
    finalizes. **Step 5 — gate green.**

### Task 6 — REST endpoints (TDD — owner-checked like /turn)
**Files:** Modify `src/ai-agents/app/routes/interview_api.py`,
`src/ai-agents/app/config.py` (+`video_max_clip_seconds`, `video_max_retakes`, `video_max_clip_bytes`);
thread `"storage"` onto `app.state.deps` in `main.py`. Test
`src/ai-agents/tests/test_video_endpoints.py`.
**Produces:** `POST /interview/{application_id}/video/upload-url` → `{object_key, url, method,
headers}`; `POST /interview/{application_id}/video/turn` `{object_key}` → `{done, question}`.
- [ ] **Step 1 — failing endpoint tests** (FastAPI `TestClient`, mirror existing interview_api +
  `rtc-token` tests): `upload-url` → 200 `{object_key,url,...}` for owner; `video/turn` → 200
  `{done,question}` for owner; **401** no token; **403** wrong user **and** cross-application
  `object_key` (prefix mismatch); **404** no session; **503** storage unconfigured.
- [ ] **Step 2 — run → FAIL.**
- [ ] **Step 3 — implement** both endpoints reusing `_caller_user_id` + the session-ownership pattern
  from `/rtc-token`:
  - `upload-url`: load+owner-check session (`in_progress`); `503` if storage unset; key
    `f"{session.comp_id}/video-answers/{application_id}/{uuid4().hex}.webm"`; return
    `storage.presigned_put_url(..., content_type="video/webm", max_bytes=settings.video_max_clip_bytes)`
    (**size-capped presign**, resolves "presigned size limit") + the `object_key`. The response embeds
    the size-conditioned headers/policy the client must replay.
  - `video/turn`: load+owner-check; **reject** `object_key` not under
    `f"{session.comp_id}/video-answers/{application_id}/"` (403 — the §3.4 airtight check, enforced in
    `submit_video_turn` Step 3); call `submit_video_turn(...)`; map `NotFoundError`/`ForbiddenError` →
    404/403 (existing pattern) and the **retryable `SttError`** (STT network/decode failure, §Task 5
    Step 3b) → a transient status the FE retries (e.g. 503/409 per the existing transient convention) —
    **not** a 200-with-empty-answer (never advance on a failed read).
- [ ] **Step 4 — run → PASS; gate green** (clients injected; no network in tests). Add an endpoint test
  asserting the `upload-url` response carries the size-cap condition.

### Task 8 — `test_video_answer_no_frame_processing` guard (TDD — protects the non-surveillance thesis)
**Files:** Test `src/ai-agents/tests/test_video_session.py` (add the case) — no production change; this
test **pins the invariant** that the pipeline transcribes **audio only** and **never** analyzes video
frames (identity / affect / attention), the EU-prohibited zone the v2 overview permanently excludes.
- [ ] **Step 1 — `test_video_answer_no_frame_processing`** (offline, fakes): drive a `submit_video_turn`
  with a fake STT + fake storage and assert the modality is **audio-only**:
  - the clip is routed **only** through `transcribe_clip` → `decode_to_pcm16_16k` (the **audio**-stream
    decode); assert the fake STT's `transcribe_clip` was called and that the produced answer is the
    scripted **transcript** (no other per-clip consumer touched the bytes);
  - assert **no** frame/image path exists: the `resources/video/` + `infra/video/` modules import **no**
    image/vision/face library (a static guard — e.g. assert `cv2`/`mediapipe`/`face_recognition`/`PIL`
    are **not** importable-from / referenced by those modules), and `clip_decode` only ever demuxes the
    **audio** stream (the decode path never opens a video stream);
  - assert the persisted `video_answers` row stores the clip **opaquely** (`object_key` + transcript)
    with **no** frame-derived fields (no affect/score/landmark keys).
- [ ] **Step 2 — run → PASS; gate green.** (Pairs with the FE invariant in Task F2 Step 1 — neither the
  client nor the server analyzes frames.)

---

## TIER D — erasure cascade (admin)

### Task 7 — erasure-cascade entry (TDD — Inc 0 cascade extension)
**Files:** Create `src/admin/app/infra/repositories/video_answers.py`; Modify
`src/admin/app/infra/db.py` (+index), `src/admin/app/resources/compliance.py` (CandidateEraser),
`src/admin/app/main.py` (wire the repo). Test `src/admin/tests/test_resources_compliance.py`.
- [ ] **Step 1 — failing test:** extend the eraser test — seed `video_answers` for the candidate's
  applications (each with an `object_key`) → after `erase(user_id)`, assert the rows are deleted
  **and** each clip's `object_key` was `delete_raw`'d (best-effort; a storage failure is logged, not
  fatal — mirror the existing résumé-delete behavior).
- [ ] **Step 2 — run → FAIL.**
- [ ] **Step 3 — implement:** `video_answers` repo with `list_by_applications`,
  `delete_by_applications(app_ids)` (and `delete_by_user` if keyed by user); index
  `(comp_id, application_id)` in `db.py` (single index authority). In `CandidateEraser.erase`, after
  the existing report/interview/attempt purges: list the candidate's video_answers (by their
  applications, already loaded), `delete_raw` each `object_key` in a best-effort try/except (log on
  failure), then `delete_by_applications`. Wire the repo in `main.py`'s eraser construction. This is
  the **mandatory, age-independent** path that guarantees clips leave storage on right-to-erasure
  (resolves the erasure half of "clip retention/erasure").
- [ ] **Step 3b — optional post-decision TTL (resolves the retention half — keeps storage bounded
  absent erasure):** document + (optionally) configure a storage **lifecycle rule** on the
  `video-answers/*` prefix that auto-expires the **raw video** `video_clip_retention_days` (config,
  e.g. 30) after the application reaches a terminal decision. The **transcript is the scored artifact
  and is retained** — expiring the clip never affects scoring/report. Default-on with a sane N; N=0 /
  disabled retains indefinitely. (Lifecycle is a bucket/infra config, not code in the hot path — note
  it here and in `config.py`; no unit test beyond asserting the config default exists.)
- [ ] **Step 4 — run → PASS; gate green** (`bash scripts/check.sh`).

---

## TIER F — Frontend (detailed)

> **Scope.** The candidate's async-video answer UI. Backend tiers A–D are unchanged. The brain,
> the text `/turn` path, and the voice mode are untouched. This tier adds **one `@ip/shared` client
> file**, **one new component**, and a **mode-selector + device-precheck expansion** of the existing
> interview page — all reusing the page's proven per-turn discipline (the `inFlight` ref latch, the
> `beforeunload` guard, the consent gate, the terminal `409/410 → ended` state, and the visible
> error + inline Retry). **No new FE dependency** — `MediaRecorder` + `getUserMedia` are browser
> built-ins; uploads use `XMLHttpRequest` for the one capability `fetch` lacks (`upload.onprogress`).
>
> **Reuse map (FE):** `authedFetch`/`restAuthFor`/`HttpError`/`isSessionEnded(409|410)` (mirror
> `shared/src/interview.ts`); the `useMutation` + retry-preserving-the-input upload shape (mirror
> `app/profile/page.tsx`); `@ip/ui` primitives only — `Card`/`CardContent`, `Button`, `Alert`,
> `Spinner`, `Progress`, `RadioGroup`/`RadioGroupItem`, `Badge`, `Checkbox`, `toast` (all already in
> `packages/ui/src/index.ts`). Wire the new client in `apps/candidate/lib/auth.tsx` beside
> `interview`/`chat`/`proctor`.

### Task F1 — `@ip/shared` video client (presign + submit, mirrors `interview.ts`)
**Files:** Create `frontend/packages/shared/src/video.ts`; Modify `frontend/packages/shared/src/index.ts`
(export the client + types). **Pattern source:** `shared/src/interview.ts` (the `restAuthFor` +
`authedFetch` + `HttpError`-on-non-2xx POST helper) and `shared/src/proctor.ts` (the per-application
URL shape). **No gRPC** — these are ai-agents REST endpoints (`NEXT_PUBLIC_AIAGENTS_URL`).
- [ ] **Step 1 — types** (exported from `video.ts`, re-exported in `index.ts`):
```ts
export interface VideoUploadTarget {
  objectKey: string;                 // server-minted, tenant+app-prefixed (validated server-side)
  url: string;                       // short-TTL presigned PUT
  method: "PUT";
  headers: Record<string, string>;   // MUST be replayed verbatim on the PUT (Content-Type signed in)
}
export interface VideoTurn { done: boolean; question: string }   // identical shape to InterviewTurn
export type UploadProgress = (fraction: number) => void;          // 0..1, for the Progress bar
```
- [ ] **Step 2 — `makeVideoClient(baseUrl, store)`** mirroring `makeInterviewClient`: a private
  `post<T>(path, body?)` via `authedFetch(restAuthFor(store))` that throws
  `new HttpError(res.status, body?.detail ?? ...)` on non-2xx (so the page's existing
  `isSessionEnded`/`isTransient`/`errorMessage` helpers classify video errors for free). Returns:
  - `getUploadTarget(applicationId)` → `post<VideoUploadTarget>("/interview/${id}/video/upload-url")`.
  - `submitTurn(applicationId, objectKey)` →
    `post<VideoTurn>("/interview/${id}/video/turn", { object_key: objectKey })`.
- [ ] **Step 3 — `putClip(target, blob, onProgress, signal?)`** — a standalone exported fn (NOT
  `authedFetch`: the presigned PUT carries its **own** auth in the signed URL — attaching the bearer
  would break the S3/MinIO signature). Use `XMLHttpRequest` so `xhr.upload.onprogress` can drive the
  `Progress` bar (this is the one reason not to use `fetch`); replay `target.headers` **verbatim**
  (the `Content-Type` was signed in — a mismatch is rejected); resolve on `2xx`, else reject with
  `new HttpError(xhr.status, "Upload failed (${xhr.status})")`; support `xhr.abort()` via an
  `AbortSignal` (so an unmount/retake cancels an in-flight PUT). Validate `blob.size > 0` before send.
- [ ] **Step 4 — wire** in `apps/candidate/lib/auth.tsx`:
  `export const video = makeVideoClient(AIAGENTS_URL, store);` (beside `interview`). Re-export
  `makeVideoClient`, `putClip`, and the three types from `packages/shared/src/index.ts`.
- [ ] **Step 5 — typecheck:** `npx pnpm@9.15.0 --filter @ip/shared typecheck` green
  (`@ip/api-client` untouched but verified by the Task F4 batch).

### Task F2 — `VideoRecorder` component (MediaRecorder: record → preview → retake → upload → turn)
**Files:** Create `frontend/apps/candidate/components/video-recorder.tsx` (`"use client"`).
**Contract (props):**
```ts
interface VideoRecorderProps {
  question: string;                                  // current question (rendered above the recorder)
  applicationId: string;
  maxClipSeconds: number;                            // from page config (server cap mirror)
  maxRetakes: number;                                // 0 = unlimited; else bounded retakes
  onAnswered: (turn: { done: boolean; question: string }) => void;  // drives the page's per-turn loop
  onFatal: (err: unknown) => void;                   // page maps 409/410 → ended, else inline error
  onFallbackToText: () => void;                      // device/permission/503 → page switches to text
}
```
**Local state machine** (`type RecorderState = "idle" | "recording" | "recorded" | "uploading"
| "submitting" | "error"`), plus:
- `streamRef: MutableRefObject<MediaStream | null>` — the live `getUserMedia` stream (released on
  unmount + on `done`).
- `recorderRef: MutableRefObject<MediaRecorder | null>`, `chunksRef: MutableRefObject<Blob[]>` —
  accumulate `ondataavailable` chunks; assemble the clip Blob on `onstop`.
- `clipRef: MutableRefObject<Blob | null>` + `previewUrl: string | null` (an `URL.createObjectURL`
  for the `<video controls>` playback; **revoke** the old URL on retake/unmount to avoid leaks).
- `progress: number` (0..1, fed to `<Progress value={progress * 100} />`), `retakes: number`,
  `elapsed: number` (seconds; a `setInterval` ticks during `recording`).
- `inFlight = useRef(false)` — the **same synchronous latch** the page uses, guarding submit against
  a StrictMode double-invoke and a double-click the `busy` state (stale closure) can't.
- [ ] **Step 1 — stream acquisition + StrictMode guard:** on mount, `getUserMedia({ video: true,
  audio: true })` → assign to a muted `<video autoPlay playsInline muted>` live preview; store in
  `streamRef`. Guard React 19 StrictMode double-mount with a `startedRef` so two effect invocations
  don't open two streams. On `NotAllowedError`/`NotFoundError`/no-`mediaDevices` → call
  `onFallbackToText()` (no dead end). **Cleanup/`finally`:** `recorder.stop()` if active,
  `streamRef.current?.getTracks().forEach(t => t.stop())`, revoke `previewUrl`, clear the timer.
  **Non-surveillance invariant (do NOT add frame analysis):** the video stream is used **only** for
  the candidate's own live preview and to package the clip Blob for upload — **no** `<canvas>`
  per-frame sampling, **no** face/landmark/affect/attention detection, **no** frame upload. Audio is
  the only signal transcribed (server-side). This is guarded by `test_video_answer_no_frame_processing`
  (Task 8); keep the component free of any image-analysis dependency.
- [ ] **Step 2 — record/stop:** pick the recorder mime by feature-probe —
  `MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")` else `"video/webm"` else, if none,
  `onFallbackToText()` (covers Safari offering no supported recorder mime — matches the Risks note).
  Record → `new MediaRecorder(stream, { mimeType })`, push chunks; **auto-stop at `maxClipSeconds`**
  (the elapsed timer) to bound STT latency + storage; Stop → assemble
  `new Blob(chunksRef.current, { type: mimeType })`, set `clipRef` + `previewUrl`, state →
  `"recorded"`.
- [ ] **Step 3 — preview + retake:** in `"recorded"`, show the `<video controls src={previewUrl}>`
  playback with **Re-record** (revoke old URL, reset chunks, `retakes++`, back to `"recording"` —
  disabled once `maxRetakes` reached, with a `Badge` showing `retakes left`) and **Submit answer**.
- [ ] **Step 4 — upload + turn (the per-turn bridge), via two TanStack mutations** (page passes
  `QueryClientProvider` already; reuse `useMutation`, the `app/profile/page.tsx` shape):
  - `uploadMutation`: `getUploadTarget(applicationId)` → `putClip(target, clip, setFractionProgress,
    abortController.signal)`; state `"uploading"`, `Progress` visible; on success keep `objectKey`.
  - `turnMutation`: `submitTurn(applicationId, objectKey)`; state `"submitting"` (a `Spinner` +
    "Transcribing your answer…", since STT runs server-side in this call); on success
    `onAnswered(turn)`; the page advances `current`/`done`.
  - Guard the whole submit with `inFlight`; on **error**, set state `"error"` but **preserve the
    take** (`clipRef`/`previewUrl` intact) so inline **Retry** re-runs upload→turn **without
    re-recording** (mirrors the page keeping the textarea answer on failure). Map a fatal
    `409/410` via `onFatal` (page → `ended`); a **transient STT error** (the server's retryable code,
    §Task 6) → inline **Retry** keeping the take (distinct from an empty-answer success, below).
- [ ] **Step 4b — empty-answer UX (resolves "empty-answer UX: re-prompt once, then advance"):** a
  `video/turn` that **succeeds** but returns the turn with an **empty answer** (Whisper heard no
  speech) is **not** an error — show a one-time `Alert tone="info"` *"We couldn't hear an answer in that
  clip. Re-record, or continue to the next question."* with **Re-record** and **Continue**. Track a
  `repromptedRef` so the re-prompt shows **once per question**: if the candidate Continues, or the
  *next* take is also empty, record the empty answer and **advance** via `onAnswered(turn)` (never
  re-ask the same question in a loop — a silent candidate is never trapped). Also: the **Submit** button
  is `disabled` until `clipRef != null` (can't submit no clip), and an explicit **"Skip this question"**
  control submits one intentional empty answer (recorded, advance). `SttError` (transient, Step 4) and
  empty-success (this step) are handled on **different branches** — never collapsed.
- [ ] **Step 5 — a11y + responsive + dark:** the live/preview `<video>` `aria-label`led + `rounded-lg
  border border-border` (dark-safe tokens, no hard-coded colors); controls in a `CardContent`
  `flex-col gap-3`; status text via `role="status" aria-live="polite"` (e.g. "Recording… 0:08 / 1:00",
  "Uploading…", "Transcribing…"); buttons get `aria-busy` while pending and are disabled during
  `uploading`/`submitting`; the recorder column is `w-full` and caps at the page's `max-w-2xl`.

### Task F3 — interview-page mode selector + device pre-check + text fallback
**Files:** Modify `frontend/apps/candidate/app/interview/[applicationId]/page.tsx`. **Preserve every
existing behavior** (consent + proctor-consent gate and their `localStorage` keys, `beforeunload`,
`startProctoring`, the `inFlight` latch, terminal `ended` on 409/410, the visible error + Retry, the
`role="log"` transcript, and the existing **text** path). Additive only.
- [ ] **Step 1 — mode state + selector:** add `type Mode = "text" | "voice" | "video"` and
  `const [mode, setMode] = useState<Mode>("text")` (default **text** — the regression baseline).
  On the **intro** card, render a `RadioGroup` (from `@ip/ui`) of the modes — **voice** is owned by
  the voice plan, so render it `disabled` with a `Badge tone="muted">Coming soon</Badge>` here (no
  voice code in this plan). Persist the choice under a new key `interview-mode:${applicationId}`
  beside the existing consent keys, so a refresh on intro keeps the selection.
- [ ] **Step 2 — device pre-check (video only), gating the Start button:** add
  `const [precheck, setPrecheck] = useState<"idle"|"checking"|"ok"|"unsupported">("idle")`. When
  `mode === "video"` and the candidate proceeds, run a probe: feature-test
  `navigator.mediaDevices?.getUserMedia` **and** `window.MediaRecorder` + a supported mime; do a
  **brief `getUserMedia({video,audio})` permission probe then immediately stop its tracks** (so we
  surface the OS permission prompt up front, not mid-question). On any failure
  (`NotAllowedError`/`NotFoundError`/unsupported) → `setMode("text")` + a `toast`/`Alert`
  ("Camera/mic unavailable — continuing as a text interview."), i.e. **fall back to the existing text
  interview** (no dead end). Show a permission-explainer `Alert tone="info"` for the video mode in
  intro before the probe.
- [ ] **Step 3 — render path by mode in `phase === "active"`:**
  - `mode === "text"` → the **existing** `Textarea` + Send card, **unchanged**.
  - `mode === "video"` → render `<VideoRecorder question={current} applicationId=… maxClipSeconds=…
    maxRetakes=… onAnswered={advance} onFatal={onFatal} onFallbackToText={()=>setMode("text")} />`,
    where `advance(turn)` is the **shared** per-turn handler refactored out of `send()` (append
    `{question: current, answer: turn /* transcript not shown raw */}` to `turns`, set `current`/
    `done`/`phase` exactly as today) — so video and text drive **one** loop + **one** finalize.
  - Keep the transcript `role="log" aria-live="polite"` list as-is (it shows the per-turn Q + the
    candidate's answer; for video the "answer" line reads the returned transcript when present, else
    a "Recorded answer" placeholder — the scored artifact is the transcript, unchanged).
- [ ] **Step 4 — config caps + 503 fallback:** read `maxClipSeconds`/`maxRetakes`/`maxClipBytes` from
  `NEXT_PUBLIC_*` envs with sane defaults (e.g. 60s / 2 / 25 MB) — mirrors the server
  `video_max_clip_seconds`/`video_max_retakes`/`video_max_clip_bytes` caps; pass to `VideoRecorder`
  (the client `blob.size` fast-fail is UX; the **size-capped presign** is the real boundary, §Task 4).
  A **`503` from `upload-url`** inside the recorder calls `onFallbackToText()` → page switches to text
  mid-session (no dead end), matching the design's storage-unconfigured fallback.
- [ ] **Step 5 — keep the guards:** the `beforeunload` handler stays bound for `phase === "active"`
  regardless of mode (a half-recorded video is as unresumable as a half-typed answer); consent +
  proctor-consent still gate Start for all modes.

### Task F4 — verify builds + typechecks
- [ ] **Step 1 — candidate build:** `npx pnpm@9.15.0 --filter @ip/candidate build` green. **Never run
  `next build` while `pnpm dev` is live** (per Global constraints).
- [ ] **Step 2 — package typechecks:** `npx pnpm@9.15.0 --filter @ip/{ui,shared,api-client} typecheck`
  green (the new `video.ts` types + the `lib/auth.tsx` wiring + the page changes all type-clean).
- [ ] **Step 3 — lint/format** the touched FE files via the repo's FE gate (the same one
  `--filter @ip/candidate` uses); no `next build` overlap with a live dev server.

---

## TIER E — E2E + finalize

### Task 9 — E2E + finalize
- [ ] **Step 1 — manual E2E (Chrome via preview):** start an interview → pick **video** → record an
  answer per question, upload, see the next question; on the last, the report **scores via the
  unchanged path** (transcript identical). Confirm a `video_answers` row + clip per answer in
  MinIO. Mic/cam-denied → **text fallback**. No console errors.
- [ ] **Step 2 — regression:** the **text interview (`/turn`) still works** (its tests untouched +
  green); voice is untouched.
- [ ] **Step 3 — full gate** `bash scripts/check.sh` green (grown from 423); both FE builds/typechecks
  green; update `HANDOFF.md` + memory.

---

## Resolved gaps (completeness audit 2026-06-19)
Closes the **Inc 6 — Async Video Interview** row of `2026-06-19-v2-completeness-audit.md` (Part B 🟠).
Each gap is implemented by the task noted; the design rationale is in the sibling design doc's
**Resolved gaps** section.

| # | Gap (audit) | Implemented by | Test(s) |
|---|---|---|---|
| 1 | **Airtight `object_key` ownership** (+ test) | Task 5 Step 3 (server-derived prefix gate **before** `get_raw`); Task 6 Step 3 (endpoint 403 map) | `test_video_turn_rejects_cross_application_object_key` (same-tenant **other app** + **other tenant** → 403, zero `get_raw`) |
| 2 | **Codec enforcement** (Safari AAC vs Chrome Opus) | Task 3 Step 1b (`clip_decode` decodes WebM/Opus **and** MP4/AAC; unsupported codec / no-audio → `SttError`); Task F2 Step 2 (`isTypeSupported` + text fallback) | `test_clip_decode.py`: WebM/Opus **and** MP4/AAC fixtures → PCM16/16k; no-audio + unsupported-codec → `SttError` |
| 3 | **STT error vs empty** differentiation | Task 5 Step 3b (`SttError` ⇒ retryable, do **not** advance; `""` ⇒ empty answer, advance); Task 6 Step 3 (retryable map, never 200-empty); Task F2 Step 4/4b (Retry vs re-prompt) | `test_video_session.py`: empty `""` advances; **`SttError` does not advance / writes nothing** |
| 4 | **Presigned size limit** | Task 4 Step 4 (`max_bytes` → `content-length-range` on the presign); Task 6 Step 3 (pass `video_max_clip_bytes`); Task F3 Step 4 (client fast-fail) | `test_storage.py` (size condition present/clamped); endpoint test (upload-url carries the cap) |
| 5 | **Clip retention / erasure** | Task 7 Step 3 (erasure `delete_raw` each clip — mandatory, age-independent); Task 7 Step 3b (optional `video_clip_retention_days` lifecycle on raw video; transcript retained) | `test_resources_compliance.py` (rows + clips purged on erase; best-effort clip delete) |
| 6 | **`test_no_frame_processing`** guard | Task 8 (audio-only path asserted; no vision import; opaque clip storage); Task F2 Step 1 (FE invariant — no `<canvas>`/face analysis) | `test_video_answer_no_frame_processing` |
| 7 | **Empty-answer UX** | Task F2 Step 4b (one-time re-prompt → Re-record/Continue, then advance; Submit disabled w/o clip; explicit Skip); never loops a silent candidate | covered by F-tier build/typecheck + manual E2E (mic-muted clip → re-prompt → advance) |

**Net:** all seven Inc-6 🟠 audit items are resolved with concrete checks + named tests; the baseline
**423**-test gate grows (no test is removed). The brain, text `/turn`, evaluator, scoring, and voice
remain untouched — the resolutions live entirely in the new video plane, storage presign, erasure
cascade, and the candidate FE.

## Verification (end-to-end)
1. **Per backend task:** `bash scripts/check.sh` GREEN (baseline **423**, grows per task). New heavy
   code (PyAV decode, Groq, S3) is excluded from unit tests by living behind injected seams (`SttEngine`,
   storage) with fakes.
2. **Seam correctness (offline):** `test_video_transport.py` proves `ask()` returns the clip's
   transcript and `""` on no-clip / `SttError` — the brain drives it identically to `VoiceTransport`.
3. **Loop correctness (offline):** `test_video_session.py` proves N turns append `TranscriptTurn`s,
   write `video_answers` rows, and finalize + emit `interview.completed` **exactly once** — reusing
   `interview_host._finalize` (not duplicated).
4. **Auth/tenancy (airtight `object_key`):** `test_video_session.py` +
   `test_video_endpoints.py` prove owner-only + **forged cross-application `object_key`** rejection
   (same-tenant other-app **and** cross-tenant → 403, **zero `get_raw`**) + 401/403/404/503; keys are
   `{comp_id}/video-answers/{application_id}/`-prefixed and the prefix is **session-derived**.
5. **Storage (size cap):** `test_storage.py` proves `presigned_put_url` is tenant-prefixed +
   TTL-clamped **and** carries the `content-length-range` size cap when `max_bytes` is set; an endpoint
   test proves `upload-url` embeds it.
6. **Codec (STT always gets a decodable container):** `test_clip_decode.py` proves WebM/Opus **and**
   MP4/AAC fixtures decode to PCM16/16k, and no-audio / unsupported-codec → `SttError`.
7. **STT error vs empty:** `test_video_session.py` proves empty `""` records an empty answer + advances,
   while **`SttError` is retryable** (does not advance, writes nothing) — never conflated.
8. **No frame processing:** `test_video_answer_no_frame_processing` proves the pipeline transcribes
   **audio only**, imports no vision/face library, and stores the clip opaquely (no frame-derived
   fields) — the non-surveillance thesis is test-enforced.
9. **Erasure + retention (Inc 0):** `test_resources_compliance.py` proves `video_answers` rows + their
   clips are purged on `erase` (best-effort clip delete); the optional `video_clip_retention_days`
   lifecycle bounds raw-video growth (transcript retained).
10. **Media + empty-answer E2E (manual, Chrome):** recorded-answer interview completes; the persisted
    transcript scores via the unchanged path; an empty/silent clip → **one re-prompt → advance**;
    cam/mic-denied → text fallback.
11. **Regression:** the text interview and the evaluator/scoring tests are untouched + green; voice is
    untouched.

## Risks / re-verify at execution
- **`MediaRecorder` mime across browsers:** pin `video/webm;codecs=vp8,opus` (Chrome) and confirm the
  PyAV decode covers it; if a browser offers no supported recorder mime, fall back to text.
- **PyAV codec availability in the gate image:** if the webm/Opus decode is too heavy/unavailable for
  the gate, gate the real-decode test behind a marker and test the framing math with a fake decoder
  (the live decode is still exercised in the manual E2E).
- **Groq Whisper is chunk-per-clip** (no streaming) — latency = clip length + 1 RTT; keep clips short
  via the `video_max_clip_seconds` cap. Free-tier limits (2k audio req/day) are ample for testing.
- **Presigned PUT content-type:** the browser PUT must send the same `Content-Type` the URL was
  signed with, or S3/MinIO rejects it — pin it in `video.ts` and the endpoint.
- **Large clips skip the API** (client → object store via presigned PUT); keep ai-agents off the
  large-payload path. **Validate clip size at the storage boundary** via the size-capped presign
  (`content-length-range`), not by buffering through the API — an oversized PUT must be rejected by
  S3/MinIO so it never lands.
- **Cross-browser codec at decode:** Safari emits **MP4/AAC**, Chrome **WebM/Opus** — confirm the
  vendored PyAV/ffmpeg build decodes **both** (fixtures for each); an undecodable container must raise
  `SttError`, never reach `transcribe`. The FE `isTypeSupported` probe + text fallback is the front
  guard so the server path is defense-in-depth.
- **STT error vs empty must not be conflated:** a failed read (`SttError`, retryable) must **not**
  silently become an empty answer (which would discard a real one) — re-verify `submit_video_turn`
  keeps the two branches distinct under retry.
