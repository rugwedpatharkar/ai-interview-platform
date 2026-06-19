# Compliance-Ready Advisory Gate (Inc 0) — Design

> **Context.** The canonical v2 design `docs/superpowers/v2/2026-06-19-v2-architecture-overview-design.md`
> (esp. §6 "Compliance-ready model" + §8 build phasing) makes this **Inc 0** — the first thing built
> because it touches the funnel seam that every later pillar extends, and it makes new v2 artifacts
> erasable from day one. This is the smallest possible change that turns the auto-rejecting AI gate
> into a **human-decides** gate without removing any feature. Personal project, **local-only — never
> run git/gh.** No production code yet; this is design awaiting review.

## 1. Goal & scope

**In scope.** Make the AI aptitude gate **advisory-capable** so a human recruiter — not the model —
makes the reject decision, configurable **per job**:

- Add `gate_mode: "auto" | "advisory"` to `AptitudeConfig` (`src/admin/app/model/job.py`) + the
  `aptitude_config` proto, so recruiters pick the mode when they configure a job's test.
- Branch `funnel.next_state` on the existing `aptitude.graded` event: **`auto`** (the demo default)
  preserves today's behavior exactly (`pass → interview_pending`, `else → gated_out`); **`advisory`**
  routes **both** outcomes to a **new `ApplicationState.assessment_review`** state, where the recruiter
  advances the candidate (→ `interview_pending`) or gates them (→ `gated_out`/`rejected`).
- Add `assessment_review` to the `ApplicationState` enum and the transitions **out** of it, reusing
  the existing `gate.override` / `recruiter.decision` resource patterns. CAS + per-transition audit
  stay intact — **the funnel remains the only integration seam; nothing side-channels around it.**
- **Extend `CandidateEraser`** to purge every **new v2 artifact collection** (assessment attempts,
  code submissions, messages, message threads, notifications, practice sessions, video answers) —
  wiring the extension points now so later pillars just slot their repo in.
- Document the **permanent cut list** (ID verification, background checks, biometric face/voice
  proctoring) and the **wired-but-dormant** behavioral proctoring, and recommend `advisory` as the
  **production** default (`auto` stays the demo default).

**Out of scope (deferred / explicitly not built here).** No UI work beyond noting where the recruiter
control lands (Pillar D / recruiter workspace owns the actual screen). No new event types — `advisory`
reuses `aptitude.graded`, `gate.override`, and `recruiter.decision`. No new infra. No proctoring is
enabled. The artifact collections themselves (messages, code_submissions, …) are **created by their
own pillars**; Inc 0 only designs the **eraser extension points** so they are erasable the moment they
exist. YAGNI: one new state, one config field, one branch.

## 2. Where it fits

```
            aptitude.graded {passed}                recruiter action
  aptitude_pending ───────────────┐         ┌──────────────────────────► interview_pending
                                  │         │  gate.override / advance
                  ┌───────────────┴───────┐ │
  gate_mode=auto  │  next_state branches  │ ├──────────────────────────► gated_out / rejected
  (demo default)  │   on the job's        │ │  recruiter.decision(reject)
                  │   gate_mode           │ │
                  └───────────────┬───────┘ └── assessment_review  ◄─── gate_mode=advisory
                                  │                 (NEW state)         (BOTH pass & fail land here)
  auto: pass → interview_pending  │
        else → gated_out          ▼
                          AuditLog per transition (unchanged) · CAS (unchanged)
```

This is a **targeted evolution of Module 4 (Applications & Funnel)** and **Module 15 (Trust /
Operational)** from the architecture overview's module map — not a new service, not a new event
plane. The integration boundary is exactly the three files the rest of the platform already trusts:

- **`lib/lib/schemas/enums.py`** — `ApplicationState` gains `assessment_review`. (`FunnelEvent`
  needs **no** new member: advisory reuses `aptitude.graded` to enter the state and the existing
  `gate.override` / `recruiter.decision` to leave it.)
- **`src/admin/app/resources/funnel.py`** — `next_state` reads `gate_mode` off the `aptitude.graded`
  payload and branches; `advance_application` (CAS + `AuditLog` + optional notifier) is unchanged.
- **`src/admin/app/model/job.py`** — `AptitudeConfig.gate_mode`, defaulting to `auto`.

The producer of `aptitude.graded` (`src/admin/app/resources/aptitude.py`, `grade_aptitude`) already
loads the job's `aptitude_config`; it adds `gate_mode` to the event payload so `next_state` can branch
without a second job read.

## 3. Design

### 3.1 Gate modes (`AptitudeConfig.gate_mode`)

`AptitudeConfig` today (`model/job.py`) is `topics / num_questions / time_limit_min / pass_threshold`.
Add one field:

```python
gate_mode: Literal["auto", "advisory"] = "auto"
```

- **`auto`** — the **demo default**. Behavior is **byte-for-byte today's**: a passing grade advances
  to `interview_pending`, a failing grade goes to `gated_out`. Nothing changes for existing jobs or
  the existing 423-test baseline; the field is additive with a default, so deserializing an old job
  doc yields `auto`.
- **`advisory`** — the **recommended production default**. The grade is computed and recorded exactly
  as today (score, `passed`, the `aptitude.graded` event), but the funnel routes **both** pass and
  fail into `assessment_review`. The AI's pass/fail becomes a **recommendation** the recruiter sees;
  the human makes the keep/reject call. **No candidate is ever auto-rejected out of the funnel.**

The proto for `aptitude_config` (recruiter-facing job config RPC) gains a matching `gate_mode` string
field so recruiters set it per job. Validation lives at that boundary (the enum/`Literal` is the
contract); `next_state` trusts the stored value and treats anything not `advisory` as `auto` (fail
open to the *safe, behavior-preserving* mode, never silently into `advisory`).

> **Why a per-job field, not a global flag.** Different roles carry different legal exposure (a
> high-volume role in NYC vs. an internal transfer). Per-job `gate_mode` lets one tenant run `auto`
> for a demo job and `advisory` for a regulated one — the field rides on the config the recruiter
> already edits, so there is no new surface.

### 3.2 The new state + transitions

Add to `ApplicationState` (between `gated_out` and `interview_pending`, conceptually a hold):

```python
assessment_review = "assessment_review"   # advisory mode: a human decides post-grade
```

`next_state` branches the **one** existing line for `aptitude.graded`:

```python
if event == E.aptitude_graded and current == S.aptitude_pending:
    if payload.get("gate_mode") == "advisory":
        return S.assessment_review            # human decides; neither auto-advance nor auto-reject
    return S.interview_pending if payload.get("passed") else S.gated_out
```

**Transitions out of `assessment_review`** (recruiter-driven, audited, reusing existing events):

| From | Event | To | Resource path |
|---|---|---|---|
| `assessment_review` | `gate.override` | `interview_pending` | `decision.override_gate` (extend its legal from-states) |
| `assessment_review` | `recruiter.decision` (`outcome=rejected`) | `rejected` | `decision.decide_application` |
| `assessment_review` | `application.withdrawn` | `withdrawn` | edge exit (already non-terminal) |
| `assessment_review` | `application.expired` | `expired` | edge exit (already non-terminal) |

- **Advance (keep the candidate):** reuse `gate.override`. Today it maps `gated_out → interview_pending`;
  extend the guard so it also maps `assessment_review → interview_pending`. Same audited path, same
  `_require_manager` + `comp_id` scoping in `decision.override_gate` — the recruiter "overrides" the
  advisory hold the same way they override a hard gate.
- **Reject (gate the candidate out):** `recruiter.decision` with `outcome="rejected"`. This requires
  adding `assessment_review` to the `recruiter_decision` legal from-states (today `{scored, shortlisted}`)
  **and** allowing `rejected` from it. `decide_application` already validates `outcome ∈ DECISIONS`
  and writes the audit row — a deliberate, human, logged rejection, never the model's.
- **Edge exits** (`application.withdrawn`, `application.expired`) work for free: `assessment_review`
  is **not** in `_TERMINAL`, so the existing "any non-terminal" guards already cover it. It is **not**
  in `DECISIONS` and **not** in `_TERMINAL`.

Everything flows through `advance_application`, so each move keeps the **CAS** (`set_state_if` — a
redelivered event or concurrent writer that already produced the target is a logged no-op, not a
duplicate audit row) and writes one `AuditLog` (`entity="application"`, `action=<event>`, `from_state`,
`to_state`, `comp_id`). The advisory hold is therefore as audit-complete as every other transition.

> **`assessment_review` is non-terminal and non-retryable.** It is *not* added to `_RETRYABLE_EVENTS`
> logic (that frozenset is about the `interview.completed`/`scoring.completed` ordering race between
> two ai-agents events; advisory entry/exit are not part of that race). An illegal move into/out of
> it is a genuine `InvalidTransition`, surfaced — not requeued.

### 3.3 Erasure-cascade extension (the most important follow-through)

`CandidateEraser.erase(user_id)` (`resources/compliance.py`) today cascades into **reports** (by the
candidate's applications), **interviews/transcripts** (by user), **aptitude attempts** (by candidate),
and the **consent ledger** (by user), then deletes the profile + resume and anonymizes the user
(keeping `_id` so applications + audit stay intact). v2 introduces seven new artifact collections that
hold candidate data; **erasure must reach all of them** or a right-to-erasure leaves residue.

The extension keeps the existing shape: each artifact repo is an **injected dependency** with a
`delete_by_<key>` coroutine, called inside `erase` (and therefore inside `sweep`, which just loops
`erase` over the retention cutoff). The new artifacts and their erase keys:

| Collection (new pillar) | Erase method | Keyed by | Why it holds PII |
|---|---|---|---|
| `assessment_attempts` (Pillar B) | `delete_by_candidate(user_id)` | candidate | answers + scores (supersedes/【joins】 `aptitude_attempts`) |
| `code_submissions` (Pillar B) | `delete_by_candidate(user_id)` | candidate | submitted source code |
| `messages` (Pillar D) | `delete_by_user(user_id)` | sender/recipient | candidate↔recruiter content |
| `message_threads` (Pillar D) | `delete_by_user(user_id)` | participant | thread membership/metadata |
| `notifications` (Pillar D) | `delete_by_user(user_id)` | recipient | per-candidate feed rows |
| `practice_sessions` (Pillar D) | `delete_by_user(user_id)` | candidate | self-serve interview transcripts |
| `video_answers` (Pillar C) | `delete_by_user(user_id)` | candidate | recorded clips (+ MinIO objects) |

**Design now, slot in later.** Inc 0 adds the **constructor parameters** and the **`erase()` call
sites** for all seven, each guarded so an unconfigured/None repo is skipped (the artifact's pillar
hasn't shipped yet). The pattern mirrors the existing best-effort resume delete: the cascade is a
sequence of awaited deletes; a `video_answers` purge that also removes MinIO objects wraps its
storage call in try/except + `log.exception` (best-effort, like `storage.delete_raw` today) so a
blob-store hiccup never blocks anonymizing the user. This is the single most important compliance
follow-through called out in the architecture overview §6 — it is why Inc 0 ships first.

> **Open seam vs. premature collections.** We do **not** create the seven collections or their
> repositories in Inc 0 — that is each pillar's job. We add the **eraser extension points** (params +
> call sites + the `delete_by_*` repo contract) so the moment Pillar B writes the first
> `code_submission`, it is already erasable. The fake-repo test pattern (`Fake*Repo` with
> `delete_by_*` in `tests/conftest.py`) is the template each pillar extends.

### 3.4 Kept · Cut · Dormant

**Kept as mitigations (no behavior change — documented *why* they suffice):**

- **Audit log per transition** — `advance_application` already writes one `AuditLog` per state change,
  including the new advisory entry/exit. This is the AEDT decision trail.
- **Consent ledger** — the `automated_evaluation` scope (`resources/compliance.py`, GDPR Art. 22
  territory) is the candidate's explicit consent to AI scoring; unchanged.
- **Erasure** — extended per §3.3; right-to-erasure + retention sweep.

**Cut permanently (standalone legal regimes + paid third-party vendors for ~zero demo value):**

- **ID / identity verification** — never built.
- **Background / reference checks** — never built.
- **Biometric (face / voice *identity*) proctoring** — never built.

**Wired-but-dormant:**

- **Behavioral proctoring** (gaze / audio / device signals) — the `proctoring_events` collection
  already exists in admin's index authority (`infra/db.py`); the signal stays **built, consent-gated,
  and flag-off**. Not enabled by Inc 0; not removed. (Distinct from biometric *identity* proctoring,
  which is cut.)

## 4. Key decisions & tradeoffs

1. **Reuse `aptitude.graded` + `gate.override` + `recruiter.decision`; add no new events.** The funnel
   is the integration seam (architecture overview §7). Advisory is a *routing* change, not a new
   message. Tradeoff: `next_state` reads `gate_mode` from the event payload, so `grade_aptitude` must
   put it there — a one-line additive change at the producer, vs. a second job lookup inside the
   funnel. We choose the payload field (the funnel stays storage-free and pure).
2. **`auto` is the demo default; `advisory` is the recommended production default.** Demos want the
   full automated funnel visible end-to-end; production wants a human decider for AEDT compliance.
   One per-job field flips it — "commercializing later is a config flip, not a rebuild" (overview §2).
3. **One new state, not two.** Both pass and fail land in `assessment_review` (not separate
   `review_pass` / `review_fail` states). The grade is still recorded (`AptitudeAttempt.passed`,
   shown to the recruiter as the recommendation); splitting states would double the transition matrix
   for no behavioral gain. Minimal-code wins.
4. **Advance reuses `gate.override`, not a brand-new "approve" event.** Semantically a recruiter
   advancing past an advisory hold *is* overriding the gate; reusing it means zero new resource code
   and an audit `action` (`gate.override`) reviewers already understand. Tradeoff: we widen
   `gate.override`'s legal from-states (`gated_out` **and** `assessment_review`) — acceptable, both
   mean "human says proceed past the aptitude gate."
5. **Fail-open to `auto`, never to `advisory`.** If `gate_mode` is missing/garbled, `next_state`
   treats it as `auto` (behavior-preserving). Failing into `advisory` would silently strand
   applications in a manual-review state on bad config — worse than preserving today's automated path.
6. **Erasure extension points now, collections later.** Adding seven `delete_by_*` call sites to
   `CandidateEraser` before the collections exist looks premature, but it is the cheapest way to
   guarantee no v2 artifact ever escapes erasure — the alternative (remembering to touch the eraser in
   each of seven later pillars) is exactly how PII residue happens. The guarded/None-skip pattern keeps
   the gate green while collections are absent.
7. **Behavioral proctoring dormant, not deleted.** Keeping `proctoring_events` wired (flag-off,
   consent-gated) preserves optionality without regulatory exposure; deleting it would forfeit a built
   capability for no compliance benefit (it is already off).

## 5. Testing approach

TDD, all offline, repo boundary mocked (the `fakes` fixture + `Fake*Repo` pattern in
`src/admin/tests/conftest.py`). The baseline gate is **423 tests** (`bash scripts/check.sh`); this
increment grows it.

- **`next_state` branch (pure function — failing test first):** extend `test_resources_funnel.py`.
  Assert `auto` mode is unchanged (`pass → interview_pending`, `fail → gated_out`); assert `advisory`
  routes **both** `{passed: True}` and `{passed: False}` to `assessment_review`; assert a
  missing/garbled `gate_mode` falls open to `auto`. These mirror the existing `test_next_state_happy_path`.
- **Transitions out of `assessment_review`:** `gate.override` → `interview_pending`;
  `recruiter.decision(outcome="rejected")` → `rejected`; `application.withdrawn` → `withdrawn`. Assert
  an illegal move (e.g. `scoring.completed` from `assessment_review`) raises `InvalidTransition`.
- **`advance_application` through the new state:** assert the `AuditLog` row is written
  (`from_state="assessment_review"`, correct `action`/`to_state`/`comp_id`) and the CAS no-op holds on
  a redelivered advisory entry (reuse the `_RaceRepo` pattern).
- **Resource layer:** `decision.override_gate` and `decide_application` advance an `assessment_review`
  application with `_require_manager` + `comp_id` scoping enforced (extend
  `test_resources_decision.py`); `grade_aptitude` puts `gate_mode` on the `aptitude.graded` payload
  (extend `test_resources_aptitude.py`, asserting the published event dict).
- **Eraser cascade:** extend `test_resources_compliance.py`'s `test_erase_cascades_into_ai_artifacts`
  to seed the new artifact fakes and assert each is emptied after `erase`; assert a `None`/absent repo
  is skipped without error (so the gate stays green before pillars ship); assert a raising
  `video_answers` blob delete is logged and does not block anonymization.
- **Model:** `AptitudeConfig` defaults `gate_mode` to `"auto"`; an old job doc without the field
  deserializes to `auto`.
- **Gate + smoke:** `bash scripts/check.sh` green (ruff format+lint S-rules line-88, pip-audit, pytest
  ×5); `python scripts/smoke_login.py --selftest` still boots admin's gRPC-web app (proto change loads).

## 6. Open questions

- **Recruiter UI for `assessment_review`** lands in Pillar D (recruiter workspace). Inc 0 only proves
  the state + transitions; does the recruiter screen need a distinct "advisory review" queue, or does
  `assessment_review` just appear as a filterable applicant status? (Defer to the marketplace/workspace
  spec; the funnel exposes it as a normal state regardless.)
- **Aptitude → assessments overlap (Pillar B).** Inc 0 extends the eraser for `assessment_attempts`
  while `aptitude_attempts` still exists. When Pillar B's typed assessment engine subsumes the MCQ
  attempts, do we keep both `delete_by_candidate` calls or migrate? (Both are cheap idempotent deletes;
  resolve when Pillar B lands — Inc 0 keeps both wired.)
- **Notifications on advisory entry.** Should entering `assessment_review` notify the recruiter via the
  Pillar D notifier (a pending-review nudge)? The `advance_application` notifier hook already fires per
  transition; the *content* is the notifications-center spec's call. Flagged, not decided here.
- **`gate_mode` default per tenant.** Should a tenant be able to set an org-wide default `gate_mode`
  that new jobs inherit (vs. always `auto`)? Out of scope for Inc 0 (per-job only); noted for the
  recruiter-workspace settings surface.
