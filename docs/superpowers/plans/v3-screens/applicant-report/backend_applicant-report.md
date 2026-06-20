# Backend — `applicant-report` (Midnight v3)

> **Screen:** AI candidate report + integrity band · **FE consumer:** [`frontend_applicant-report.md`](./frontend_applicant-report.md)
> **Status:** **EXISTING — reuse v2.** Restated from [`../../v2-screens/candidate-report.md`](../../v2-screens/candidate-report.md)
> (§A1 the new integrity read path, §A2 the extended report message). The Midnight redesign is **appearance-only** —
> it adds **no** proto delta, no new collection, no new endpoint beyond what the v2 contract already specifies.
> **Real-vs-mock today:** the **report** path (`Report.GetReport` with the scoring-window poll) is **live**. The
> **integrity timeline** (`Report.GetIntegrityTimeline`) and the report's competency/integrity scalars are the v2
> deltas; the FE codes against `integrity-client.ts` (`USE_MOCK`) + protobuf default-filled scalars until they land.

**Scope note:** this contract covers **behavioral / audio-visual proctoring only**. Biometric **identity matching is
OUT of scope** — the DTO carries no "identity verified" field and no voiceprint/face-match assertion. The integrity
timeline exposes only `{type, severity, at, meta}` per flag plus an aggregate score and an optional recording.

## Functionalities
- **Get** the AI interview report for an application (exec summary, highlights, risks, overall score, recommendation).
- **Get** the per-competency detail with **evidence quotes** (competency, score, rationale, evidence[]).
- **Get** the **integrity timeline** — the first read over the write-only `proctoring_events` (flags, integrity
  score, recording URL, auto-terminated state).
- **Decide** on the candidate (advance / shortlist / decline) — the audited decision control (existing
  `decideApplication` / `overrideGate`; notifies the candidate).
- (Sibling tabs) **Schedule** + **Messages** — existing `SchedulingService` / `MessagingService`, unchanged here.

## Service & RPCs (`admin` gRPC `Report` service)
| Function | RPC | Auth/scope |
|---|---|---|
| Get report | `api.reports.getReport({ applicationId })` → `Report.GetReport` | bearer; **comp-scoped** (recruiter sees only own company) |
| Get integrity timeline | `api.reports.getIntegrityTimeline({ applicationId })` → `Report.GetIntegrityTimeline` **(NEW v2 RPC)** | bearer; **comp-scoped** — biometric-adjacent, forged `comp_id` rejected |
| Record decision | existing `decideApplication` / `overrideGate` (via `DecisionControl`) | bearer; comp-scoped; **audited**, notifies candidate |

- **`GetIntegrityTimeline` is the first reader** of `proctoring_events` (append-only, write-only today; ingested by
  ai-agents `POST /interview/{id}/proctor`; indexed `(application_id)` and `(comp_id, application_id)`). Comp-scoping
  is a **hard acceptance criterion**, tested at the resource layer.

## Request / Response structures
**`GetReport` → `Report`** (camelCase per protobuf-es on the FE):
```
{ applicationId, state, executiveSummary, highlights[], risks[], overallScore /*0..1*/,
  recommendation /*"advance"|"hold"|"reject"*/,
  competencies: [{ competency, score /*0..1*/, rationale, evidence: [{ quote, note }] }],
  integrityScore /*0 legacy*/, integrityFlagCount, autoTerminated }
```
**`GetIntegrityTimeline({ applicationId })` → `IntegrityTimeline`:**
```
{ integrityScore /*weighted sum; higher = more concerning*/,
  flags: [{ type /*ProctoringEventType*/, severity /*"low"|"medium"|"high", server-authoritative*/,
            at /*ISO*/, meta /*map<string,string>; never raw media*/ }],
  recordingUrl /*tenant-scoped presigned; "" when none*/, autoTerminated, terminatedReason }
```
**FE mock shape** (`app/jobs/[id]/applicants/[appId]/types.ts` + `integrity-client.ts`) — what the screen codes
against before the RPC lands: `ReportDTO`, `IntegrityTimeline`, `ProctorFlag`, `Competency`, `Evidence`, and the
`HIGH_SIGNALS` catalog (`second_face, second_voice, phone_detected, screen_share, virtual_camera,
synthetic_audio_suspected`). Severity is never client-sent — `severity_of()` is the single source.

## Data required
- **Read** `reports`/scoring output (ai-agents `model/scoring.py`) for the report body; `competencies` promoted from
  `Evaluation.competency_scores` with `evidence`.
- **Read** `proctoring_events` filtered by `(comp_id, application_id)`, sorted `at asc`, for the timeline;
  `integrityScore = proctoring.integrity_score(events)`, `severity = proctoring.severity_of(type)` (reuse the
  weights — do not reimplement). `autoTerminated`/`terminatedReason` from the interview session's
  `terminated_by_proctor` finalize flag (default `false`/`""`).
- **Recording:** `recordingUrl` is the tenant-scoped presigned key for the persisted LiveKit session video; `""`
  when none; part of the `CandidateEraser` cascade.
- **Excluded from the DTO (grep-test):** raw frames/audio, voiceprints, affect/emotion inferences, identity-match
  results, other applications' events.

## Errors & edge cases
- `GetReport` not yet scored → `NOT_FOUND` → FE polls every 3 s with the auto-updating "being generated" alert.
- `GetIntegrityTimeline` with no events → **clean `200`** `{ integrityScore: 0, flags: [], recordingUrl: "",
  autoTerminated: false }` (distinct from the report 404) → FE empty-state "No proctoring flags".
- Forged / mismatched tenant `comp_id` → `NOT_FOUND` / `PERMISSION_DENIED` (never leak another company's timeline).
- `UNAVAILABLE` / transient → report poll continues; integrity is non-blocking (inline warning, report still renders).
- Legacy report (pre-extend) → empty `competencies`, `0`/`false` integrity scalars deserialize cleanly; FE renders
  the flat view.

## Cross-references
- Restates: [`../../v2-screens/candidate-report.md`](../../v2-screens/candidate-report.md) §A1 (`GetIntegrityTimeline`)
  + §A2 (`Report` competency/integrity extension).
- Pillar: proctored-integrity (Tier C — recruiter integrity timeline; Tier D — decision control). Behavioral/AV
  scope only; identity matching excluded.
- Shared enum: `ProctoringEventType` / `severity_of()` (ingest contract); `ApplicationState` (decision transitions).
- Sibling tabs reuse `SchedulingService` (`scheduling.md`) and `MessagingService` (`messaging.md`) unchanged.
