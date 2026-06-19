# Voice Interview — Tier A Implementation Report

**Date:** 2026-06-19
**Scope:** Task 1 (LiveKit docker-compose) + Task 2 (RTC join-token endpoint, TDD)

---

## Files Created

| Path | Purpose |
|---|---|
| `/Users/rugwedpatharkar/Projects/Project/docker/livekit.yaml` | LiveKit dev config (7880/7881 + UDP 50000-50100, `use_external_ip: false`, devkey) |
| `/Users/rugwedpatharkar/Projects/Project/src/ai-agents/app/resources/voice/__init__.py` | Python package marker for `resources.voice` |
| `/Users/rugwedpatharkar/Projects/Project/src/ai-agents/app/resources/voice/rtc_token.py` | `mint_join_token(room, identity, *, api_key, api_secret, ttl_seconds) -> str` |
| `/Users/rugwedpatharkar/Projects/Project/src/ai-agents/tests/test_rtc_token.py` | 11 tests: 3 minter + 8 endpoint (401/403/404/503/200/room-name/parametrized) |
| `/Users/rugwedpatharkar/Projects/Project/docs/superpowers/specs/voice-tierA-report.md` | This report |

## Files Modified

| Path | Change |
|---|---|
| `/Users/rugwedpatharkar/Projects/Project/docker-compose.yml` | Added `livekit` service (image v1.9, ports 7880/7881/50000-50100/udp, healthcheck) |
| `/Users/rugwedpatharkar/Projects/Project/.env.example` | Added `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `GROQ_API_KEY` |
| `/Users/rugwedpatharkar/Projects/Project/src/ai-agents/app/config.py` | Added `livekit_url`, `livekit_api_key`, `livekit_api_secret`, `groq_api_key`, `voice_rtc_token_ttl_seconds` |
| `/Users/rugwedpatharkar/Projects/Project/src/ai-agents/app/routes/interview_api.py` | Added `POST /interview/{application_id}/rtc-token` endpoint + `mint_join_token` import |
| `/Users/rugwedpatharkar/Projects/Project/src/ai-agents/app/main.py` | Added `"settings": s` to the `create_app({...})` deps dict |
| `/Users/rugwedpatharkar/Projects/Project/src/ai-agents/pyproject.toml` | Added `livekit-api>=1.1.0` to dependencies |

---

## livekit-api version + API deviation

- **Version installed:** `livekit-api==1.1.0` (exact pin from spec; `livekit-protocol==1.1.17` pulled as dep)
- **API deviation:** None. The spec's exact API shape works verbatim:
  ```python
  api.AccessToken(api_key, api_secret)
      .with_identity(identity)
      .with_ttl(timedelta(seconds=ttl_seconds))
      .with_grants(api.VideoGrants(room_join=True, room=room,
                                   can_publish=True, can_subscribe=True,
                                   can_publish_data=True))
      .to_jwt()
  ```
  JWT claims use camelCase keys (`roomJoin`, `canPublish`, `canSubscribe`, `canPublishData`) matching PyJWT decode expectations in the test.

---

## Test names + counts

### test_rtc_token.py (11 tests, all pass)

**Token minter (3):**
- `test_mint_token_is_room_scoped_and_decodable` — JWT room/roomJoin/sub claims correct
- `test_mint_token_encodes_all_grants` — canPublish/canSubscribe/canPublishData all True
- `test_mint_token_uses_caller_identity` — sub == identity param

**Endpoint (8):**
- `test_rtc_token_requires_auth` — 401 with no bearer
- `test_rtc_token_404_when_no_session` — 404 when session absent
- `test_rtc_token_403_when_wrong_user` — 403 when caller != owner
- `test_rtc_token_503_when_keys_unset` — 503 when livekit_api_key/secret blank; secret not in response
- `test_rtc_token_200_returns_url_token_room` — 200 with {url, token, room}; token decodable + room-scoped
- `test_rtc_token_room_name_includes_application_id` — room id derivation sanity check
- `test_rtc_token_room_derived_from_path_parameter[abc123]` — room = `interview-abc123`
- `test_rtc_token_room_derived_from_path_parameter[def456]` — room = `interview-def456`

---

## Final gate result

```
==> GATE PASSED
```

Test totals: 51 (lib) + 204 (admin) + **128** (ai-agents, was 117) + 24 (mcp-data) + 31 (mcp-capability) = **438 total** (baseline was 423; +15 new tests).

ruff format/lint: all passed.
pip-audit: no CVEs (lib not on PyPI — expected skip).

---

## Concerns / notes

- **Docker stack not started** per spec (controller verifies LiveKit boots separately). The compose YAML + livekit.yaml are authored correctly per spec verbatim.
- **`fake_sessions_factory` param** in `_client()` is unused (dead parameter). It was left in for clarity during authoring but has no effect; could be removed in a follow-up simplification pass. It does not affect test behaviour or gate.
- **`test_rtc_token_room_name_includes_application_id`** uses `assert resp.status_code == 200 or resp.status_code == 404` because the inline `_Sessions` class returns a session keyed to `"a1"` unconditionally — the route asks for `"xyz789"` but the fake still returns it. This is a no-op sanity check; the parametrized test below it is the authoritative coverage. Safe to leave as-is.
- The existing `test_interview_api.py` tests pass without modification — the `"settings"` key is now present in `main.py`'s real deps but the test's `_deps()` helper doesn't include it, and no existing endpoint reads it, so there is no breakage.

---

## Fix pass (2026-06-19)

Three review findings resolved.

### Finding 1 — Dead test assertion (Important)

**File:** `src/ai-agents/tests/test_rtc_token.py`

Deleted `test_rtc_token_room_name_includes_application_id` entirely. Its `assert resp.status_code == 200 or resp.status_code == 404` could never fail and was redundant with the already-present parametrized test `test_rtc_token_room_derived_from_path_parameter`, which correctly decodes the JWT and asserts `claims["video"]["room"] == f"interview-{app_id}"`. The parametrized test needed no strengthening — the assertion was already sound.

### Finding 2 — Unused parameter (Minor)

**File:** `src/ai-agents/tests/test_rtc_token.py`

Removed `fake_sessions_factory=None` from the `_client()` signature. The parameter was never read in the body and no call site passed it. No call-site changes required.

### Finding 3 — Wrap token minting in endpoint (Minor → Robustness)

**File:** `src/ai-agents/app/routes/interview_api.py`

Wrapped the `mint_join_token(...)` call in a `try/except Exception` block. On failure, logs via the module's existing `log` (bound to `component="route.interview_api"`) using `log.exception(...)` (logs `application_id`, never the token or secret), then raises `HTTPException(status_code=503, detail="voice interview not configured")`. The `HTTPException` raised earlier (404/403 before the mint) is not caught — only the mint call itself is wrapped.

### Test command + result

```
(cd src/ai-agents && ../../.venv/bin/python -m pytest tests/test_rtc_token.py -v)
```

```
10 passed, 1 warning in 0.48s
```

(11 tests before fix pass, now 10 — the dead test was removed.)

### Gate result

```
==> GATE PASSED
```

Totals: 51 (lib) + 204 (admin) + 127 (ai-agents) + 24 (mcp-data) + 31 (mcp-capability) = 437 total. ruff format/lint: all passed. pip-audit: no CVEs.
