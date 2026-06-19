# Proctoring & Integrity MVP — Implementation Plan

> **For agentic workers:** Browser-edge, **signals-only**, **advisory** integrity layer on the
> existing **text** interview. No raw media is stored/transmitted; no biometric identity; it never
> auto-blocks. **LOCAL-ONLY — never run git/gh.** Autonomous, TDD, `bash scripts/check.sh` green per
> backend slice; FE verified by build + typecheck.

**Goal:** Detect integrity signals (visual **B** / audio **C** / device-behavior **D**) in the
candidate's browser during the typed interview, stream typed **events** (not media) to the backend,
and surface an **advisory integrity timeline** on the recruiter report. Plus content integrity
(**E**: per-candidate question rotation + watermark).

**Decisions locked (user, 2026-06-19):**
- Scope = **B + C + D** + E(question rotation/watermark). **Cut:** all of **A** (ID/face-recognition/
  liveness) and **C voiceprint-identity** (the only biometric-identity item in B/C/D).
- Enforcement = **advisory-first** (log/flag every signal, never block; auto-terminate is a later config flip).
- Sequencing = **now, on the text interview** (no P3 voice / P4 video first).
- Privacy = **browser-edge detection, signals-only** (no raw recording), **behavioral-not-emotional**
  framing (never infer affect/attention-state — that's the EU-prohibited zone we permanently avoid).

## Global constraints
- LOCAL-ONLY, never git/gh. Autonomous. Backend gate `bash scripts/check.sh` green per slice; FE
  `npx pnpm@9.15.0 --filter @ip/{candidate,company} build` + `--filter @ip/{ui,shared,api-client} typecheck`.
- **Multi-tenant:** every proctoring doc + query carries `comp_id`; a candidate may POST only to their
  OWN interview; a recruiter reads only their comp's events.
- **Privacy invariant:** camera/mic frames are processed in-browser and **NEVER** transmitted or
  stored; only typed events leave the device; no biometric identity templates are created.
- **Advisory:** events never block / auto-reject; the recruiter reviews. (Auto-terminate is a future
  per-job config, intentionally out of the MVP.)
- Erasure: `proctoring_events` are deleted in the candidate erasure cascade (mirror the AI-artifact cascade).

## Architecture (maps onto the existing services)
- **Candidate browser** — new `@ip/proctoring` package, used by the candidate app: a `ProctorRuntime`
  that, **after consent**, acquires camera/mic (`getUserMedia`) + attaches Web API listeners, runs
  pluggable detectors on a throttled loop, debounces detector output → typed events, batches → sender.
- **`@ip/shared`** — `createProctorClient(baseUrl, store)`: batches + POSTs events (Bearer access
  token), mirroring `createChatClient`/`makeInterviewClient`.
- **ai-agents** — `POST /interview/{application_id}/proctor`: auth (candidate owns the interview, same
  check as `/turn`) → validate the typed batch against the catalog → persist via mcp-data. Reuses the
  interview auth seam; bounded batch size.
- **mcp-data** — `save_proctoring_events(application_id, comp_id, events)` + Mongo `proctoring_events`
  collection; indexes `(application_id)` and `(comp_id, application_id)`.
- **admin** — reads `proctoring_events` (comp_id-scoped) for the recruiter: extend the report payload
  / add a small `ProctoringService` read; the **company app** renders an integrity timeline + a banded
  summary (clean / review / high-concern) on the applicant/report view.
- **Detectors are pluggable + capability-gated.** D (device/behavior) and C (audio) need **no model
  assets**. B (visual) needs vendored MediaPipe/TF.js assets — it ships behind a capability flag so the
  pipeline, timeline, and D/C/E are unaffected if assets are unavailable offline.

## Event catalog (typed; shared backend model + FE TS mirror)
| Group | `type` values | default severity |
|---|---|---|
| **B visual** | `gaze_off_screen`, `head_turned_away`, `lips_move_no_audio`, `audio_no_lip_move`, `body_out_of_frame`, `second_face`, `phone_detected`, `camera_occluded`, `virtual_camera` | low–high |
| **C audio** | `second_voice`, `keyboard_typing`, `synthetic_audio_suspected` | low–medium |
| **D device/behavior** | `tab_hidden`, `window_blur`, `fullscreen_exit`, `copy`, `paste_large`, `devtools_open`, `multi_monitor`, `screen_share`, `keystroke_anomaly`, `ip_geo_anomaly` | low–medium |

Each event = `{type, at (client ISO ts), meta?}`. The backend validates `type ∈ catalog`, assigns the
**canonical severity** (never trust a client-sent severity), and computes a session integrity score
(weighted sum, banded). `second_face`/`second_voice`/`phone_detected` are high; tab/blur/gaze are low.

## Data model
`proctoring_events`: `{_id, application_id, comp_id, type, severity, at, meta, received_at}` — append-only.
Indexes: `(application_id)`, `(comp_id, application_id)`. No raw media, ever.

## Offline-asset note (B/visual only)
MediaPipe Tasks-Vision wasm + face/pose `.task` models (or TF.js COCO-SSD) are normally CDN-loaded;
this project is offline. **Slices 1–4 + 6 need NO assets and ship fully.** Slice 5 (visual) self-hosts
assets under the candidate app's `public/`; if they can't be vendored offline, the visual detectors
ship **wired-but-disabled behind a capability flag** — the event pipeline, recruiter timeline, and the
D/C/E signals are unaffected.

---

## Slice 1 — Backend event pipeline
**Files:** `src/ai-agents/app/model/proctoring.py` (catalog `Literal` types + `ProctoringEvent` +
`SEVERITY` map + `integrity_score(events)`); `src/ai-agents/app/routes/interview_api.py`
(`POST /interview/{id}/proctor`, scope-checked, batch-capped); `src/ai-agents/app/infra/mcp_data.py`
(`save_proctoring_events` gateway); `src/mcp-data/app/tools.py` + `server.py` (write tool);
`src/mcp-data/app/infra/db.py` (index spec).
- **Tests:** event with an unknown `type` → 422; client-sent severity is ignored (canonical wins);
  a candidate posting to an interview they don't own → 403; a valid batch persists; `integrity_score`
  weights high-severity events. Gate green.

## Slice 2 — Recruiter read + integrity timeline
**Files:** admin report read of `proctoring_events` (comp_id-scoped; mirror `ReportRepository`);
`frontend/apps/company` applicant/report view → an `IntegrityTimeline` component (events + banded
summary). **Tests:** comp-scoped read returns only own-comp events; cross-tenant `application_id`
returns none; FE build + typecheck.

## Slice 3 — FE candidate runtime: D (device/behavior, no assets)
**Files:** `frontend/packages/proctoring` (`ProctorRuntime` + D detectors via Page Visibility /
Fullscreen / Clipboard / paste-length / devtools heuristic / `window.screen` / keystroke timing);
`frontend/packages/shared/src/proctor.ts` (`createProctorClient`); candidate interview page mounts the
runtime behind a **consent gate** (extend the consent model with a `proctoring` scope). **Verify:**
both builds + typecheck; the runtime emits + batches D events; declining consent → no capture.

## Slice 4 — FE candidate runtime: C (audio, no assets)
**Files:** `frontend/packages/proctoring` audio detectors (Web Audio VAD → `second_voice`,
`keyboard_typing`, `synthetic_audio_suspected` *(experimental, clearly labeled)*). **Verify:** builds +
typecheck; mic acquired only after consent; emits C events.

## Slice 5 — FE candidate runtime: B (visual, asset-gated)
**Files:** `frontend/packages/proctoring` visual detectors (MediaPipe FaceLandmarker → gaze/head/lips;
PoseLandmarker → body; FaceDetector → `second_face`; TF.js COCO-SSD → `phone_detected`; luminance →
`camera_occluded`); assets self-hosted under `apps/candidate/public/proctoring/`. Detectors are
registered through a **capability flag**; if assets are absent, B is disabled and the rest is
unaffected. **Verify:** builds + typecheck; with assets present, emits B events; behavioral framing only.

## Slice 6 — E content integrity (backend, no assets)
**Files:** `src/admin/app/resources/aptitude.py` (per-candidate **bank rotation** — select a
per-candidate subset/order from a larger bank; extends the existing order randomization) + a
per-candidate **watermark token** recorded on the delivery (trace leaks). The AI interview's questions
are already per-candidate (generated). **Tests:** two candidates get different selections/watermarks
from the same bank; grading still maps answers correctly. Gate green.

## Verification (end-to-end)
- Per backend slice: `bash scripts/check.sh` GREEN (grows from 413) + `smoke_login --selftest` after
  any transport touch.
- Per FE slice: both app builds + package typechecks green.
- Privacy check: confirm no slice transmits or persists raw frames/audio — only typed events.
- Final: update `HANDOFF.md` (new "Proctoring/Integrity MVP" section) + memory; record the asset
  status of the visual slice + the future "auto-terminate config" and "raw-recording (P4)" follow-ups.
