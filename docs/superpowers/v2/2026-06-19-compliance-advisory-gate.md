# Compliance-Ready Advisory Gate (Inc 0) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this task-by-task. Steps use `- [ ]` checkboxes.
> Spec: `docs/superpowers/v2/2026-06-19-compliance-advisory-gate-design.md`. Canonical v2 design:
> `docs/superpowers/v2/2026-06-19-v2-architecture-overview-design.md` (§6, §8 — this is **Inc 0**).

**Goal:** Make the AI aptitude gate **advisory-capable** so a **human recruiter** decides post-grade,
configurable per job via `AptitudeConfig.gate_mode`. `auto` (demo default) preserves today's behavior;
`advisory` (recommended production default) routes **both** pass and fail into a new
`ApplicationState.assessment_review` state the recruiter resolves. Extend `CandidateEraser` to every new
v2 artifact collection. The funnel stays the only integration seam; CAS + per-transition audit are
untouched.

**Architecture:** One config field (`gate_mode`), one new enum member (`assessment_review`), one branch
in `funnel.next_state`, and recruiter exits that **reuse** the existing `gate.override` /
`recruiter.decision` resources. No new events, no new infra, no new service. The eraser gains seven
guarded `delete_by_*` call sites (params + sites now; the collections arrive with their pillars).

## Global Constraints

- **LOCAL-ONLY — never run git/gh.** The skill's "commit" steps are replaced by **"run the gate"**:
  `bash scripts/check.sh` (ruff format+lint S-rules line-88, pip-audit, pytest ×5) must stay green;
  baseline today is **423 tests**. Also boot the gRPC-web app once via
  `python scripts/smoke_login.py --selftest` after the proto change (admin is gRPC, not FastAPI).
- **Behavior preservation first (per `~/.claude/CLAUDE.md`).** `auto` mode is **byte-for-byte today's**
  funnel. The 423 baseline tests must not change meaning; new behavior is additive and default-off.
- **Minimal / trust-the-system / validate-at-boundaries.** No defensive coercion on typed internal
  calls; validation lives at the proto boundary (`gate_mode` is a `Literal`/enum). `next_state` trusts
  the stored value and **fails open to `auto`** (never silently into `advisory`).
- **Funnel is the seam.** Every state change goes through `funnel.advance_application` (CAS + `AuditLog`).
  No side-channel writes to `applications.state`. `assessment_review` is **not** terminal, **not** in
  `DECISIONS`, **not** in the `_RETRYABLE_EVENTS` race set.
- **Tests mock the repo boundary** — reuse the `fakes` fixture + `Fake*Repo` pattern in
  `src/admin/tests/conftest.py`. All offline; no network.
- **Multi-tenant `comp_id`** is enforced by the existing `decision._scoped` / `_require_manager`; the
  new transitions inherit it for free.

---

## File structure (new + modified)

```
lib/lib/schemas/enums.py                       (+ ApplicationState.assessment_review)

src/admin/app/
  model/job.py                                 (+ AptitudeConfig.gate_mode: Literal["auto","advisory"])
  resources/funnel.py                          (next_state: branch aptitude.graded on gate_mode;
                                                 widen gate.override + recruiter.decision from-states)
  resources/aptitude.py                        (grade_aptitude: put gate_mode on aptitude.graded payload)
  resources/decision.py                        (override_gate/decide_application now legal from
                                                 assessment_review — no code change if guard lives in funnel)
  resources/compliance.py                      (CandidateEraser: +7 injected artifact repos + erase() sites)
  proto/ (aptitude_config message)             (+ gate_mode string field — recruiter sets per job)

src/admin/tests/
  conftest.py                                  (+Fake{AssessmentAttempt,CodeSubmission,Message,
                                                 MessageThread,Notification,PracticeSession,VideoAnswer}Repo
                                                 with delete_by_*; add to the `fakes` fixture)
  test_resources_funnel.py                     (advisory branch + assessment_review transitions)
  test_resources_decision.py                   (advance/reject from assessment_review, comp_id scoped)
  test_resources_aptitude.py                   (gate_mode on the published aptitude.graded payload)
  test_resources_compliance.py                 (eraser cascade into new artifacts; None-repo skip)
  test_model_job.py                            (gate_mode default + old-doc deserialize)
```

**Responsibilities (one job each):** `enums.py` = the state vocabulary. `funnel.py` = the only place a
transition is decided (pure `next_state`) + applied (`advance_application`). `aptitude.py` = supplies
`gate_mode` on the event so the funnel stays storage-free. `decision.py` = the recruiter's audited
exits (reused). `compliance.py` = the erasure cascade. Keep the testable logic free of any new infra —
the gate stays offline.

---

## TIER A — the enum + model (smallest surface, unblocks the branch)

### Task 1 — `ApplicationState.assessment_review` (enum)
**Files:** Modify `lib/lib/schemas/enums.py`.
**Deliverable:** the new state exists in the shared vocabulary; `lib` tests green.

- [ ] **Step 1 — failing test (lib):** add a test asserting `ApplicationState.assessment_review ==
  "assessment_review"` and that it is a member of the enum. Run `(cd lib && ../.venv/bin/python -m
  pytest -q)` → FAIL (no such member).
- [ ] **Step 2 — implement:** add `assessment_review = "assessment_review"` to `ApplicationState`
  (place it after `gated_out`, conceptually a post-grade hold). **Do not** add a `FunnelEvent` member —
  advisory reuses `aptitude.graded` / `gate.override` / `recruiter.decision`.
- [ ] **Step 3 — run → PASS.** `(cd lib && ../.venv/bin/python -m pytest -q)` green.

### Task 2 — `AptitudeConfig.gate_mode` (model + proto) (TDD)
**Files:** Modify `src/admin/app/model/job.py`, the `aptitude_config` proto message; Test
`src/admin/tests/test_model_job.py` (create if absent — mirror an existing model test).
**Interfaces — Produces:** `AptitudeConfig.gate_mode: Literal["auto", "advisory"] = "auto"`.

- [ ] **Step 1 — failing test:** assert `AptitudeConfig().gate_mode == "auto"`; assert
  `AptitudeConfig(gate_mode="advisory").gate_mode == "advisory"`; assert an old-shaped dict
  (`{"topics": [], "num_questions": 10}`) deserializes with `gate_mode == "auto"` (additive default).
  Run admin tests → FAIL.
- [ ] **Step 2 — implement model:** add `gate_mode: Literal["auto", "advisory"] = "auto"` to
  `AptitudeConfig` (import `Literal` from `typing`). Default keeps every existing job on today's path.
- [ ] **Step 3 — proto:** add `string gate_mode = N;` to the `aptitude_config` message so recruiters set
  it per job; regenerate stubs per the project's proto build. The RPC handler maps it onto
  `AptitudeConfig` (validation is the `Literal`/enum at this boundary).
- [ ] **Step 4 — run → PASS** + `python scripts/smoke_login.py --selftest` boots the gRPC-web app
  (confirms the regenerated proto loads). Gate green.

---

## TIER B — the funnel branch (the core change, failing test first)

### Task 3 — `next_state` advisory branch (TDD — pure function)
**Files:** Modify `src/admin/app/resources/funnel.py`; Test `src/admin/tests/test_resources_funnel.py`.
**Interfaces — Consumes:** `payload["gate_mode"]`, `payload["passed"]` on `aptitude.graded`.
**Produces:** `aptitude_pending --aptitude.graded--> assessment_review` when `gate_mode == "advisory"`
(both outcomes); unchanged otherwise.

- [ ] **Step 1 — failing tests** in `test_resources_funnel.py` (mirror `test_next_state_happy_path`):
```python
def test_next_state_auto_mode_unchanged():
    assert next_state("aptitude_pending", "aptitude.graded",
                      {"passed": True, "gate_mode": "auto"}) == "interview_pending"
    assert next_state("aptitude_pending", "aptitude.graded",
                      {"passed": False, "gate_mode": "auto"}) == "gated_out"
    # missing gate_mode falls open to auto (behavior-preserving)
    assert next_state("aptitude_pending", "aptitude.graded",
                      {"passed": False}) == "gated_out"

def test_next_state_advisory_routes_both_outcomes_to_review():
    assert next_state("aptitude_pending", "aptitude.graded",
                      {"passed": True, "gate_mode": "advisory"}) == "assessment_review"
    assert next_state("aptitude_pending", "aptitude.graded",
                      {"passed": False, "gate_mode": "advisory"}) == "assessment_review"
```
- [ ] **Step 2 — run → FAIL** (no `assessment_review` branch).
- [ ] **Step 3 — implement** the single branch in `next_state` (keep `S = ApplicationState`,
  `E = FunnelEvent`):
```python
    if event == E.aptitude_graded and current == S.aptitude_pending:
        if payload.get("gate_mode") == "advisory":
            return S.assessment_review
        return S.interview_pending if payload.get("passed") else S.gated_out
```
- [ ] **Step 4 — run → PASS.** Confirm the existing `test_next_state_happy_path` (no `gate_mode` key)
  still passes — it omits `gate_mode`, so it falls open to `auto`. **The 423 baseline is preserved.**

### Task 4 — transitions OUT of `assessment_review` (TDD)
**Files:** Modify `src/admin/app/resources/funnel.py`; Test `test_resources_funnel.py`.
**Produces:** recruiter exits `gate.override → interview_pending`, `recruiter.decision(rejected) →
rejected`; edge exits (`withdrawn`/`expired`) already covered.

- [ ] **Step 1 — failing tests:**
```python
def test_next_state_advisory_exits():
    assert next_state("assessment_review", "gate.override", {}) == "interview_pending"
    assert next_state("assessment_review", "recruiter.decision",
                      {"outcome": "rejected"}) == "rejected"
    # edge exits work because assessment_review is non-terminal
    assert next_state("assessment_review", "application.withdrawn", {}) == "withdrawn"

def test_next_state_advisory_illegal_exits_raise():
    with pytest.raises(InvalidTransition):
        next_state("assessment_review", "scoring.completed", {})
```
- [ ] **Step 2 — run → FAIL.**
- [ ] **Step 3 — implement** by widening two existing guards (do **not** add new events):
  - `gate.override`: legal from `S.gated_out` **or** `S.assessment_review` →
    `return S.interview_pending`.
  - `recruiter.decision`: add `S.assessment_review` to the legal `current` set
    (today `(S.scored, S.shortlisted)`); the existing `outcome ∈ DECISIONS` check already produces
    `rejected`. (No change needed for `withdrawn`/`expired` — `assessment_review ∉ _TERMINAL`.)
- [ ] **Step 4 — run → PASS.** Add an `advance_application` test asserting the `AuditLog` row for an
  advisory exit (`from_state="assessment_review"`, `action`, `to_state`, `comp_id`) and a CAS no-op on
  a redelivered advisory **entry** (reuse the `_RaceRepo` pattern). Gate green.

---

## TIER C — wire the producer + recruiter resources

### Task 5 — `grade_aptitude` emits `gate_mode` on the event (TDD)
**Files:** Modify `src/admin/app/resources/aptitude.py`; Test `test_resources_aptitude.py`.
**Rationale:** `next_state` reads `gate_mode` from the `aptitude.graded` payload so the funnel needs no
second job read. `grade_aptitude` already loads `config = job["aptitude_config"]`.

- [ ] **Step 1 — failing test:** drive `grade_aptitude` to completion (existing fixtures) with a job whose
  `aptitude_config.gate_mode == "advisory"`; assert the published event dict is
  `{"application_id": ..., "passed": ..., "gate_mode": "advisory"}`. (Use `FakePublisher` — assert on
  its recorded publishes.) Default-job test asserts `gate_mode == "auto"`.
- [ ] **Step 2 — run → FAIL** (payload lacks `gate_mode`).
- [ ] **Step 3 — implement:** add `gate_mode` to the `publisher.publish("aptitude.graded", {...})`
  payload, read from the already-loaded `config` (`config.get("gate_mode", "auto")`). One line; no extra
  fetch.
- [ ] **Step 4 — run → PASS.** Gate green.

### Task 6 — recruiter advance/reject from `assessment_review` (TDD — resource layer)
**Files:** Test `src/admin/tests/test_resources_decision.py`; `decision.py` needs **no** change if the
legal from-states live in `funnel.next_state` (Task 4) — verify and only touch `decision.py` if a guard
there blocks it.
**Rationale:** prove the human exits with `comp_id` scoping + manager-role enforcement intact.

- [ ] **Step 1 — failing/така tests:** seed an application in `assessment_review` (via the `fakes`
  `applications` repo), then:
  - `override_gate(MANAGER, app_id, ...)` advances it to `interview_pending` and writes an audit row.
  - `decide_application(MANAGER, app_id, "rejected", ...)` moves it to `rejected`.
  - a non-manager identity raises `ForbiddenError`; a wrong-`comp_id` identity raises `NotFoundError`
    (reuse the existing `_scoped` assertions).
- [ ] **Step 2 — run.** If FAIL because a `decision.py` guard rejects the from-state, widen it minimally;
  otherwise the Task-4 funnel guards already make these pass.
- [ ] **Step 3 — run → PASS.** Gate green.

---

## TIER D — erasure cascade extension (the compliance follow-through)

### Task 7 — `CandidateEraser` reaches every new v2 artifact (TDD)
**Files:** Modify `src/admin/app/resources/compliance.py`; Modify `src/admin/tests/conftest.py`
(+fakes); Test `test_resources_compliance.py`.
**Interfaces — Consumes (new injected repos, each with a `delete_by_*` coroutine):**
`assessment_attempts.delete_by_candidate`, `code_submissions.delete_by_candidate`,
`messages.delete_by_user`, `message_threads.delete_by_user`, `notifications.delete_by_user`,
`practice_sessions.delete_by_user`, `video_answers.delete_by_user`.

- [ ] **Step 1 — fakes:** add `Fake{AssessmentAttempt,CodeSubmission,Message,MessageThread,Notification,
  PracticeSession,VideoAnswer}Repo` to `conftest.py`, each mirroring `FakeAptitudeAttemptRepo` /
  `FakeConsentRepo` (an in-memory list/dict + a `delete_by_*` that filters by key). Add them to the
  `fakes` fixture dict.
- [ ] **Step 2 — failing test:** extend `test_erase_cascades_into_ai_artifacts` — seed each new fake with
  a row for the candidate, run `eraser.erase(uid)`, assert each store is empty afterward. Add
  `test_erase_skips_unconfigured_artifact_repos`: build the eraser with the new repos as `None` and
  assert `erase` completes without error (so the gate is green before pillars ship). Add
  `test_erase_video_blob_failure_is_logged`: a `video_answers` whose blob delete raises is caught +
  logged and does **not** block `users.anonymize`. Run → FAIL.
- [ ] **Step 3 — implement:** add the seven repos as **keyword constructor params** (defaulting to
  `None`) and call each `delete_by_*` inside `erase`, **guarded** so a `None` repo is skipped:
```python
        if self._assessment_attempts is not None:
            await self._assessment_attempts.delete_by_candidate(user_id)
        # ...messages / message_threads / notifications / practice_sessions by user...
        if self._video_answers is not None:
            await self._video_answers.delete_by_user(user_id)   # also purges MinIO objects,
            # wrapped in try/except + log.exception like the existing resume delete (best-effort)
```
  Keep the call sites **before** `users.anonymize` (so artifacts are gone before the tombstone) and
  preserve the existing ordering for reports/interviews/attempts/consents. `sweep` is unchanged — it
  loops `erase`, so the cascade extends for free.
- [ ] **Step 4 — run → PASS.** Update `_eraser(fakes)` helper in the test to pass the new repos. Gate
  green.

> **Note for later pillars:** when Pillar B/C/D create these collections, register their real
> repositories in the eraser's wiring (admin's composition root) and declare indexes in
> `src/admin/app/infra/db.py` (the single index authority — `proctoring_events` is already there as
> the dormant-proctoring precedent). The `delete_by_*` contract + fake pattern is fixed by this task.

### Task 8 — gate green + docs
- [ ] **Step 1 — full gate:** `bash scripts/check.sh` GREEN (grows from 423; ruff format+lint S-rules,
  pip-audit, pytest ×5 all pass).
- [ ] **Step 2 — selftest:** `python scripts/smoke_login.py --selftest` boots admin's gRPC-web app on
  loopback (proves the `aptitude_config` proto change loads end-to-end).
- [ ] **Step 3 — confirm cut/dormant in code:** verify **no** ID-verification / background-check /
  biometric-proctoring code was added; verify `proctoring_events` stays wired-but-unused (flag-off).
  Update `HANDOFF.md` + the spec/plan index row in the architecture overview (Inc 0 → done) + memory.

---

## Verification (end-to-end)

1. **Per task:** `bash scripts/check.sh` GREEN. The test count grows from **423**; every new behavior is
   default-off (`auto`), so the baseline tests keep their meaning.
2. **Behavior preservation (`auto`):** `test_next_state_happy_path` (no `gate_mode` key) still passes —
   the advisory branch falls open to `auto`. Existing aptitude/decision/funnel tests untouched + green.
3. **Advisory routing (`advisory`):** `test_next_state_advisory_routes_both_outcomes_to_review` proves
   **both** pass and fail reach `assessment_review`; `test_next_state_advisory_exits` proves the recruiter
   advances (`gate.override → interview_pending`) or rejects (`recruiter.decision → rejected`); illegal
   exits raise `InvalidTransition`.
4. **Audit + CAS intact:** `advance_application` writes one `AuditLog` per advisory entry/exit; a
   redelivered advisory entry is a logged no-op (no duplicate row) — verified via the `_RaceRepo` pattern.
5. **Producer wiring:** `grade_aptitude` publishes `gate_mode` on `aptitude.graded` (asserted on
   `FakePublisher`); no second job read.
6. **Tenant scoping:** advancing/rejecting an `assessment_review` application enforces `_require_manager`
   + `comp_id` (`ForbiddenError` / `NotFoundError` paths covered).
7. **Erasure cascade:** `erase` empties all seven new artifact stores; a `None` repo is skipped (gate
   green pre-pillar); a raising `video_answers` blob delete is logged and does not block anonymization.
8. **gRPC-web boot:** `python scripts/smoke_login.py --selftest` succeeds after the proto change.

## Risks / re-verify at execution
- **Proto regen workflow** — adding `gate_mode` to `aptitude_config` requires regenerating stubs;
  re-confirm the project's proto build command and that the gRPC-web selftest still boots. (Admin is
  gRPC, not FastAPI — no REST route to add.)
- **`gate.override` from-state widening** — confirm no other caller assumes `gate.override` is only
  legal from `gated_out`; the widening to also accept `assessment_review` must not break the existing
  gated-out override path (its test stays green).
- **Eraser ordering** — the new `delete_by_*` calls must sit **before** `users.anonymize` (artifacts
  removed before the tombstone) and must not disturb the existing reports/interviews/attempts/consents
  sequence; the best-effort blob delete must not abort the cascade.
- **`assessment_review` must stay out of `_TERMINAL`, `DECISIONS`, and `_RETRYABLE_EVENTS`** — it is a
  transient human-hold, not a decision, not part of the interview→scoring ordering race. A regression
  here would either strand applications or mis-requeue them.
- **Old job docs** — deserializing a pre-Inc-0 `aptitude_config` (no `gate_mode`) must yield `auto`;
  the additive default guarantees it, but assert it explicitly (Task 2 Step 1).

---

## TIER F — Frontend (detailed)

> **Why this tier exists.** TIERS A–E make the gate advisory-capable end-to-end on the **backend**, but
> the design's Open Question §6 ("Recruiter UI for `assessment_review`") and §3.1 ("recruiters pick the
> mode when they configure a job") have **no frontend** today. The current FE cannot set `gate_mode`,
> cannot action the new `assessment_review` state, and shows the candidate **nothing** for it (the
> status map has no token, so it falls through to the raw string `"assessment_review"`). This tier
> closes that gap in the **company** (recruiter) and **candidate** apps, reusing the existing `@ip/ui`
> set, `@ip/shared` auth/query, and the `@ip/api-client` gRPC-web clients. **LOCAL-ONLY — never run
> git/gh.** No backend tier changes; FE consumes the proto field TIER A Task 2 adds.
>
> **Grounding (read before editing).** Recruiter form/shell patterns: `frontend/apps/company/app/jobs/
> new/page.tsx` (TanStack `useMutation` + `Field`/`Input`/`Textarea` + synchronous submit latch),
> `frontend/apps/company/app/jobs/[id]/page.tsx` (detail page, `Tabs`, `useQuery(["job", id])`),
> `frontend/apps/company/components/applicants-table.tsx` (state-gated action clusters, `ACTIONABLE`/
> `TERMINAL` sets, mobile-card + desktop-table dual layout, `["applicants", jobId]` polling),
> `frontend/apps/company/components/decision-control.tsx` (reused `Select` + `ConfirmDialog` decision
> path, invalidation fan-out). Candidate tracker: `frontend/apps/candidate/components/dashboard.tsx`
> (reads `applicationStatus(a.state)` from `@ip/ui`). Status vocabulary: `frontend/packages/ui/src/
> status.ts` (`applicationStatus` map — single source for both apps).
>
> **Hard constraints discovered in the codebase (do not skip):**
> - **`JobService` today exposes only `createJob` / `getJob` / `publishJob` / `getPublicJob` / `listJobs`**
>   (`frontend/packages/api-client/src/gen/job_pb.ts`). There is **no `updateJob` RPC** and **no
>   `AptitudeConfig` message** on the wire yet — `createJob` takes `{ title, jdText }` only, and
>   `jobs/[id]/page.tsx` is **detail-only with no edit form**. So the recruiter control needs the proto
>   surface extended on **both** create and edit paths (Task F1), which is a real cross-tier dependency
>   on TIER A Task 2, not just a field render. Regenerate the client with
>   `pnpm --filter @ip/api-client gen` (alias for `buf generate ../../../src/admin/app/routes/pb`)
>   **after** the proto lands; FE work that imports the new fields will not typecheck until then.
> - **The candidate label is fully data-driven** by `applicationStatus()` in `@ip/ui/src/status.ts`
>   (consumed by `dashboard.tsx`, the candidate `jobs/[id]` page, and the recruiter table). Adding the
>   `assessment_review` token there is the **single** change that surfaces "Under review" everywhere —
>   do not hardcode the label per-app.
> - **Never run `next build` while `pnpm dev` is live** (`.next` lock corruption — per project memory);
>   the verification command below filters to `@ip/company` via `npx pnpm@9.15.0`.

### Task F1 — recruiter `gate_mode` control on the job create + edit forms
**Files:** Modify `frontend/apps/company/app/jobs/new/page.tsx`; Modify
`frontend/apps/company/app/jobs/[id]/page.tsx` (add a "Settings" tab/panel — today it has only
Applicants/Ranked/Reports/Scores). New component `frontend/apps/company/components/gate-mode-field.tsx`
(shared by both forms). Depends on: TIER A Task 2 (proto `gate_mode` on `aptitude_config` **and** on the
`createJob`/`updateJob` request) regenerated via `pnpm --filter @ip/api-client gen`.
**Interfaces — Consumes:** `api.jobs.createJob({ title, jdText, gateMode })`,
`api.jobs.getJob` (response now carries `aptitudeConfig.gateMode`), `api.jobs.updateJob` (new RPC for the
edit path). **Produces:** recruiter persists `auto | advisory` per job.

- [ ] **Step 1 — shared field component:** create `gate-mode-field.tsx` exporting a controlled
  `GateModeField({ value, onChange, disabled })` built from `@ip/ui` `Field` + `Select` (the exact
  pattern in `decision-control.tsx`): `Field` `label="AI gate mode"` with a `hint` (`Field` already
  renders `hint` — see `frontend/packages/ui/src/field.tsx`); `Select` with `SelectTrigger`/`SelectValue`/
  `SelectContent` and two `SelectItem`s — `auto` → **"Automatic — AI decides pass/fail"**, `advisory` →
  **"Advisory — AI recommends, you decide"**. Keep `value` always-controlled (default `"auto"`, never
  uncontrolled→controlled) exactly as `decision-control.tsx` does with its empty-string latch. Below the
  select, render a one-line `text-xs text-muted-foreground` explainer that swaps on the value: advisory →
  *"Both passing and failing candidates wait in a review queue for a recruiter decision — no one is
  auto-rejected."*; auto → *"Passing candidates advance automatically; failing candidates are gated out."*
- [ ] **Step 2 — create form (`jobs/new`):** add `const [gateMode, setGateMode] = useState("auto")`;
  render `<GateModeField value={gateMode} onChange={setGateMode} disabled={create.isPending} />` inside
  the existing `<form>` (after the JD `Field`, before the submit `Button`); extend the mutation to
  `api.jobs.createJob({ title: title.trim(), jdText, gateMode })`. No new submit latch — reuse the
  existing `submitting` ref. Default `"auto"` preserves today's create behavior byte-for-byte.
- [ ] **Step 2b — edit form (`jobs/[id]`):** add a **"Settings"** `TabsTrigger`/`TabsContent` to the
  existing `Tabs` (alongside Applicants/Ranked/Reports/Scores). In it, a `Card` with `GateModeField`
  seeded from `job.data.aptitudeConfig?.gateMode ?? "auto"` and a "Save" `Button`. Add an `updateMode`
  `useMutation` calling `api.jobs.updateJob({ jobId: id, gateMode })`; `onSuccess` →
  `toast.success("Gate mode updated")` + `queryClient.invalidateQueries({ queryKey: ["job", id] })`;
  `onError` → `toast.error(errorMessage(err))` (mirror the existing `publish` mutation in the same file).
  Disable Save until the selected value differs from the persisted one (no-op guard).
- [ ] **Step 3 — states + a11y:** the create button stays disabled while `create.isPending` (existing);
  the Settings Save button shows `loading={updateMode.isPending}`. `Field`'s `Label`/`htmlFor` wiring
  gives the select an accessible name; the `Select` is keyboard-operable via Radix (already in `@ip/ui`).
  Verify the explainer text is readable in dark mode (`text-muted-foreground` is a token, theme-safe).
- [ ] **Step 4 — typecheck:** `npx pnpm@9.15.0 --filter @ip/api-client gen` then
  `npx pnpm@9.15.0 --filter @ip/{company,api-client} typecheck` → green. If `updateJob`/`gateMode` are
  not yet in the regenerated client, this **fails** — confirms the TIER A proto dependency is real.

### Task F2 — surface `assessment_review` in the applicants table (advisory queue)
**Files:** Modify `frontend/apps/company/components/applicants-table.tsx`; Modify
`frontend/apps/company/components/decision-control.tsx` (advisory framing only). New (optional) helper
in the table file for the advisory action cluster.
**Interfaces — Consumes:** `ApplicationResponse.state === "assessment_review"` plus the recommendation
signal. **Produces:** an "AI recommended / you decide" row with the AI's score + **Advance** (reuses
`overrideGate`) and **Reject** (reuses `DecisionControl`) actions.

- [ ] **Step 1 — score on the row (read what the API returns):** confirm the field carrying the AI
  pass/fail + score on `listApplicants` (check `application_pb.ts` for `score` / `aptitudeScore` /
  `passed` / `aptitudePassed` on `ApplicationResponse`; **adapt the exact field name** — do not invent).
  Add a **Score** `TableHead`/`TableCell` (desktop) and a score line in the mobile card, rendered **only**
  for `assessment_review` rows (others show `—`). If `listApplicants` does **not** yet return the score,
  add a row note "Score in the report" linking to the report instead, and flag a follow-up — do not block
  the queue on a missing field.
- [ ] **Step 2 — advisory action cluster:** add `assessment_review` to a new `REVIEW` set (do **not** add
  it to `TERMINAL`; it must keep polling). In `actions(a)`, branch `a.state === "assessment_review"` to a
  cluster with: a `View report` `Link` (same `buttonVariants({ variant: "outline", size: "sm" })` as the
  `ACTIONABLE` branch), an **Advance** `ConfirmDialog` reusing the existing `override` mutation
  (title **"Advance this candidate?"**, description *"The AI recommended a decision — advancing sends them
  to interview."*, `confirmLabel="Advance"`), and `<DecisionControl applicationId jobId />` for the reject
  path. Keep the `gated_out` override branch unchanged (its widening to also accept `assessment_review`
  lives in the funnel — TIER B Task 4 — the FE just calls the same `overrideGate`).
- [ ] **Step 3 — advisory framing (the "you decide" message):** above the action cluster for
  `assessment_review` rows, render a small `Badge tone="warning"` or inline `text-xs text-muted-foreground`
  reading **"AI recommended — you decide"** so the recruiter sees the call is theirs, not the model's
  (design §3.1). In `decision-control.tsx`, when invoked for an `assessment_review` row, the existing
  `Reject` option already maps to the audited `recruiter.decision(rejected)` exit — no new option needed;
  just confirm the `ConfirmDialog` copy ("mark the candidate as rejected") reads correctly in this context.
- [ ] **Step 4 — data layer (keys + invalidation on advance):** the **Advance** path reuses the existing
  `override` mutation, which already invalidates `["applicants", jobId]` + `["analytics"]`. Extend its
  `onSuccess` to also invalidate `["ranked", jobId]` (an advance shifts the funnel into interview, like a
  decision does — mirror `decision-control.tsx`'s fan-out). The reject path via `DecisionControl` already
  invalidates the full set. Confirm the `refetchInterval` predicate still polls `assessment_review` rows
  (it will, because `assessment_review ∉ TERMINAL`).
- [ ] **Step 5 — states:** loading/empty/error are inherited from the existing `LoadingState`/`EmptyState`/
  `ErrorState` branches (no change). Per-action: `override.isPending` drives the Advance dialog `busy`;
  `decide.isPending` drives Reject (existing). Success/error toasts already wired on both mutations.
- [ ] **Step 6 — responsive + dark + a11y:** add the Score column to **both** the `sm:hidden` stacked-card
  layout and the `hidden sm:block` table (the file keeps them in lockstep — the comment at the action
  cluster says so). Keep the fixed `min-h-9` action row so `assessment_review` rows stay level with others.
  All colors via tokens (`tone="warning"`, `text-muted-foreground`) — theme-safe. The candidate-id
  `aria-label` pattern is unchanged.
- [ ] **Step 7 — typecheck:** `npx pnpm@9.15.0 --filter @ip/company typecheck` → green.

### Task F3 — candidate tracker label for `assessment_review`
**Files:** Modify `frontend/packages/ui/src/status.ts` (the shared `applicationStatus` map).
**Interfaces — Produces:** `applicationStatus("assessment_review")` →
`{ label: "Under review", tone: "warning" }`. **Rationale:** the candidate must see *"under review"*, not
silence — today the state falls through to the raw string `"assessment_review"` with a `neutral` tone.

- [ ] **Step 1 — add the token:** insert into the `APPLICATION` record (between `gated_out` and
  `interview_pending`, mirroring the backend enum placement):
```ts
  assessment_review: { label: "Under review", tone: "warning" },
```
  Reuse the existing `warning` tone (same as `scored` "Under review") so the candidate sees a consistent
  "a human is reviewing this" signal, distinct from the `danger` `gated_out`. **No candidate-app code
  change** is needed — `dashboard.tsx` and the candidate `jobs/[id]` page already render
  `applicationStatus(a.state)`; the recruiter table picks up the same token for the non-action columns.
- [ ] **Step 2 — candidate dashboard behavior check:** confirm `assessment_review ∈` the candidate
  `dashboard.tsx` non-terminal set so the dashboard keeps polling (it is **not** in that file's `TERMINAL`
  set, so polling continues — the candidate sees the badge flip to interview/closed when the recruiter
  acts). No "Take test"/"Start interview" CTA fires for this state (correct — the candidate waits); the
  **Withdraw** action remains available (non-terminal), which is the desired escape hatch.
- [ ] **Step 3 — typecheck:** `npx pnpm@9.15.0 --filter @ip/ui typecheck` → green.

### Task F4 — FE verification gate
- [ ] **Step 1 — regen + typecheck the libs:** `npx pnpm@9.15.0 --filter @ip/api-client gen` (after the
  TIER A proto change), then `npx pnpm@9.15.0 --filter @ip/{ui,shared,api-client} typecheck` → all green.
- [ ] **Step 2 — build the recruiter app:** `npx pnpm@9.15.0 --filter @ip/company build` → green.
  **Never run `next build` while `pnpm dev` is live** (project memory: `.next` lock corruption); stop any
  running dev server first.
- [ ] **Step 3 — manual smoke (optional, local):** with admin + ai-agents up, create a job with
  `gate_mode=advisory`, apply as a candidate, grade the aptitude, and confirm: (a) the candidate dashboard
  shows **"Under review"**; (b) the recruiter Applicants tab shows the row in the advisory cluster with
  **Advance** / **Reject**; (c) **Advance** moves it to interview and the row leaves the queue; (d) the
  audit trail (backend) records the `gate.override` / `recruiter.decision` exit.

### FE verification (end-to-end)
1. **Recruiter control:** `gate_mode` is settable on **create** (`jobs/new`) and **edit** (`jobs/[id]`
   Settings tab), persists via `createJob`/`updateJob`, and defaults to `auto` (today's behavior preserved).
2. **Advisory queue:** `assessment_review` applicants render with their AI score + **Advance** (reuses
   `overrideGate` → `interview_pending`) and **Reject** (reuses `DecisionControl` → `rejected`), framed
   **"AI recommended — you decide"**. Advance invalidates `["applicants", jobId]` + `["ranked", jobId]` +
   `["analytics"]`; the row keeps polling until it leaves the state.
3. **Candidate label:** `applicationStatus("assessment_review")` → "Under review" (`warning`), surfaced in
   `dashboard.tsx` with no candidate-app code change; Withdraw stays available; polling continues.
4. **States/responsive/dark/a11y:** loading/empty/error inherited; per-action busy + toasts wired; Score
   column added to both mobile-card and desktop-table layouts; all colors via tokens (theme-safe); Radix
   `Select` + `Field` labels keep keyboard + screen-reader access.
5. **Gate:** `npx pnpm@9.15.0 --filter @ip/{ui,shared,api-client} typecheck` and
   `npx pnpm@9.15.0 --filter @ip/company build` both green (dev server stopped first).

### FE risks / re-verify at execution
- **Proto field reaches the request, not just the message.** TIER A Task 2 adds `gate_mode` to the
  `aptitude_config` *message*; the FE additionally needs it on the **`createJob` request** and a **new
  `updateJob` RPC** (neither exists today). Confirm the proto + handler expose both before
  `pnpm --filter @ip/api-client gen`, or F1 cannot typecheck. If `updateJob` is out of scope for Inc 0,
  ship F1 create-only and defer the edit tab — but say so explicitly.
- **`listApplicants` may not return the AI score.** F2 Step 1 assumes a score field on
  `ApplicationResponse`; verify in `application_pb.ts`. If absent, fall back to "Score in the report" +
  flag a follow-up rather than blocking the queue.
- **Polling sets must include `assessment_review`.** It must stay **out of** every `TERMINAL` set
  (recruiter table + candidate dashboard) so both keep polling; a regression strands the row visually even
  though the backend transitioned.
- **No `next build` with `pnpm dev` live** — corrupts `.next` (project memory). The verification filters to
  `@ip/company` and assumes the dev server is stopped.
