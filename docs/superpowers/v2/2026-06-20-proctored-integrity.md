# Aptura — Proctored Integrity (strict, cheat-proof interview) · spec + plan

> **Direction pivot (2026-06-20, user-confirmed).** Aptura's AI interview is a **strict, fully-proctored,
> live video + voice interview** — camera + mic **required**, **no mute**, fullscreen-locked, all proctoring
> signals live, HIGH-severity cheating **auto-terminates/flags**, and the full integrity timeline is
> **surfaced to recruiters**. **This SUPERSEDES** the old `integrity-by-design` (non-surveillance) pillar.
> The new differentiator: **a result employers can trust** — a pass means something because no one can game it.
> **Grounded in the actual code** (analyzed 2026-06-20), not greenfield: most of this already exists and is
> **activated + hardened**, not built from scratch. **Design/plan only — no code this phase.**

## Why this exists (the pivot)
Old thesis: "the platform that doesn't surveil you." New thesis: **rigorous proctoring is the value** — for
employers, scores they can trust (no cheating, no AI-assisted gaming); for candidates, a level field where
everyone is held to the same strict standard, so *your* pass actually counts. **Kept unchanged:** the
no-ghosting guarantee + merit/evidence-based + human-in-loop. **Removed everywhere:** every "no surveillance /
we never analyze your face / no proctoring" claim (brand, landing, mockups, the integrity-by-design pillar).

## Architecture reality (what's already built — analysis 2026-06-20)
The codebase is **already designed for "proctor everything."** This pillar activates + hardens it.

| Piece | File | Status |
|---|---|---|
| **40-signal proctoring model** (face/gaze/head-move/second-face/phone/camera-occluded/virtual-cam/lips-no-audio · second-voice/synthetic-audio/keyboard · tab/blur/fullscreen-exit/copy/paste/devtools/multi-monitor/screen-share/keystroke/ip-geo) | `src/ai-agents/app/model/proctoring.py` | **BUILT** |
| Server-assigned **severity** (HIGH=8 / MED=3 / LOW=1) + `integrity_score()` weighted sum | `model/proctoring.py:44-76` | **BUILT** |
| `POST /interview/{id}/proctor` (auth, ownership check, type validation, `max_proctor_events` cap, **severity assigned server-side** — client can't spoof) | `routes/interview_api.py:126-149` + `resources/proctoring.py` | **BUILT** |
| `proctoring_events` collection (append-only, "typed events only, never raw media"), indexed `(application_id)`, `(comp_id,application_id)` | `mcp-data/app/tools.py:253-281`, `admin/infra/db.py:46-49` | **BUILT** |
| Frontend **device/behavior** detectors (tab/blur/fullscreen/copy/paste/devtools/multi-monitor/keystroke), 5s batch flush, keepalive | `frontend/packages/shared/src/proctor-runtime.ts`, `proctor.ts` | **BUILT** |
| Frontend **visual (camera)** detectors — face/gaze/second-face/phone… | — | **STUBBED** (catalog defined; `getUserMedia` never called) |
| Frontend **audio (mic)** detectors — second-voice/synthetic-audio | — | **STUBBED** |
| Live video/voice interview (LiveKit; RTC token already grants **VideoGrant**) | `service/voice_worker.py`, `resources/voice/*`, `rtc_token.py` | **PARTIAL** (infra present, not wired to funnel/UI) |
| Proctoring **surfaced in report** / recruiter integrity timeline | report = `model/scoring.py` (no integrity field); `proctoring_events` indexed but **no read API** | **NOT SURFACED** |
| Consent / enforcement | localStorage checkbox, **optional + advisory + non-blocking**; not wired to scoring/funnel | **OPTIONAL** |

**The three gaps to close:** (1) wire the **visual + audio detectors** (camera/mic on-device), (2) make it
**mandatory + strict** (camera required, no mute, fullscreen-locked, required acknowledgment — not optional),
(3) **surface + enforce** (recruiter integrity timeline + hard auto-gate on HIGH signals).

## Target model
- **Modality:** one live, real-time **video + voice** interview (camera + mic **required**). LiveKit carries
  audio + **video**; the session is **recorded** for human review of flags.
- **No mute, no camera-off** once it starts. **Fullscreen-locked**; exiting fullscreen is flagged.
- **All 40 signals live.** Detection is **on-device** (the camera/mic detectors run in the browser; **typed
  events + server-assigned severity** are sent — preserve the existing "never raw media" ingest contract for
  the *signal* path), while the LiveKit session video is recorded separately for review.
- **Enforcement (user-confirmed = options 1 + 2 combined):**
  - **Hard auto-gate on HIGH-severity** signals (`second_face`, `phone_detected`, `screen_share`,
    `virtual_camera`, `synthetic_audio_suspected`): auto-terminate the interview + flag the application.
  - **Surface everything to recruiters** — a full integrity timeline + `integrity_score` in the report; the
    recruiter makes the final call on MEDIUM/LOW flags (the built advisory+severity model + human-in-loop).
- **Kept:** no-ghosting (flagged candidates still get a notified outcome + reason), merit scoring, human review.

## Build plan (TDD, gate-green, task-by-task) — activation + hardening

### Tier A — Strict capture (frontend)
- [ ] **Camera/mic required:** the interview intro becomes a **device pre-check + required acknowledgment**
  (replaces the optional consent checkbox in `apps/candidate/app/interview/[id]/page.tsx`). No camera/mic →
  cannot start. Request fullscreen on start; `getUserMedia({video,audio})`.
- [ ] **Visual detectors** (new `proctor-vision.ts` in `@ip/shared`): on-device face/landmark model
  (e.g. MediaPipe FaceMesh via CDN) → emit `gaze_off_screen`, `head_turned_away`, `body_out_of_frame`,
  `second_face`, `phone_detected`, `camera_occluded`, `lips_move_no_audio`. **No frames leave the device** —
  only the existing typed events to `/proctor`.
- [ ] **Audio detectors** (new `proctor-audio.ts`): on-device VAD/diarization-lite → `second_voice`,
  `synthetic_audio_suspected`, `keyboard_typing`.
- [ ] **No-mute / no-camera-off:** remove mute + camera toggles from the room; show live proctoring status
  chips (One face · Eyes on screen · Fullscreen) + a flag banner. Match the `aptura_proctored_interview_room` mockup.
- [ ] Verify FE build + typecheck.

### Tier B — Live auto-gate (ai-agents)
- [ ] **HIGH-severity hard gate:** in `resources/proctoring.py`, when an ingested batch contains a HIGH signal,
  signal the interview session to **terminate** (set session `terminated_by_proctor`) + record the reason.
  The live room ends; finalize with a `proctor_terminated` outcome.
- [ ] **Funnel/event:** emit the terminate via the interview finalize path; add an application flag (advisory
  or a `gated_out`-style outcome per recruiter policy). Keep `interview.completed` shape; add a sibling
  `interview.terminated` or a payload flag. Decide with the funnel owner (admin).
- [ ] Tests: HIGH signal → terminate; MED/LOW → no terminate (surfaced only); severity is server-assigned.

### Tier C — Surface to recruiters (admin + ai-agents)
- [ ] **Integrity in the report:** add `integrity_score: float` + `integrity_flags: list[ProctorFlag]` to the
  report model (`ai-agents/model/scoring.py` + `admin` report surface); `report_writer` reads
  `proctoring_events` for the application and includes the timeline (it currently does not).
- [ ] **Recruiter integrity timeline:** new read path over `proctoring_events` (comp-scoped) — a gRPC
  `GetIntegrityTimeline(application_id)` on admin (the collection is already indexed `(comp_id,application_id)`)
  → the recruiter report's **integrity band** (severity-grouped events + score + the session recording link).
- [ ] **Recording:** persist the LiveKit session video to MinIO/S3 (tenant-scoped key) for human review; add to
  the `CandidateEraser` cascade.
- [ ] Tests: report includes integrity score + flags; timeline is comp-scoped (forged-`comp_id` rejected).

### Tier D — Recruiter UI (frontend)
- [ ] Report **integrity band** — score ring + severity-grouped flag timeline + recording playback; an
  "auto-terminated for cheating" state. (Update the `aptura_ai_candidate_report` mockup's integrity band.)

## Cross-cutting
- **Eraser:** `proctoring_events` already exists; add the **session recording blobs** to the
  `CandidateEraser` cascade (and any new integrity collections).
- **Compliance note (explicit):** capturing face/gaze/movement + recording video = **biometric + sensitive
  data** — the exact surface the earlier "no compliance" stance avoided. For a personal/demo build this is a
  knowing trade; before any real launch this needs consent, retention limits, and jurisdiction review (BIPA/
  GDPR/EEOC). Tracked as a launch-blocker, not a demo-blocker. (Update [[interview-platform-data-scope]].)
- **Gate:** `bash scripts/check.sh` green (baseline 423); new offline-unsafe detectors stay behind injected
  seams with fakes; on-device vision/audio models load from CDN in the browser only.

## Supersedes
- `2026-06-19-integrity-by-design-design.md` + `2026-06-19-integrity-by-design.md` (the non-surveillance pillar) — **superseded by this doc.**
- `../plans/2026-06-19-proctoring-integrity-mvp.md` — **un-superseded**: its proctoring content is now central; reconcile into this plan.
