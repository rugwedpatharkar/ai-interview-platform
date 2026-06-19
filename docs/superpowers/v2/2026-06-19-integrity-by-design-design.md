# Integrity by Design (Non-Surveillance) — Design

> **⛔ SUPERSEDED (2026-06-20).** The non-surveillance "integrity by design" approach is reversed — Aptura now runs a **strict, fully-proctored** interview. See [proctored-integrity](2026-06-20-proctored-integrity.md). Retained for history only; do not implement.

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
   - **Generic-answer detection (the heuristic).** Detection is a **temp-0 LLM classification**, not
     keyword-matching (brittle keyword lists both over-fire on legitimate domain phrasing and miss
     paraphrased templates). The interviewer runs a single judgement pass over the just-given answer +
     the question: *"Is this answer specific and grounded in the candidate's own experience, or
     generic/templated? Reply `specific` or `generic`, plus a confidence 0–1."* The probe fires only
     when the verdict is `generic` **and** confidence ≥ the configured threshold (default **0.75** —
     deliberately conservative so a borderline-fine answer is left alone). Below the threshold the
     interviewer proceeds to the next planned topic exactly as today. The threshold is a tunable
     setting (see Layer 5 / the config knob), never hardcoded, so it can be loosened or tightened
     without a deploy.

2. **Reasoning & curveball prompts.** The blueprint seeds at least one prompt per competency that
   demands *reasoning over recall* (trace/critique/handle-a-twist), which AI-paste handles poorly and
   a real practitioner handles easily.

3. **Per-candidate content integrity (rotation + watermark).** Two candidates for the same role get a
   **different selection/order** of questions, and each delivery carries a **watermark token** (traces
   leaks). Extends the existing aptitude order-randomization; for the AI interview, questions are
   already per-candidate generated. No surveillance — purely content-side.
   - **Watermark = a metadata token, NOT a visual element.** It is **not** a UI overlay, a faint
     background image, or anything rendered on screen. It is an opaque per-delivery identifier
     **recorded on the `AptitudeDelivery` record** (`watermark: str`). Generation: a deterministic
     hash/HMAC over the delivery's identity — `hash(application_id + selected_question_ids + a
     server-side secret)`, truncated to a short token. Because it's derived from the exact served set,
     a leaked question set can be traced back to the delivery (hence the candidate) it came from. It is
     stored once at delivery-creation time and never shown to the candidate; it surfaces only as an
     advisory `watermark`-type signal on the recruiter report.
   - **Rotation seed immutability.** The per-`application_id` selection must stay **stable for the life
     of the application even if the question bank grows.** The seed is used **once, at first delivery,
     to pick a subset/order**, and the **selected question ids are then snapshotted onto the delivery**
     — subsequent reads/re-renders replay that stored snapshot rather than re-deriving from the
     (possibly changed) bank. So adding/removing bank questions after a delivery exists never reshuffles
     an in-flight candidate, never breaks grade-mapping, and keeps the watermark stable.

4. **Advisory consistency signals (no biometrics).** A temp-0 LLM/rule pass compares interview
   substance against the candidate's own claims (résumé skills, aptitude score) and flags **implausible
   inconsistencies** for the recruiter — e.g., a claimed-senior skill the candidate can't reason about,
   or a large aptitude↔interview divergence. Output is a typed, **non-biometric** `IntegritySignal`
   list shown as advisory context on the report. The recruiter judges; nothing is auto-rejected.
   - **Severity algorithm (server-assigned, scaled by the gap).** Severity ∈ `{info, low, medium,
     high}` is derived from the **size of the claim↔evidence gap**, never sent by the client:
     - `claim_inconsistency` — scaled by how far the claimed level sits above the demonstrated level for
       that skill. A small slip (claimed strong, interview reads moderate) → **low**; a wide gap
       (claimed-senior skill the candidate can't reason about at all) → **medium/high**.
     - `aptitude_interview_divergence` — scaled by the **normalized magnitude of the aptitude↔interview
       score divergence**. A modest divergence within normal noise → **info/low**; a large divergence
       (e.g., a top aptitude score against a weak interview, or vice-versa) → **medium/high**.
     The exact bands (what divergence counts as "wide") live with the tunable thresholds (Layer 5), so
     the mapping can be recalibrated without code changes. `generic_answer_flag` and `watermark` are
     informational by nature and carry **info** severity.

5. **Tunable thresholds (config, not constants).** Every knob that decides *when a signal fires* lives
   in **one config/settings surface** (an integrity settings block, e.g. in admin `infra/settings`),
   never as a literal in resource code:
   - `generic_answer_confidence` (default **0.75**) — the Layer-1 probe-fire threshold.
   - `claim_gap_bands` / `divergence_bands` — the Layer-4 cutoffs that map a gap size to
     `low/medium/high`.
   - `divergence_threshold` — the minimum aptitude↔interview gap before `aptitude_interview_divergence`
     is emitted at all.
   This keeps the posture **conservative-by-default** and lets a recruiter-ops change (loosen probing,
   tighten divergence) ship as a config edit, not a code deploy. Defaults are read at call time so a
   running service picks up a change without a rebuild.

## Explicitly OUT (cut — and why it's a strength)

Camera/mic surveillance, gaze/attention tracking, keystroke/typing analysis, browser lockdown,
second-device detection, biometric (face/voice) identity, liveness. Cut because: validated to destroy
trust + trivially bypassed + legal exposure (BIPA, EU AI Act emotion/biometric zones). Their absence
is a marketed feature: *we don't treat candidates as suspects.*

## Data model

`integrity_signals` (advisory, append-only, per interview): `{_id, application_id, comp_id, type, severity, detail, at}` where `type ∈ {generic_answer_flag, claim_inconsistency, aptitude_interview_divergence, watermark}` and `severity ∈ {info, low, medium, high}` — **no media, no biometrics.** Severity is canonical (server-assigned per the Layer-4 gap algorithm, never client). Joins the erasure cascade. Surfaced on the recruiter report as an advisory band, never a gate.

`AptitudeDelivery` gains two fields for content integrity: `watermark: str` (the per-delivery metadata token of Layer 3 — opaque, never rendered to the candidate) and the **snapshotted `question_ids`** (the selected subset/order, frozen at first delivery so a growing bank never reshuffles an in-flight candidate — the seed-immutability guarantee).

**Recruiter advisory band (report UI):** an explicit **positive clean state** when there are no signals — a reassuring "No integrity concerns" rather than silence or an alarm — and an **advisory `info`** band (never a `danger`/red tone) when populated, so a clean candidate is never made to look suspect and a real issue is still visible. Severity drives badge tone only and tops out at `warning`; there is deliberately **no `danger`** tone, because a signal is context for a human, not a verdict. Advisory-only + recruiter-only for v2 (the candidate app is untouched).

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

## Resolved gaps (completeness audit 2026-06-19)

The v2 completeness audit (Part B → "Integrity-by-design") flagged six underspecified points. Each is
now resolved above; summarized here for traceability:

- **Generic-answer heuristic + threshold** — defined as a **temp-0 LLM `specific`-vs-`generic` + confidence**
  classification (not keyword-matching); the probe fires only at confidence ≥ **0.75** (conservative
  default). See Layer 1.
- **Consistency-signal severity algorithm** — `severity ∈ {info, low, medium, high}` is **server-assigned,
  scaled by the claim↔evidence gap** (`claim_inconsistency` by claimed-vs-demonstrated distance;
  `aptitude_interview_divergence` by normalized score gap). See Layer 4.
- **Watermark defined** — a **per-delivery metadata token recorded on `AptitudeDelivery`** (opaque
  `hash(application_id + selected_question_ids + secret)`), **NOT a visual/UI element**; traces leaked
  question sets back to a delivery. See Layer 3 + Data model.
- **Rotation seed immutability** — the per-`application_id` selection is **snapshotted (selected
  `question_ids` frozen) on first delivery** and replayed thereafter, so a growing bank never reshuffles
  an in-flight candidate or breaks grade-mapping. See Layer 3.
- **Tunable threshold knob** — all fire-decision thresholds (`generic_answer_confidence`, `divergence_threshold`,
  the gap→severity bands) live in **one integrity settings/config surface**, read at call time — tunable
  without a deploy. See Layer 5.
- **Advisory band UX balance** — the recruiter band has an explicit **positive "clean" state** and an
  **advisory `info`** populated state (**no `danger` tone**), visible enough to catch real issues but never
  alarmist for clean candidates; reaffirmed **advisory-only + recruiter-only** for v2. See Data model.

## Open questions
- How aggressive should the "generic answer" heuristic be before it nags good candidates? (Resolved
  to a conservative **0.75** confidence default; the threshold is a tunable config knob — revisit the
  value with real data, not the mechanism.)
- Surface integrity signals to the candidate at all (transparency), or recruiter-only? (Default
  recruiter-only for v2; revisit.)
