# Task 9 — voice-worker service + compose (integration)

**Date:** 2026-06-19  
**Gate:** `bash scripts/check.sh` GREEN — **499 tests** (was 477; +22 new)

---

## Trigger design

**LiveKit room webhook** — the worker runs a FastAPI HTTP server (port 8090) exposing
`POST /livekit/webhook`.  LiveKit is configured (`docker/livekit.yaml`) to POST
all room events to `http://voice-worker:8090/livekit/webhook` signed with the API key.

On every incoming event the raw body is validated with `livekit.api.WebhookReceiver`
(HMAC-SHA256).  If validation fails a 400 is returned immediately.

The decision of whether to start a session is delegated to the pure function
`should_start_session(event_type, room_name, participant_identity, worker_prefix, in_flight) -> str | None`.
It returns the `application_id` to start, or `None` to skip:

| Condition | Decision |
|---|---|
| `event_type != "participant_joined"` | skip |
| room does not match `^interview-(.+)$` | skip |
| identity starts with `worker_identity_prefix` (default `"agent-"`) | skip — worker joined its own room |
| `application_id` already in `in_flight` set | skip — guard against double-spawn |
| otherwise | return `application_id` |

When a session should start, the `application_id` is added to `in_flight` and an
`asyncio.ensure_future` task is spawned for `_run_session(...)`.  The task removes
itself from `in_flight` in its `finally` block regardless of outcome.

---

## Files changed/created

### New
- `src/ai-agents/app/service/__init__.py` — package marker
- `src/ai-agents/app/service/voice_worker.py` — main entrypoint + decision logic + webhook server + per-room session runner
- `src/ai-agents/tests/test_voice_worker.py` — 22 unit tests for `should_start_session`

### Modified
- `src/ai-agents/app/config.py` — added `voice_worker_http_port: int = 8090` and `voice_worker_identity_prefix: str = "agent-"`
- `docker-compose.yml` — added `voice-worker` service (builds from `ai-agents` image, `command: python -m app.service.voice_worker`, env with `LIVEKIT_*` + `GROQ_API_KEY`, `depends_on: livekit/redis/rabbitmq/mcp-data`)
- `docker/livekit.yaml` — added `webhook:` section pointing at `http://voice-worker:8090/livekit/webhook`

### Dockerfile
No changes needed.  The `voice-worker` service in compose uses `SERVICE: ai-agents`
(same image) with a `command:` override to `python -m app.service.voice_worker`.
This is the correct pattern — the `ai-agents` package already contains the new
`app.service.voice_worker` module.

---

## Config additions

```python
voice_worker_http_port: int = 8090  # env: VOICE_WORKER_HTTP_PORT
voice_worker_identity_prefix: str = "agent-"  # prefix for worker participant identity
```

Existing fields used (already present from Tasks 1–2): `livekit_url`, `livekit_api_key`,
`livekit_api_secret`, `groq_api_key`, `voice_rtc_token_ttl_seconds`.

---

## Decision logic tests

**File:** `src/ai-agents/tests/test_voice_worker.py`  
**Count:** 22 tests, all passing

Test names:
- `test_participant_joined_candidate_returns_application_id`
- `test_complex_application_id_with_hyphens`
- `test_application_id_with_digits_only`
- `test_non_participant_joined_event_returns_none[participant_left]`
- `test_non_participant_joined_event_returns_none[room_started]`
- `test_non_participant_joined_event_returns_none[room_finished]`
- `test_non_participant_joined_event_returns_none[track_published]`
- `test_non_participant_joined_event_returns_none[]`
- `test_non_participant_joined_event_returns_none[PARTICIPANT_JOINED]`
- `test_non_interview_room_returns_none[lobby]`
- `test_non_interview_room_returns_none[test-room]`
- `test_non_interview_room_returns_none[Interview-app123]`
- `test_non_interview_room_returns_none[interview_app123]`
- `test_non_interview_room_returns_none[]`
- `test_non_interview_room_returns_none[interview-]`
- `test_worker_identity_returns_none`
- `test_worker_prefix_match_is_startswith`
- `test_custom_worker_prefix`
- `test_candidate_identity_not_matching_prefix_is_allowed`
- `test_already_in_flight_returns_none`
- `test_different_room_in_flight_does_not_block`
- `test_in_flight_set_is_not_mutated_by_should_start`

---

## Gate summary

```
bash scripts/check.sh → GATE PASSED
499 tests (lib 51 + admin 204 + ai-agents 189 + mcp-data 24 + mcp-capability 31)
+22 tests vs baseline of 477
```

---

## Live E2E verification steps

These steps verify the full spoken interview in a browser.  Run them after
`docker compose up --build`.

### Prerequisites
1. Set real values in `.env`:
   ```
   GROQ_API_KEY=<your key>
   LIVEKIT_API_KEY=devkey
   LIVEKIT_API_SECRET=devsecret_change_me_min_32_chars_long
   GEMINI_API_KEY=<your key>
   ```
2. Start the stack: `docker compose up --build -d`
3. Confirm all services healthy:
   ```bash
   docker compose ps
   docker compose logs -f voice-worker   # should show "webhook listening on 0.0.0.0:8090"
   ```

### Browser test
1. Open the candidate app (e.g. `http://localhost:3000`).
2. Log in as a candidate and navigate to a job with a started interview setup.
3. Call `POST /interview/{application_id}/rtc-token` (or click Join in the voice UI)
   to get a LiveKit token.
4. Click **Join** in the voice room component — grant microphone access when prompted.
5. **Observe:**
   - `docker compose logs -f voice-worker` shows:
     - `webhook event=participant_joined room=interview-{id} participant={user_id}`
     - `voice_worker: session task spawned application_id={id}`
     - `voice_worker: starting session application_id={id} worker_identity=agent-{id}`
   - The agent **speaks the first interview question** in your browser (you hear audio).
   - Captions appear in the UI (interviewer side).
6. **Answer aloud** — speak a clear sentence.
7. **Observe:**
   - The agent transcribes your answer (Groq STT) and speaks the next question.
   - Your caption appears in the UI.
8. Complete all questions (or wait for budget exhaustion).
9. **Confirm completion:**
   - `docker compose logs -f voice-worker` shows `session completed application_id=...`
   - The interview report is accessible via the admin UI (scoring ran on the unchanged path).
   - `interview.completed` was published (check RabbitMQ management at `localhost:15672`).

### Mid-interview reconnect test
1. During an interview, run: `docker compose restart livekit`
2. The candidate browser should show a reconnecting banner.
3. After LiveKit restarts, the candidate rejoins.
4. The voice-worker receives a new `participant_joined` webhook and resumes from the
   Redis checkpoint (the same session, same transcript so far).

### Mic-denied fallback test
1. Click Join but deny microphone access.
2. The voice-room component should fall back to the existing text interview path
   (Task 10, not yet implemented — the page reloads to text mode).
3. The text interview (`/interview/{id}/turn`) still works; confirm via the existing
   integration tests: `(cd src/ai-agents && ../../.venv/bin/python -m pytest tests/test_interview_api.py -v)`.

### Tail logs
```bash
docker compose logs -f voice-worker ai-agents livekit
```
