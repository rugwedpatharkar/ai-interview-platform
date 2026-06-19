# Integrity by Design (Non-Surveillance) — Design

> Pillar in the v2 differentiation layer. Protects interview integrity **without surveillance.**
> Read with `2026-06-19-problems-and-differentiators-design.md` (the why) and the
> `2026-06-19-v2-architecture-overview-design.md` (where it fits). Supersedes the surveillance
> approach in `../plans/2026-06-19-proctoring-integrity-mvp.md`.

## Goal

Make cheating **not worth it** rather than policing candidates. AI-assisted cheating is real and
growing (35% of interviews, 48% in technical roles), but surveillance (gaze/keystroke/lockdown) is
both **bypassable** (secondary devices) and **trust-destroying** (candidates feel criminalised, good
people opt out). v2's integrity comes from how the interview is *designed*, plus **advisory** signals
a human reviews — never automated rejection, never biometric data, never device surveillance.

## Where it fits

- Reuses the existing **adaptive interviewer** (`interviewer.next_question`) and **evaluator** — no
  new "brain."
- Reuses the existing **per-candidate content** mechanism from the aptitude engine (the surviving,
  non-surveillance part of the old proctoring plan's content-integrity "E").
- Emits **advisory** signals onto the recruiter report — same posture as the compliance-ready gate:
  the human decides; integrity never auto-gates.
- All artifacts join the Inc-0 `CandidateEraser` cascade.

## Design — four non-surveillance layers

1. **Adaptive probing (deter by design).** The interviewer already adapts; extend it so that when an
   answer reads as generic/templated, the next turn is a **specific follow-up or "defend it" probe**
   ("walk me through *why*", "what breaks if…", an unexpected constraint). Pre-scripted/AI answers
   don't survive contextual follow-ups. This is prompt-level, in `interviewer.py`; no new infra.

2. **Reasoning & curveball prompts.** The blueprint seeds at least one prompt per competency that
   demands *reasoning over recall* (trace/critique/handle-a-twist), which AI-paste handles poorly and
   a real practitioner handles easily.

3. **Per-candidate content integrity (rotation + watermark).** Two candidates for the same role get a
   **different selection/order** of questions, and each delivery carries a **watermark token** (traces
   leaks). Extends the existing aptitude order-randomization; for the AI interview, questions are
   already per-candidate generated. No surveillance — purely content-side.

4. **Advisory consistency signals (no biometrics).** A temp-0 LLM/rule pass compares interview
   substance against the candidate's own claims (résumé skills, aptitude score) and flags **implausible
   inconsistencies** for the recruiter — e.g., a claimed-senior skill the candidate can't reason about,
   or a large aptitude↔interview divergence. Output is a typed, **non-biometric** `IntegritySignal`
   list shown as advisory context on the report. The recruiter judges; nothing is auto-rejected.

## Explicitly OUT (cut — and why it's a strength)

Camera/mic surveillance, gaze/attention tracking, keystroke/typing analysis, browser lockdown,
second-device detection, biometric (face/voice) identity, liveness. Cut because: validated to destroy
trust + trivially bypassed + legal exposure (BIPA, EU AI Act emotion/biometric zones). Their absence
is a marketed feature: *we don't treat candidates as suspects.*

## Data model

`integrity_signals` (advisory, append-only, per interview): `{_id, application_id, comp_id, type, severity, detail, at}` where `type ∈ {generic_answer_flag, claim_inconsistency, aptitude_interview_divergence, watermark}` — **no media, no biometrics.** Severity is canonical (server-assigned, never client). Joins the erasure cascade. Surfaced on the recruiter report as an advisory band (clean / review), never a gate.

## Compliance posture

Advisory-only + human-decides + zero surveillance/biometric data ⇒ no BIPA / EU-AI-Act-emotion
exposure, and consistent with the demo-first, compliance-ready posture. Consent: the existing
`automated_evaluation` consent already covers AI evaluation; no new sensitive scope.

## Testing approach

Offline (fake LLM at temp 0): adaptive-probe selection is deterministic given a scripted "generic"
answer; consistency signals are pure functions over claims + transcript; watermark/rotation are
deterministic given a seed. No network, no containers, no media — the gate stays offline.

## Key decisions & tradeoffs
- **Deterrence over detection.** We bias toward making cheating unrewarding (adaptive depth) rather
  than catching it (surveillance) — aligns with trust + our cut list.
- **Advisory, never a gate.** Integrity signals inform the human; a false flag never rejects anyone.
- **Reuse, don't rebuild.** Probing rides the existing interviewer; rotation rides the existing
  aptitude content path; consistency reuses the evaluator machinery.

## Open questions
- How aggressive should the "generic answer" heuristic be before it nags good candidates? (Tune the
  probe threshold; default conservative.)
- Surface integrity signals to the candidate at all (transparency), or recruiter-only? (Default
  recruiter-only for v2; revisit.)
