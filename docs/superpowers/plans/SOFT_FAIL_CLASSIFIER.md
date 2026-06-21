# Soft-Fail Classifier — BE Python except clauses

Every `except` block in `src/` and `lib/` (non-test, non-protobuf-generated) classified as:

- **boundary** — the central gRPC-web translator (`lib/lib/grpcweb.py`) handles it at the egress edge; business logic never sees it.
- **hard-fail** — correctness-critical; the caller must see the error (raises, aborts, or re-raises as domain error).
- **soft-fail-by-design** — best-effort operation (telemetry, checkpoint, session cleanup, notification fan-out). Logged; failure doesn't block the main flow.
- **TBD** — intent not obvious from the call-site; flagged for review.

Total catches audited: **252** (from grep). Broken down by type below.

---

## Summary counts

| Category | Count |
|---|---|
| **boundary** (grpcweb translator + domain-error re-raise in routes) | ~92 |
| **hard-fail** (raises / aborts on error) | ~68 |
| **soft-fail-by-design** (logged best-effort) | ~72 |
| **TBD** (review needed) | ~20 |

---

## lib/ — shared libraries

| File | Line | Exception | Category | Notes |
|---|---|---|---|---|
| `lib/lib/grpcweb.py` | 152 | `ValueError` | boundary | Header parse; aborts with 400 — egress translator. |
| `lib/lib/grpcweb.py` | 214 | `_FrameError` | boundary | Malformed frame; translator converts to INTERNAL. |
| `lib/lib/grpcweb.py` | 234 | `_Abort` | boundary | Controlled abort path — translator converts to gRPC status. |
| `lib/lib/grpcweb.py` | 236 | `TimeoutError` | boundary | Converts to DEADLINE_EXCEEDED at the egress edge. |
| `lib/lib/grpcweb.py` | 239 | `Exception` | boundary | Final fallback in translator — logs + INTERNAL. |
| `lib/lib/grpcweb.py` | 345 | `_Abort` | boundary | Streaming abort path. |
| `lib/lib/grpcweb.py` | 347 | `TimeoutError` | boundary | Streaming DEADLINE_EXCEEDED. |
| `lib/lib/grpcweb.py` | 350 | `Exception` | boundary | Streaming final fallback — logs + INTERNAL. |
| `lib/lib/audit.py` | 26 | `Exception` | soft-fail-by-design | Audit-write failure must not block the RPC that triggered it; logged at ERROR. |
| `lib/lib/audit.py` | 62 | `DependencyError` | soft-fail-by-design | Audit replay on DB reconnect; if replay fails, log + skip. |
| `lib/lib/logging.py` | 124 | `Exception` | soft-fail-by-design | Structured-log serialization; fallback to plain text. Telemetry must not crash the app. |
| `lib/lib/logging.py` | 139 | `Exception` | soft-fail-by-design | Log handler flush; swallowed to avoid recursion. |
| `lib/lib/logging.py` | 163 | `Exception` | soft-fail-by-design | Root log-context teardown; must not crash the RPC. |
| `lib/lib/resilience.py` | 44 | `TimeoutError` | hard-fail | Translates to `OperationTimeout` — re-raised to caller. |
| `lib/lib/resilience.py` | 81 | `retry_on` | hard-fail | Retry decorator: catches the retryable exception, re-raises after max attempts. |
| `lib/lib/execution/runner.py` | 137 | `TimeoutError` | hard-fail | Subprocess timeout; re-raised as `OperationTimeout`. |
| `lib/lib/mongodb/client.py` | 35 | `Exception` | soft-fail-by-design | Connection-pool setup failure logged at startup; service raises later on first real query. |
| `lib/lib/mongodb/repository.py` | 22 | `(InvalidId, TypeError)` | hard-fail | Invalid ObjectId — raises `NotFoundError` to caller. |
| `lib/lib/security/sessions.py` | 100 | `Exception` | soft-fail-by-design | Redis session-write on best-effort checkpoint; logged. |
| `lib/lib/security/sessions.py` | 131 | `Exception` | soft-fail-by-design | Redis session-delete on logout; soft because session expiry is the safety net. |
| `lib/lib/security/sessions.py` | 144 | `Exception` | soft-fail-by-design | Redis jti-revoke on token refresh; logged; auth falls back to DB check. |
| `lib/lib/security/tokens.py` | 121 | `JWTError` | hard-fail | Token decode failure → raises `InvalidTokenError`. |
| `lib/lib/cursors.py` | 34 | `(ValueError, UnicodeEncodeError)` | hard-fail | Cursor encode failure → raises `ValueError` to caller. |
| `lib/lib/cursors.py` | 38 | `(InvalidId, ValueError, TypeError)` | hard-fail | Cursor decode failure → raises `ValueError`. |
| `lib/lib/rabbitmq/publisher.py` | 76 | `Exception` | soft-fail-by-design | Publish failure after retries; logged. Caller does not re-raise (fire-and-forget events). |
| `lib/lib/rabbitmq/consumer.py` | 111 | `Exception` | soft-fail-by-design | Message handler exception; logged + NACK; message routed to DLX. |
| `lib/lib/storage/client.py` | 72 | `Exception` | soft-fail-by-design | S3 bucket-create at startup; logged. Service degrades (no uploads) but starts. |
| `lib/lib/storage/client.py` | 114, 128, 146, 170, 194, 227, 242, 256 | `(ClientError, BotoCoreError, OperationTimeout)` | hard-fail | Each S3 method: raises `StorageError` to caller. 8 rows, identical pattern. |
| `lib/lib/schemas/permissions.py` | 44 | `ValueError` | hard-fail | Permission-string parse failure → raises `ValidationError`. |

---

## src/admin/ — admin gRPC service

### Routes (boundary layer)

All `except AuthDomainError as exc:` catches in route files are **boundary** — they call `context.abort(to_grpc_status(exc), ...)` which is the central translator path. There are ~92 of these across all route files. Spot-check sample below; remaining are the same pattern.

| File | Lines | Exception | Category |
|---|---|---|---|
| `src/admin/app/routes/auth.py` | 178, 197, 211, 240, 269, 301, 335, 364, 383 | `AuthDomainError` | boundary |
| `src/admin/app/routes/auth.py` | 98 | `InvalidTokenError` | boundary — abort UNAUTHENTICATED |
| `src/admin/app/routes/auth.py` | 117 | `InvalidTokenError` | boundary — abort UNAUTHENTICATED |
| `src/admin/app/routes/oauth.py` | 147 | `RateLimitedError` | boundary — abort RESOURCE_EXHAUSTED |
| `src/admin/app/routes/oauth.py` | 149, 185 | `AuthDomainError` | boundary |
| `src/admin/app/routes/application.py` | 63, 80, 107, 132 | `AuthDomainError` | boundary |
| `src/admin/app/routes/decision.py` | 58, 83, 112, 141 | `AuthDomainError` | boundary |
| `src/admin/app/routes/scheduling.py` | 119, 143, 162, 180, 197, 212, 228 | `AuthDomainError` | boundary |
| `src/admin/app/routes/team.py` | 81, 101, 119, 135, 151, 168 | `AuthDomainError` | boundary |
| `src/admin/app/routes/messaging.py` | 92, 109, 134, 150, 173 | `AuthDomainError` | boundary |
| `src/admin/app/routes/settings.py` | 104, 136, 152, 171, 189, 205, 238 | `AuthDomainError` | boundary |
| `src/admin/app/routes/report.py` | 133, 151, 171, 195 | `AuthDomainError` | boundary |
| `src/admin/app/routes/rubric.py` | 65, 75, 94, 109 | `AuthDomainError` | boundary |
| `src/admin/app/routes/job.py` | 104, 124, 137, 147, 165, 182 | `AuthDomainError` | boundary |
| `src/admin/app/routes/coding.py` | 69, 96, 125 | `AuthDomainError` | boundary |
| `src/admin/app/routes/profile.py` | 97, 107, 147 | `AuthDomainError` | boundary |
| `src/admin/app/routes/observability.py` | 61, 85 | `AuthDomainError` | boundary |
| `src/admin/app/routes/analytics.py` | 53, 74, 104 | `AuthDomainError` | boundary |
| `src/admin/app/routes/recommendation.py` | 62, 83 | `AuthDomainError` | boundary |
| `src/admin/app/routes/preferences.py` | 56, 77 | `AuthDomainError` | boundary |
| `src/admin/app/routes/aptitude.py` | 71, 102 | `AuthDomainError` | boundary |
| `src/admin/app/routes/job_alerts.py` | 81, 103 | `AuthDomainError` | boundary |
| `src/admin/app/routes/notification.py` | 79 | `AuthDomainError` | boundary |
| `src/admin/app/routes/company_profile.py` | 106, 120 | `AuthDomainError` | boundary |
| `src/admin/app/routes/compliance.py` | 53, 77, 87 | `AuthDomainError` | boundary |
| `src/admin/app/routes/talent.py` | 53 | `AuthDomainError` | boundary |
| `src/admin/app/routes/sourcing.py` | 68 | `AuthDomainError` | boundary |
| `src/admin/app/routes/saved_jobs.py` | 53 | `AuthDomainError` | boundary |
| `src/admin/app/routes/public_api.py` | 35 | `(TypeError, ValueError)` | hard-fail — returns HTTP 400 for invalid params |

### Resources (business logic)

| File | Line | Exception | Category | Notes |
|---|---|---|---|---|
| `src/admin/app/resources/auth.py` | 40 | `PydanticValidationError` | hard-fail | Input validation → raises `ValidationError`. |
| `src/admin/app/resources/auth.py` | 76, 104 | `DuplicateKeyError` | hard-fail | Duplicate email/company → raises `ConflictError`. |
| `src/admin/app/resources/auth.py` | 122, 254, 299, 325, 502 | `JWTError` | hard-fail | Token decode → raises `InvalidTokenError`. |
| `src/admin/app/resources/auth.py` | 365 | `JWTError` | hard-fail | Token verification → raises `InvalidTokenError`. |
| `src/admin/app/resources/auth.py` | 403 | `DuplicateKeyError` | hard-fail | Duplicate OAuth account → raises `ConflictError`. |
| `src/admin/app/resources/settings.py` | 44 | `(ZoneInfoNotFoundError, ValueError)` | hard-fail | Invalid timezone → raises `ValidationError`. |
| `src/admin/app/resources/settings.py` | 216 | `PydanticValidationError` | hard-fail | Settings schema → raises `ValidationError`. |
| `src/admin/app/resources/settings.py` | 245 | `JWTError` | hard-fail | Token decode → raises `InvalidTokenError`. |
| `src/admin/app/resources/company_profile.py` | 75 | `Exception` | **TBD** | Broad catch; logged but intent unclear. Review: should this be hard-fail? |
| `src/admin/app/resources/compliance.py` | 146 | `Exception` | soft-fail-by-design | Notification fan-out per compliance event; individual failures logged, not fatal. |
| `src/admin/app/resources/compliance.py` | 174 | `Exception` | soft-fail-by-design | Per-item notification within compliance batch. |
| `src/admin/app/resources/decision.py` | 137 | `Exception` | soft-fail-by-design | Notification on decision; non-fatal. |
| `src/admin/app/resources/decision.py` | 194 | `Exception` | soft-fail-by-design | Email/notification fan-out. |
| `src/admin/app/resources/funnel.py` | 108 | `Exception` | soft-fail-by-design | Funnel-event emit; telemetry failure must not fail the main RPC. |
| `src/admin/app/resources/messaging.py` | 155 | `Exception` | soft-fail-by-design | Notification on new message; non-fatal. |
| `src/admin/app/resources/scheduler.py` | 53, 84, 122 | `Exception` | soft-fail-by-design | Background scheduler job; logged. Job retry handles re-run. |
| `src/admin/app/resources/scheduling.py` | 48 | `(TypeError, ValueError)` | hard-fail | Date parse → raises `ValidationError`. |
| `src/admin/app/resources/scheduling.py` | 79 | `Exception` | **TBD** | Broad catch in scheduling resource. Review: raises or logs? |
| `src/admin/app/resources/application.py` | 51 | `DuplicateKeyError` | hard-fail | Duplicate application → raises `ConflictError`. |
| `src/admin/app/resources/aptitude.py` | 156 | `DuplicateKeyError` | hard-fail | Duplicate aptitude submission → raises `ConflictError`. |
| `src/admin/app/resources/coding.py` | 217 | `DuplicateKeyError` | hard-fail | Duplicate coding submission → raises `ConflictError`. |
| `src/admin/app/resources/talent.py` | 31 | `(ValueError, UnicodeDecodeError, UnicodeEncodeError)` | hard-fail | Resume parse → raises `ValidationError`. |
| `src/admin/app/resources/preferences.py` | 32 | `ValueError` | hard-fail | Preference value → raises `ValidationError`. |
| `src/admin/app/resources/analytics.py` | 106 | `ValueError` | hard-fail | Date-range parse → raises `ValidationError`. |
| `src/admin/app/resources/observability.py` | 91 | `json.JSONDecodeError` | hard-fail | Client-error payload parse; raises `ValidationError`. |
| `src/admin/app/main.py` | 220 | `InvalidTransition` | hard-fail | State-machine transition → raises `ConflictError`. |
| `src/admin/app/main.py` | 228 | `NotFoundError` | hard-fail | Entity lookup → re-raises to route layer. |
| `src/admin/app/main.py` | 273 | `Exception` | soft-fail-by-design | Startup background task (exchange declare); logged; service continues. |

### Repositories (infra)

| File | Line | Exception | Category | Notes |
|---|---|---|---|---|
| `src/admin/app/infra/repositories/applications.py` | 13 | `InvalidId` | hard-fail | ObjectId parse → returns `None` (treated as not found by caller). |
| `src/admin/app/infra/repositories/notifications.py` | 14 | `InvalidId` | hard-fail | Same pattern. |
| `src/admin/app/infra/repositories/notifications.py` | 27 | `DuplicateKeyError` | hard-fail | Idempotent insert — duplicate silently absorbed (intentional). |
| `src/admin/app/infra/repositories/jobs.py` | 11 | `InvalidId` | hard-fail | ObjectId parse. |
| `src/admin/app/infra/repositories/job_alerts.py` | 11 | `InvalidId` | hard-fail | ObjectId parse. |
| `src/admin/app/infra/repositories/rubrics.py` | 11 | `InvalidId` | hard-fail | ObjectId parse. |
| `src/admin/app/infra/repositories/companies.py` | 20 | `InvalidId` | hard-fail | ObjectId parse. |
| `src/admin/app/infra/repositories/messaging.py` | 13 | `InvalidId` | hard-fail | ObjectId parse. |

---

## src/ai-agents/ — ai-agents + voice-worker

| File | Line | Exception | Category | Notes |
|---|---|---|---|---|
| `src/ai-agents/app/main.py` | 124 | `Exception` | soft-fail-by-design | Startup health-check background task; logged; service starts anyway. |
| `src/ai-agents/app/infra/sessions.py` | 75 | `Exception` | soft-fail-by-design | Redis session-checkpoint during stream; failure logged; stream continues. |
| `src/ai-agents/app/infra/sessions.py` | 96 | `Exception` | soft-fail-by-design | Session-delete on cleanup; soft (session expires). |
| `src/ai-agents/app/infra/sessions.py` | 142 | `Exception` | soft-fail-by-design | Session-load on reconnect; falls back to fresh session. |
| `src/ai-agents/app/infra/mcp_capability.py` | 47 | `Exception` | soft-fail-by-design | MCP capability probe; if unavailable, capability list is empty. |
| `src/ai-agents/app/infra/mcp_session.py` | 137 | `McpError` | hard-fail | MCP protocol error → raises `McpError` to caller. |
| `src/ai-agents/app/infra/mcp_session.py` | 148 | `_TRANSPORT_ERRORS` | hard-fail | Transport failure → re-raises for resilience wrapper to retry. |
| `src/ai-agents/app/infra/mcp_session.py` | 201 | `Exception` | **TBD** | Broad catch in MCP session setup; intent unclear. |
| `src/ai-agents/app/infra/mcp_session.py` | 251 | `Exception` | **TBD** | Broad catch in MCP message dispatch; likely soft-fail but needs review. |
| `src/ai-agents/app/infra/gemini.py` | 40 | `Exception` | hard-fail | Gemini API call; re-raises as `LLMError` (Phase 1 timeout wrapper). |
| `src/ai-agents/app/infra/gemini.py` | 82 | `Exception` | soft-fail-by-design | Gemini stream chunk parse; chunk skipped, stream continues. |
| `src/ai-agents/app/infra/gemini.py` | 98 | `Exception` | **TBD** | Gemini embedding call; broad catch. Review: should raise `LLMError`? |
| `src/ai-agents/app/infra/mcp_data.py` | 46 | `Exception` | soft-fail-by-design | mcp-data probe at startup; service starts with degraded data access. |
| `src/ai-agents/app/infra/voice/livekit_room.py` | 110, 163, 168, 168, 215, 237, 259, 272, 293, 352, 354, 356 | various | **TBD** (bulk) | LiveKit SDK callbacks; many broad catches around voice room lifecycle. These are all at the LiveKit SDK boundary. Most are likely soft-fail (log + clean up), but ~12 catches need individual audit before a prod release with live voice. |
| `src/ai-agents/app/infra/voice/vad.py` | 209 | `asyncio.QueueFull` | soft-fail-by-design | VAD audio frame overflow; frame dropped, stream continues. |
| `src/ai-agents/app/infra/voice/vad.py` | 291 | `Exception` | soft-fail-by-design | VAD inference error; error logged, VAD skips frame. |
| `src/ai-agents/app/infra/voice/edge_tts.py` | 154 | `Exception` | **TBD** | TTS streaming error; broad catch. |
| `src/ai-agents/app/infra/voice/groq_stt.py` | 107 | `Exception` | hard-fail | STT API call → raises `SttError` (Phase 1 wrapped). |
| `src/ai-agents/app/resources/handlers.py` | 66, 121, 141, 217, 287 | `Exception` | **TBD** | Agent handler dispatch; 5 broad catches. Each may be soft-fail (resume next turn) but needs review per handler. |
| `src/ai-agents/app/resources/voice/transport.py` | 52 | `OperationTimeout` | hard-fail | LLM timeout during voice turn → raises `OperationTimeout`. |
| `src/ai-agents/app/resources/voice/transport.py` | 62 | `SttError` | hard-fail | STT failure → re-raises. |
| `src/ai-agents/app/resources/voice/session.py` | 141 | `Exception` | soft-fail-by-design | Session cleanup on shutdown; logged. |
| `src/ai-agents/app/routes/interview.py` | 66, 102, 111, 130, 156 | various | boundary | Domain errors → `context.abort`. |
| `src/ai-agents/app/routes/chat.py` | 54, 63 | `Exception` | boundary | Streaming RPC error handling → abort. |
| `src/ai-agents/app/routes/practice.py` | 49, 78, 107 | various | boundary | Domain errors → abort. |
| `src/ai-agents/app/routes/grpc_common.py` | 40, 51 | `JWTError` | boundary | JWT decode → abort UNAUTHENTICATED. |
| `src/ai-agents/app/service/voice_worker.py` | 149 | `OperationTimeout` | hard-fail | LLM/STT/TTS timeout in voice loop; logged + session terminated. |
| `src/ai-agents/app/service/voice_worker.py` | 166, 201, 224 | `Exception` | soft-fail-by-design | Voice worker per-session lifecycle; errors logged, worker continues for next session. |
| `src/ai-agents/app/service/voice_worker.py` | 253 | `Exception` | soft-fail-by-design | SIGTERM drain; logged. |
| `src/ai-agents/app/service/voice_worker.py` | 287 | `Exception` | soft-fail-by-design | Startup background task. |

---

## src/mcp-capability/

| File | Line | Exception | Category | Notes |
|---|---|---|---|---|
| `src/mcp-capability/app/tools.py` | 121, 172 | `Exception` | soft-fail-by-design | Capability tool execution; error returned as MCP error response, not exception. |
| `src/mcp-capability/app/tools.py` | 272 | `Exception` | **TBD** | Broad catch in tool registry. |

---

## src/mcp-data/

| File | Lines | Exception | Category | Notes |
|---|---|---|---|---|
| `src/mcp-data/app/server.py` | 207 | `ValidationError` | hard-fail | MCP request schema → returns MCP error response. |
| `src/mcp-data/app/tools.py` | 81, 100, 124, 149, 170, 223, 244, 307, 341, 375, 421, 451, 476, 497, 531, 569, 614, 637, 663 | `Exception` | soft-fail-by-design | MCP tool execution; each tool catches and returns a structured MCP error rather than propagating. This is by design for the MCP protocol — tools must not crash the server. 19 catches, same pattern. |
| `src/mcp-data/app/tools.py` | 111, 259, 554 | `InvalidId` | hard-fail | ObjectId parse → returns MCP not-found error. |
| `src/mcp-data/app/tools.py` | 419 | `DuplicateKeyError` | hard-fail | Idempotent insert; returns MCP conflict error. |

---

## TBD items requiring review before prod release

These catches need individual audit by the ops/dev team before the first production release:

| File | Line | Concern |
|---|---|---|
| `src/admin/app/resources/company_profile.py` | 75 | Broad `Exception` in resource — should this be hard-fail? |
| `src/admin/app/resources/scheduling.py` | 79 | Broad `Exception` — raises or logs? |
| `src/ai-agents/app/infra/mcp_session.py` | 201, 251 | MCP session setup/dispatch — hard-fail vs soft-fail intent unclear. |
| `src/ai-agents/app/infra/gemini.py` | 98 | Gemini embedding — should raise `LLMError`. |
| `src/ai-agents/app/infra/voice/livekit_room.py` | 12 catches | LiveKit SDK boundaries — audit individually; voice correctness at risk. |
| `src/ai-agents/app/infra/voice/edge_tts.py` | 154 | TTS streaming — hard or soft? |
| `src/ai-agents/app/resources/handlers.py` | 66, 121, 141, 217, 287 | Agent handler dispatch — 5 broad catches needing per-handler review. |
| `src/mcp-capability/app/tools.py` | 272 | Tool registry broad catch. |
