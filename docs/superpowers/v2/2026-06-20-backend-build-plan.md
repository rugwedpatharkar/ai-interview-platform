# Aptura v2 — Backend Build Plan (service-by-service)

> **The backend counterpart to [the screens frontend build plan](2026-06-19-screens-frontend-build-plan.md).**
> Where the screens plan maps each *mockup → route → `@ip/ui` component*, this maps each
> *feature → service → collections / models / resources / RPCs / endpoints / events / agents / seams*,
> grounded in the **actual code** (`src/admin`, `src/ai-agents`, `src/mcp-data`, `src/mcp-capability`,
> `lib`). **Status: design complete, build pending.** **Local-only project — never run git/gh.**

## How to use this doc

This is the **map + global contracts + build order**, not the task list. The **per-task TDD detail
lives in each pillar plan** (the `2026-06-19-*.md` spec/plan pairs indexed in [README](README.md)). When
you build an increment:

1. Read the cross-cutting contracts (§2) once — they are load-bearing and every increment touches them.
2. Open this doc's increment section (§3) for the *backend surface inventory* (what to add, where, marked
   `[built]`/`[evolve]`/`[new]`).
3. Open the **linked pillar plan** for the *ordered `- [ ]` TDD tasks* that build that surface.
4. Cross-check the consolidated appendices (§4–§6) so nothing (an index, an eraser hookup, an event) is
   missed across pillars.
5. Run the per-increment gate (§7).

**Tags:** `[built]` exists + works · `[evolve]` exists, extend additively · `[new]` does not exist.

---

## 1. Service topology (what owns what)

| Service | Transport | Owns | v2 role |
|---|---|---|---|
| **admin** | gRPC-web over HTTP (uvicorn; in-house translator in `routes/grpcweb.py`) + REST side-apps via `_oauth_dispatcher` | **MongoDB** (all collections), the **funnel** state machine, the **index authority** (`infra/db.py`), the **erasure cascade**, **graders** | Most new surface lands here: 10 new gRPC services, the `/public/*` SSR read surface, all new collections + indexes |
| **ai-agents** | FastAPI REST + RabbitMQ worker (injected-LLM seam) | The **AI brain** (agents), the interview **Transport** seam, the live video+voice engine | New agents (integrity, practice, feedback), practice endpoints, mixed-bank generation |
| **mcp-data** | FastMCP (streamable-http) | Mongo **data tools** for ai-agents | New read/write tools for `integrity_signals`, `practice_sessions` |
| **mcp-capability** | FastMCP (streamable-http) | LLM / embed / RAG / **sandbox** capability tools | The **`run_code`** Docker sandbox behind a `CodeRunner` seam |
| **lib** | (imported package) | Shared `schemas` (enums), `security` (sessions, JWT, RateLimiter), `redis`, `storage` | New `ApplicationState.assessment_review`, `Role.hiring_manager`, the **permissions matrix**, session metadata |

**Two read surfaces, one resource layer (guardrail):** the public `/public/*` Starlette app and the authed
gRPC services both call the **same `resources/*` functions** — never duplicate logic across the transports.

---

## 2. Cross-cutting backend contracts (read once — every increment extends these)

These five are **load-bearing**. They are never refactored without explicit sign-off; v2 *extends* them.

### 2.1 Funnel state machine — `src/admin/app/resources/funnel.py` + `lib/lib/schemas/enums.py`
- `next_state(current, event, payload)` is the **only** place application state changes (CAS via `set_state_if`,
  one `AuditLog` row per transition). New stages are added through the `ApplicationState` / `FunnelEvent`
  enums — **never via side-channel writes**.
- **v2 adds exactly one state:** `ApplicationState.assessment_review` (non-terminal, advisory hold). No new
  `FunnelEvent` — advisory reuses `aptitude.graded` + the existing `gate.override` + `recruiter.decision`.
- **The gate branch** (today `funnel.py:41–42`): `aptitude.graded → interview_pending if passed else gated_out`.
  v2 wraps it: in `advisory` mode **both** outcomes route to `assessment_review`; `auto` mode is byte-identical
  to today. `gate.override` and `recruiter.decision` widen their *from*-states to include `assessment_review`.

### 2.2 The `aptitude.graded` seam — `src/admin/app/resources/aptitude.py` + `resources/graders.py` `[new]`
- **The integration firewall.** ai-agents *authors* the assessment bank; admin *grades + gates*. The event
  payload stays **flat and unchanged**: `{application_id, passed}` (+ `gate_mode` read by the funnel). Funnel
  and analytics never learn that coding/free-text kinds exist.
- v2 replaces the inline MCQ branch with a **`GRADERS` dict-dispatch registry** (`grade_mcq` / `grade_coding`
  / `grade_free_text` → `aggregate`). `grade_coding` calls the sandbox via the injected `CodeRunner`.
- **Grader error contract (blocking):** `grade_coding` on **sandbox/infra failure** raises a typed
  `SectionUngradable` (retryable) — it **must never score 0**. A candidate compile-error/timeout *is* a
  score (0 for that case); a sandbox outage is *ungraded*. This boundary is the `SandboxError` taxonomy (§2.6).

### 2.3 `CandidateEraser` cascade — `src/admin/app/resources/compliance.py`
- Choreographs deletion across **Mongo + MinIO + Redis** — **best-effort per-collection, NOT one txn**. Each
  delete is idempotent; failures log and the cascade continues; `sweep()` re-runs for recovery.
- **Leaf-first order** (artifacts → resume → `anonymize` last). **Every new v2 artifact collection joins the
  cascade** — this is the single most important compliance follow-through. Inc 0 stubs all the hookup points
  (None-guarded optional repos) so later increments only *fill* them.
- **v2 cascade additions (7 + session):** `assessment_attempts` artifacts, `code_submissions`,
  `messages`, `message_threads`, `notifications`, `notification_prefs`, `practice_sessions`,
  `integrity_signals`, `member_job_assignments`; widen
  `users.anonymize()` to null `totp_secret`/`recovery_codes`/`pending_email`; `sessions.revoke_user()`.

### 2.4 Index authority — `src/admin/app/infra/db.py` (`INDEXES` list, `ensure_indexes()` on startup)
- **Single source of truth** for *all* Mongo indexes — including collections **written by other services**
  (mcp-data writes `integrity_signals`/`practice_sessions`; admin declares their indexes).
- **v2 adds ~40 indexes** across 12 new collections + the `jobs`/`users` extensions (full list in §4).
- **Migration discipline (blocking):** big-collection index builds block writes — use **online/background
  builds**; `jobs.posted_at` needs a **backfill** (legacy jobs have none, else `recent` sort breaks).

### 2.5 The `Notifier` seam — `src/admin/app/infra/notifier.py`
- **Contract widening (blocking):** today `send(subject, body, to_email)`. v2 passes the **full notification
  row**: `send(NotificationPayload{kind, subject, body, link, comp_id, created_at}, *, to_email)`. The
  `notifications` center writes the durable row **first**, then guards the email (`try/except`, log, never
  block). Channel choice (email vs in-app vs quiet-hours) comes from `settings.channels_for(user_id)`.
- Swap `LoggingNotifier → SMTP` later with no caller change.

### 2.6 Injected seams (keep the offline gate offline) — fakes live in tests, real impls behind Protocols
| Seam | Protocol / file | Fake | Real | Used by |
|---|---|---|---|---|
| LLM | existing injected-LLM seam | `FakeLlm` (scripted, temp-0) | Gemini/LangGraph | every agent + graders |
| Interview modality | `Transport.ask(q)->str` | live video+voice host adapter | `VoiceTransport` | `conduct_interview` (brain unchanged) |
| Voice STT/TTS | `infra/voice/engines.py` | fakes | `GroqStt`, edge-tts | voice worker `[built]` |
| **Code runner** | `mcp-capability/app/seams/code_runner.py` `[new]` | `FakeCodeRunner` (no Docker) | `DockerCodeRunner` | `grade_coding` |
| Object storage | `lib/storage` | in-mem | MinIO/S3 | résumé `[built]`, ICS files |
| **TOTP / crypto** | `infra/totp.py` + `infra/crypto.py` `[new]` | fakes | `pyotp`, libsodium | settings 2FA |
- **STOP-SHIP** for `DockerCodeRunner`: `--network=none`, read-only FS + tmpfs, non-root, `--cap-drop=ALL`,
  mem/cpu/pids caps, **wall-clock kill** (not in-container), output cap, **one container per run**, always
  `finally`-cleanup. It is the **only file importing the `docker` SDK**. `SandboxError` = infra failure
  (≠ candidate compile-error/timeout); cross-tenant leak test required.

---

## 3. Per-increment backend build map

> Build order follows the [README build sequence](README.md). Each increment lists its backend surface and
> links the **pillar plan that holds the ordered TDD tasks**. `[built]`/`[evolve]`/`[new]` per row.

### Inc 0 — Compliance-ready advisory gate · *foundational, tiny, touches the seam everything extends*
**Plan:** [compliance-advisory-gate.md](2026-06-19-compliance-advisory-gate.md) · **Service:** admin + lib

| Surface | Change |
|---|---|
| enum (lib) | `[evolve]` `ApplicationState.assessment_review` in `lib/lib/schemas/enums.py` |
| model | `[evolve]` `AptitudeConfig.gate_mode: Literal["auto","advisory"]="auto"` (`model/job.py`) |
| resource | `[evolve]` `funnel.next_state` gate branch on `gate_mode`; widen `gate.override` + `recruiter.decision` from-states to include `assessment_review` |
| resource | `[evolve]` `aptitude.grade_aptitude` emits `gate_mode` on the `aptitude.graded` payload |
| **eraser** | `[evolve]` `compliance.CandidateEraser` gains all v2 artifact repos as **optional None-guarded params** + the leaf-first cascade order + the "skips absent/None repo" test (stubs every later hookup) |
| proto | `[evolve]` add `gate_mode` field to the aptitude-config message; map proto `"" → "auto"` |
| gate | funnel transition tests for both modes; erasure-converges-on-retry test |

### Inc 1 — Job marketplace & discovery · *the front door; read-side, no AI risk*
**Plan:** [job-marketplace.md](2026-06-19-job-marketplace.md) · **Service:** admin (+ Qdrant in v2.1)

| Surface | Change |
|---|---|
| collections | `[new]` `company_profiles`, `saved_jobs`, `job_alerts`; `[evolve]` `jobs` (+ `location`, `remote_mode`, `employment_type`, `salary_min/max/currency`, `skills[]`, `posted_at`) |
| indexes | `[new]` `jobs` `$text(title,jd_text,skills)` + facet compounds + `(comp_id,status,posted_at)`; `saved_jobs` unique `(candidate_user_id,job_id)`; `company_profiles` unique `(comp_id)` |
| models | `[new]` `CompanyProfile`, `SavedJob`, `JobAlert`; `[evolve]` `Job` |
| resources | `[new]` `discovery.py` (`search_jobs` `$text`+`$facet`, `get_public_job`, `get_recommended_feed`), `company_profile.py` (+ logo presign), `saved_jobs.py`, `job_alerts.py`, `sourcing.py` (`search_candidates` over own-comp applicants); `[evolve]` `job.py` (+ `update_job`, stamp `posted_at` on publish) |
| gRPC | `[new]` `DiscoveryService`, `CompanyProfileService`, `SavedJobsService`, `JobAlertsService`, `SourcingService`; `[evolve]` `JobService` (+ `UpdateJob`, new fields) |
| **public REST** | `[new]` `routes/public_api.py` Starlette app mounted at `/public/*` via `main.py` `_oauth_dispatcher`; `GET /public/jobs`, `/public/jobs/{id}`, `/public/companies/{id}`, `/public/companies/{id}/jobs`; published-only, page-cap, `RateLimiter`, `Cache-Control: public, max-age=60` |
| blocking fixes | `$text` **secondary sort / tie-break** (recency); `posted_at` **backfill**; name **every field excluded** from each public DTO (+ grep-test); logo type/size validation; `SearchCandidates` universe; `/public/*` CDN-staleness (60s) doc |
| scheduler | `[new]` (v2.1) `catalog_reconcile_pass()` — sync `jobs:catalog` Qdrant vectors on publish/edit/unpublish |

### Inc 2 — Rich assessments + code-execution sandbox · *biggest differentiator + the only new infra*
**Plans:** [rich-assessments.md](2026-06-19-rich-assessments.md) + [code-execution-sandbox.md](2026-06-19-code-execution-sandbox.md) · **Service:** admin (graders) + mcp-capability (sandbox) + ai-agents (generation)

| Surface | Change |
|---|---|
| model (admin) | `[new]` `model/assessment.py` discriminated union: `McqSection`/`CodingSection`/`FreeTextSection`, `TestCase`, `SectionScore`, `AssessmentBank`; `[evolve]` `AptitudeAttempt` (+ `per_section_scores[]`, `kind`), `AptitudeDelivery` (+ `served_sections`) |
| resource (admin) | `[new]` `resources/graders.py` — `GRADERS` registry + `grade_mcq` (extracted, byte-identical) / `grade_coding` (calls `capability.run_code`, weights hidden×3/visible×1) / `grade_free_text` (Evaluator on rubric) / `aggregate`; `[evolve]` `aptitude.grade_aptitude` dispatches via registry, **unchanged emit** |
| sandbox (mcp-capability) | `[new]` `seams/code_runner.py` (`CodeRunner` + `FakeCodeRunner`), `tools.py::run_code` (boundary validation → delegate), `infra/docker_code_runner.py` (`DockerCodeRunner`, only `docker` importer), `server.py` `@mcp.tool("run_code")` lazy-built, `config.py` sandbox limits, `schemas.py` (`TestCase`/`RunResult`/`CaseResult`/`SandboxError`) |
| client (ai-agents) | `[evolve]` `infra/mcp_capability.py` `run_code(...)` |
| generation (ai-agents) | `[evolve]` `aptitude_setter.build_assessment_bank(counts={...})` authors MCQ **and** coding; `handlers.handle_job_published` **per-kind idempotency** (build only missing kinds, merge, never replace) |
| collection | `[new]` `code_submissions` (per-submission source + per-case results, joined to `aptitude_attempts`) → eraser |
| infra | `[new]` `docker/sandbox-python.Dockerfile`, `docker/sandbox-node.Dockerfile` (pinned digest, non-root) |
| blocking fixes | grader **error contract** (`SectionUngradable`, never 0); `SandboxError` **taxonomy**; per-section **weighting formula** + worked example; coding **test-case weighting**; free-text **rubric format + prompt + test**; mixed-bank **per-kind idempotency**; **output cap N**; **language→image** URI map; **one-container-per-run** assert; **cross-tenant leak** test |

### Inc 3 — Live video + voice interview · *backend already built; add a video track, execute, don't redesign*
**Plan:** [../plans/2026-06-19-voice-interview.md](../plans/2026-06-19-voice-interview.md) (TIER D) · **Service:** ai-agents `[built]`

> **Sole interview modality (2026-06-20):** one live, real-time, **strictly-proctored video + voice** LiveKit room (camera + mic **required**, **no mute**, fullscreen-locked). Real-time STT produces the transcript the interviewer/evaluator brain scores **unchanged**. The legacy text `/turn` path is **removed**. Proctoring is **live + enforced** — 40 signals, hard auto-gate on HIGH-severity cheating, integrity timeline surfaced to recruiters. See [proctored-integrity](2026-06-20-proctored-integrity.md).

| Surface | Change |
|---|---|
| backend | `[built]` `resources/voice/*`, `infra/voice/*` (`silero_vad.onnx`), `service/voice_worker.py`, `/interview/{id}/rtc-token`, `VoiceTransport` (implements `Transport.ask`) — the live room adds a **video track** to the built LiveKit voice pipeline (mostly LiveKit config); the transcript shape is identical, so the brain is **unchanged**. Text `/turn` path **removed** |
| infra | `[new]` `docker/livekit.yaml` dev config (camera + mic tracks); `.env` `LIVEKIT_*`, `GROQ_API_KEY` |
| work | the remaining work is **frontend + LiveKit config + E2E** (see the screens plan + the voice plan's TIER D) |

### Inc 4 — Messaging + Notifications center · *closes the loop both sides*
**Plans:** [messaging.md](2026-06-19-messaging.md) + [notifications-center.md](2026-06-19-notifications-center.md) · **Service:** admin

| Surface | Change |
|---|---|
| collections | `[new]` `message_threads` (1:1 application), `messages` (append-only), `notifications` |
| indexes | `message_threads` unique `(application_id)`, `(candidate_user_id,last_message_at)`, `(comp_id,last_message_at)`; `messages` `(thread_id,created_at)`, `(application_id)`; `notifications` `(user_id,created_at)`, `(user_id,read_at)`, **`(user_id,dedup_key)` unique sparse** (broker-redelivery idempotency) |
| models | `[new]` `MessageThread`, `Message`, `Notification` |
| repos | `[new]` `message_threads.py`, `messages.py`, `notifications.py` (+ `delete_by_applications`/`delete_by_user` for the cascade) |
| resources | `[new]` `messaging.py` (`send_message` lazy-thread + authz `aptitude._owned`/`_require_manager` + body validation + bump-unread + best-effort notify; `list_threads`/`list_messages`/`mark_read`); `[evolve]` `notification.py` — `_emit` (row-first, dedup, email-guarded), `notify_event` (non-funnel triggers), `list_for_user`/`mark_read`/`mark_all_read`, typed `_MESSAGES` map + new kinds |
| gRPC | `[new]` `MessagingService` (Send/ListThreads/ListMessages/MarkRead), `NotificationService` (List/MarkRead/MarkAllRead, response carries `unread_count`) |
| eraser | `[evolve]` fill `messages`/`message_threads`/`notifications` hookups |
| blocking/high | message-level `read_at` **vs** thread-level unread reconciliation; email **retry** policy; **dedup** on redelivery; per-kind **deep-link** resolution; `unread_count` freshness (always `count_documents`, never cached) |

### Inc 5 — Candidate growth: practice + skill-gap feedback · *lowest-risk AI surface, detached from funnel*
**Plan:** [candidate-growth.md](2026-06-19-candidate-growth.md) · **Service:** ai-agents (+ mcp-data)

| Surface | Change |
|---|---|
| collection | `[new]` `practice_sessions` (by `user_id`, **no `comp_id`**) → eraser |
| models (ai-agents) | `[new]` `model/practice.py` (`PracticeSession`), `model/feedback.py` (`GrowthFeedback`) |
| resource (ai-agents) | `[new]` `resources/practice.py` — `start_practice` (derive JD from topic or verbatim → blueprint → persist), `submit_practice_turn` (append/budget/next_question/**finalize inline, no event**), `build_feedback` (per-competency, candidate-tone via `report_writer`) |
| store (ai-agents) | `[new]` `RedisPracticeStore` (key `practice:{id}`, `user_id`-scoped) |
| endpoints (ai-agents) | `[new]` `POST /practice/start`, `POST /practice/{id}/turn`, `GET /practice/{id}/feedback` |
| mcp-data | `[new]` `save_practice_summary`, `get_practice_summary`, `list_practice_sessions` + `practice_sessions` in `DataStore` |
| reuse | `blueprint`, `next_question`, `evaluate_interview`, `Transport` — unchanged (practice never publishes to RabbitMQ, never advances a funnel) |
| high fixes | feedback **calc** (what score = a "gap") + example; **topic→JD synthesis** prompt; `/feedback/[id]` surface; practice-history API; status-transition order |

### Inc 6 — ~~Async video interview~~ · **CUT**

> **REMOVED from v2 (2026-06-20):** async recorded video is cut; the live video+voice room (Inc 3) is the sole interview modality. No `video_answers` collection, `VideoAnswerTransport`, `/video/*` endpoints, clip decode/STT, or video clips in object storage.

### Proctored integrity (strict, cheat-proof) · *mandatory; HIGH-severity auto-gates*
**Plan:** [proctored-integrity.md](2026-06-20-proctored-integrity.md) · **Service:** frontend (camera/mic detectors) + ai-agents (`/proctor`, auto-gate) + admin (report surface, `GetIntegrityTimeline`, recording) + mcp-data (`proctoring_events`) · *lands with Inc 3 (the interview)*

| Surface | Change |
|---|---|
| collection | `[built]` `proctoring_events` (40-signal typed events + **server-assigned severity** + `integrity_score()`; `(application_id)`, `(comp_id,application_id)` indexed) — model + `/proctor` endpoint + persistence already exist |
| frontend detectors | `[new]` **activate the camera/mic detectors** (today STUBBED — `getUserMedia` never called): `proctor-vision.ts` (on-device face/landmark → gaze/second-face/phone/head-move/body-out-of-frame) + `proctor-audio.ts` (second-voice/synthetic-audio) — typed events only, no raw frames leave the device |
| mandatory + strict | `[evolve]` required device pre-check (camera+mic), fullscreen lock, **no mute / no camera-off**; replace the optional consent checkbox with a required acknowledgment |
| auto-gate (ai-agents) | `[evolve]` `resources/proctoring.py` — on a HIGH-severity signal, **terminate the live interview** + flag the application (finalize `proctor_terminated`) |
| surface (admin) | `[evolve]` add `integrity_score` + `integrity_flags` to the report; `report_writer` reads `proctoring_events`; new recruiter-facing **`GetIntegrityTimeline(application_id)`** read (comp-scoped) |
| recording | `[new]` persist the LiveKit session video to MinIO (tenant-scoped) for human review → **eraser** |
| high fixes | on-device model choice + perf budget; HIGH-signal terminate UX; recording retention; **biometric/sensitive-data compliance** (consent/retention/jurisdiction) before launch |

### New completeness modules (from the [completeness audit](2026-06-19-v2-completeness-audit.md)) · *slot early / alongside their pillar*

**Settings & security** — [plan](2026-06-19-settings-and-security.md) · admin + lib
| Surface | Change |
|---|---|
| collection | `[new]` `notification_prefs` (unique `user_id`); `[evolve]` `users` (+ `totp_enabled`, `totp_secret` enc, `recovery_codes` enc, `pending_email`) |
| infra | `[new]` `infra/totp.py` (`TotpProvider`/`PyotpProvider`), `infra/crypto.py` (`SecretBox`/libsodium); `[evolve]` `lib/lib/security/sessions.py` (+ `meta`, `list_for_user`, `revoke(jti)`) |
| resource | `[new]` `settings.py` — `change_password` (+ revoke other sessions), `request/verify_email_change`, `setup/verify/disable_totp`, `list/revoke/revoke_all_sessions`, `get/set_notification_prefs`, **`channels_for`** (pure; feeds the Notifier) |
| gRPC | `[new]` `SettingsService` (11 RPCs); `[evolve]` `auth.Login` branches to `mfa_required` when `totp_enabled` |
| eraser | `[evolve]` `notification_prefs` delete + widen `users.anonymize` (null totp/recovery/pending) + `sessions.revoke_user` |

**Team & permissions** — [plan](2026-06-19-team-and-permissions.md) · admin + lib
| Surface | Change |
|---|---|
| **lib** | `[new]` `lib/lib/schemas/permissions.py` — `PERMISSIONS: dict[Role, frozenset[Scope]]` matrix + `has_permission` + `require_permission` (**single authority**); `[evolve]` `Role.hiring_manager` |
| collection | `[new]` `member_job_assignments` (should-have, deferred); `[evolve]` `users` (+ `status` active/invited/inactive, `last_active_at`, `invited_by`, `role`) |
| resource | `[new]` `team.py` — `list_members`/`invite_member`/`resend_invite`/`revoke_invite`/`remove_member`/`change_role` + **last-admin guard** + audit + rate-limit; `[evolve]` `auth.invite_recruiter` delegates to `team.invite_member(role="recruiter")` (signature unchanged); replace `_MANAGER_ROLES` in `decision.py`/`job.py`/`rubric.py` with `require_permission(...)` |
| gRPC | `[new]` `TeamService` (6 RPCs) |

**Interview scheduling** — [plan](2026-06-19-interview-scheduling.md) · admin
| Surface | Change |
|---|---|
| collections | `[new]` `interview_slots` (recruiter proposes), `interview_bookings` (candidate picks, **CAS `version`**, `ics_key`, `status`) |
| indexes | both unique `(application_id)`; `interview_bookings` `(candidate_user_id,updated_at)`, `(comp_id,status,start_at)`, `(status,start_at)` for the reminder sweep |
| resource | `[new]` `scheduling.py` — `propose_slots`/`get_schedule`/`choose_slot`(CAS+ICS)/`reschedule`/`cancel`; `[new]` `scheduling_ics.py` (pure RFC-5545 VEVENT builder, stable UID, `SEQUENCE`++ on reschedule); gate `state in (interview_pending, shortlisted)` |
| gRPC | `[new]` `SchedulingService` (5 RPCs) |
| **scheduler** | `[new]` `reminder_sweep()` (T-24h, T-1h, sent-flag guard) + `complete_past_interviews()` in `main.py` `run_schedulers()` |
| eraser | `[evolve]` `interview_slots` + `interview_bookings` delete |

**Onboarding** — [plan](2026-06-19-onboarding.md) · admin (thin) — mostly FE/empty-states + first-run reads; profile-completeness + post-first-job wizard read existing surfaces. No material new collection.

**Platform hardening** — [plan](2026-06-19-platform-hardening.md) · cross-cutting
| Surface | Change |
|---|---|
| rate-limit | `[evolve]` thread `lib.redis.RateLimiter` into discovery/search, messaging, notifications, `/public/*`, auth, settings, team — **consolidated policy table** + opaque 429s |
| observability | `[evolve]` structured logging + tracing seams + `/health` for new infra (sandbox, live video+voice, practice); error budgets; alerting on best-effort async ops |
| retention | `[new]` TTL strategy for `notifications` + `practice_sessions` (unbounded growth) |
| data-model | online index builds; **forged-`comp_id` rejection** integration test; UTC discipline; denormalization-staleness rules; the Notifier-contract widening (§2.5) |

### Analytics + recruiter polish · *after the data exists*
**Service:** admin — `[evolve]` `AnalyticsService` gains assessment/messaging dimensions + **no-ghosting KPIs**
(outcome-rate, avg response time) from funnel ground-truth; `[evolve]` candidate side-by-side compare + bulk
actions (batch reject/schedule) over existing applicant queries.

---

## 4. Consolidated data model (the single `infra/db.py` view)

### New collections (13)
| # | Collection | Owner (writer) | Keyed by | Joins eraser |
|---|---|---|---|---|
| 1 | `company_profiles` | admin | `comp_id` | — |
| 2 | `saved_jobs` | admin | `(candidate_user_id, job_id)` | by_user |
| 3 | `job_alerts` | admin | `candidate_user_id` | by_user |
| 4 | `message_threads` | admin | `application_id` | by_applications |
| 5 | `messages` | admin | `thread_id` | by_applications |
| 6 | `notifications` | admin | `user_id` | by_user |
| 7 | `notification_prefs` | admin | `user_id` (unique) | by_user |
| 8 | `interview_slots` | admin | `application_id` | by_applications |
| 9 | `interview_bookings` | admin | `application_id` | by_applications |
| 10 | `member_job_assignments` | admin | `(member_user_id, job_id)` | by_user |
| 11 | `code_submissions` | admin | `application_id` | by_candidate |
| 12 | `video_answers` | mcp-data | `application_id` | by_candidate (+ blobs) |
| 13 | `integrity_signals` | mcp-data | `application_id` | by_candidate |
| 14 | `practice_sessions` | mcp-data | `user_id` | by_user |
| — | `jobs:catalog` (Qdrant, v2.1) | admin | job vector | reconcile sweep |

### Evolved collections
- `jobs` — `location, remote_mode, employment_type, salary_min/max/currency, skills[], posted_at` (additive, optional)
- `users` — `status, last_active_at, invited_by, role, totp_enabled, totp_secret, recovery_codes, pending_email`
- `aptitude_attempts` — `per_section_scores[], kind` · `aptitude_deliveries` — `served_sections, watermark, selected_question_ids` · `AptitudeConfig` — `gate_mode`

### New indexes (declare all in `infra/db.py` `INDEXES`)
```
jobs            $text(title,jd_text,skills) · (comp_id,status,posted_at) · facet compounds (employment_type/remote_mode/experience_level) · (posted_at)
company_profiles  (comp_id) unique
saved_jobs      (candidate_user_id,job_id) unique · (candidate_user_id,created_at)
job_alerts      (candidate_user_id,comp_id) · (candidate_user_id,created_at)
message_threads (application_id) unique · (candidate_user_id,last_message_at) · (comp_id,last_message_at)
messages        (thread_id,created_at) · (application_id)
notifications   (user_id,created_at) · (user_id,read_at) · (user_id,dedup_key) unique sparse
notification_prefs (user_id) unique
interview_slots (application_id) unique · (comp_id,application_id)
interview_bookings (application_id) unique · (candidate_user_id,updated_at) · (comp_id,status,start_at) · (status,start_at)
member_job_assignments (member_user_id,job_id) unique · (member_user_id) · (job_id)
users           (comp_id,role) · (comp_id,status)
video_answers   (application_id)            # admin declares; mcp-data writes
integrity_signals (application_id,comp_id)  # admin declares; mcp-data writes
practice_sessions (user_id,created_at)      # admin declares; mcp-data writes
code_submissions (application_id)
```

### New enum / shared values (lib)
- `ApplicationState.assessment_review` · `Role.hiring_manager`
- `lib/lib/schemas/permissions.py` — `PERMISSIONS` matrix + `has_permission` + `require_permission`
- `lib/lib/security/sessions.py` — session `meta` + `list_for_user` + `revoke(jti)`

---

## 5. Consolidated service surface

### New admin gRPC services (10) — proto in `routes/pb/`, servicer in `routes/`, register in `routes/web.py`, `pnpm gen`
`DiscoveryService` · `CompanyProfileService` · `SavedJobsService` · `JobAlertsService` · `SourcingService` ·
`MessagingService` · `NotificationService` · `SchedulingService` · `TeamService` · `SettingsService`
(+ `[evolve]` `JobService.UpdateJob`, `AuthService` MFA branch)

### New admin public REST — `routes/public_api.py` (Starlette via `_oauth_dispatcher`)
`GET /public/jobs` · `/public/jobs/{id}` · `/public/companies/{id}` · `/public/companies/{id}/jobs` (+ `sitemap.ts`/`robots.ts` consume these)

### New ai-agents REST endpoints — `routes/interview_api.py`
`POST /interview/{id}/video/upload-url` · `POST /interview/{id}/video/turn` · `POST /practice/start` ·
`POST /practice/{id}/turn` · `GET /practice/{id}/feedback` (voice `/interview/{id}/rtc-token` `[built]`)

### New mcp tools
- **mcp-data:** `save_video_answer`, `get_video_answers`, `save_integrity_signals`, `get_integrity_signals`, `save_practice_summary`, `get_practice_summary`, `list_practice_sessions`
- **mcp-capability:** `run_code` (+ `[built]` `parse_document`/`embed`/`kb_search`/`ingest`; `[evolve]` `SttEngine.transcribe_clip`)

### Events (RabbitMQ)
**No new domain events.** `aptitude.graded {application_id, passed}` stays the **single emit site** (richer
bank inside, flat payload out). Messaging/notifications/scheduling write Mongo + best-effort notify; practice
and video never publish; video finalize reuses `interview.completed`.

---

## 6. New infrastructure
- **Docker sandbox images** — `docker/sandbox-python.Dockerfile`, `docker/sandbox-node.Dockerfile` (pinned digest, non-root, frozen stdlib); `DockerCodeRunner` is the only `docker`-SDK importer.
- **LiveKit** — `docker/livekit.yaml` dev config; `LIVEKIT_*` + `GROQ_API_KEY` env (voice backend `[built]`).
- **Qdrant** — `jobs:catalog` collection for v2.1 semantic rerank (reuse the matcher's JD embeddings).
- **MinIO/S3** — `{comp_id}/video-answers/{application_id}/{uuid}.webm` clips; ICS files for bookings; presigned PUT.
- **Libs** — `pyotp` (TOTP), libsodium/`pynacl` (secret box), PyAV (clip decode — already a voice dep).

---

## 7. Build order, dependencies & the gate

### Order (= README sequence)
`Inc 0` (seam + eraser stubs) → `Inc 1` (marketplace) → `Inc 2` (assessments **after** sandbox) →
`Inc 3` (proctored video+voice FE/E2E) → `Inc 4` (messaging + notifications) → `Inc 5` (growth) →
analytics/polish. **Settings/team** slot early (auth-adjacent); **hardening/onboarding** ride alongside Inc 0–1;
**scheduling** alongside Pillar C. **Strict proctoring is live + enforced** in the interview (Inc 3) — see [proctored-integrity](2026-06-20-proctored-integrity.md).

### Hard dependencies
- **Sandbox (Inc 2 infra) precedes the coding grader** — `grade_coding` needs the `CodeRunner` contract.
- **Notifications center precedes messaging's `notify_event`** — and precedes scheduling reminders.
- **Settings `channels_for` precedes** the Notifier honoring quiet-hours/prefs.
- **Permissions matrix (lib) precedes** swapping `_MANAGER_ROLES` in decision/job/rubric.
- **Inc 0 eraser stubs precede** every artifact collection (so each lands erasable from day one).

### Per-increment gate (every increment must pass)
- [ ] `bash scripts/check.sh` green — ruff (S + ASYNC, line-88), pip-audit, **pytest ×5** (baseline **423**, grows per increment)
- [ ] `python scripts/smoke_login.py --selftest` boots the gRPC-web app (after any transport touch)
- [ ] proto regen: `npx pnpm@9.15.0 --filter @ip/api-client gen` clean
- [ ] **behavior preservation** — v1 paths (MCQ grade, funnel, applicant table) byte-identical; `aptitude.graded` payload unchanged
- [ ] **new offline-unsafe code behind an injected seam** with a fake (sandbox/voice/video/Notifier/TOTP/LLM) — the gate never starts Docker, never hits the network
- [ ] **every new artifact collection is in the `CandidateEraser` cascade** + the "skips absent/None repo" test passes
- [ ] every new index declared in `infra/db.py`; big-collection builds are background; `posted_at` backfilled
- [ ] forged-`comp_id` rejection test for every new tenant-scoped surface

---

## 8. Coverage matrix — where the backend TDD tasks live

| Backend surface | This doc | Ordered TDD tasks (pillar plan) |
|---|---|---|
| Advisory gate + eraser stubs | Inc 0 | [compliance-advisory-gate.md](2026-06-19-compliance-advisory-gate.md) |
| Marketplace + `/public/*` + sourcing | Inc 1 | [job-marketplace.md](2026-06-19-job-marketplace.md) |
| Graders + mixed bank | Inc 2 | [rich-assessments.md](2026-06-19-rich-assessments.md) |
| `run_code` Docker sandbox | Inc 2 | [code-execution-sandbox.md](2026-06-19-code-execution-sandbox.md) |
| Voice (backend built) | Inc 3 | [../plans/2026-06-19-voice-interview.md](../plans/2026-06-19-voice-interview.md) |
| Messaging | Inc 4 | [messaging.md](2026-06-19-messaging.md) |
| Notifications center + Notifier widening | Inc 4 | [notifications-center.md](2026-06-19-notifications-center.md) |
| Practice + skill-gap feedback | Inc 5 | [candidate-growth.md](2026-06-19-candidate-growth.md) |
| Proctored integrity (detectors + surface + auto-gate + recording) | with Inc 3 | [proctored-integrity.md](2026-06-20-proctored-integrity.md) |
| Settings/2FA/sessions/prefs | early | [settings-and-security.md](2026-06-19-settings-and-security.md) |
| RBAC matrix + team seats | early | [team-and-permissions.md](2026-06-19-team-and-permissions.md) |
| Slots/bookings/ICS + reminder sweep | with Pillar C | [interview-scheduling.md](2026-06-19-interview-scheduling.md) |
| First-run / empty states | with Inc 0–1 | [onboarding.md](2026-06-19-onboarding.md) |
| Rate-limit/observability/retention | cross-cutting | [platform-hardening.md](2026-06-19-platform-hardening.md) |

> **Net:** this doc is the backend's single navigable map — service topology, the five load-bearing contracts,
> the per-increment surface inventory, and the consolidated data/service/infra appendices. The pillar plans
> remain the source of the ordered `- [ ]` tasks; this is the connective tissue that keeps an index, an
> eraser hookup, or an event from slipping between them.
