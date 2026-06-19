# Integrity by Design (Non-Surveillance) — Implementation Plan

> **⛔ SUPERSEDED (2026-06-20).** Reversed — Aptura now runs a **strict, fully-proctored** interview. See [proctored-integrity](2026-06-20-proctored-integrity.md). Retained for history only; do not implement.

> Spec: `docs/superpowers/v2/2026-06-19-integrity-by-design-design.md`. TDD, task-by-task.
> **LOCAL-ONLY — never git/gh.** Each backend slice keeps `bash scripts/check.sh` green (baseline
> **423 tests**). No surveillance, no biometric, no media code — ever.

## Global constraints
- Advisory only: integrity output is shown to the recruiter, never auto-gates the funnel.
- Reuse the existing interviewer / evaluator / aptitude-content paths — no new "brain", no new infra.
- Offline gate: fake LLM at temp 0; deterministic seeds for rotation/watermark; no network/containers.
- All new artifacts join the Inc-0 `CandidateEraser` cascade.
- Follow `~/.claude/CLAUDE.md` (minimal, trust-the-system, validate-at-boundaries) + `PRODUCTION_STANDARDS.md`.

## File structure (new + modified)
```
src/ai-agents/app/model/integrity.py            (NEW — IntegritySignal + types + canonical SEVERITY)
src/ai-agents/app/resources/integrity.py         (NEW — consistency signals + generic-answer heuristic)
src/ai-agents/app/resources/interviewer.py        (MODIFY — adaptive "defend"/follow-up probe on generic answers)
src/ai-agents/app/resources/blueprint.py           (MODIFY — seed ≥1 reasoning/curveball prompt per competency)
src/admin/app/resources/aptitude.py                (MODIFY — per-candidate rotation + watermark on delivery)
src/admin/app/model/aptitude.py                    (MODIFY — AptitudeDelivery.watermark)
src/mcp-data/app/tools.py                          (MODIFY — save_integrity_signals / read for report)
src/admin/app/resources/report.py                  (MODIFY — surface advisory integrity band on the report)
src/admin/app/resources/compliance.py              (MODIFY — eraser cascade: integrity_signals)
frontend/apps/company/components/integrity-band.tsx (NEW — advisory IntegrityBand; @ip/ui Alert/Badge/Tooltip; recruiter-only)
frontend/apps/company/components/report-view.tsx    (MODIFY — render <IntegrityBand>, extend Report type with integritySignals)
```
> FE is **recruiter-only** (TIER F): the candidate app (`frontend/apps/candidate/**`) is untouched.

## TIER A — content integrity (rotation + watermark; no AI)

### Task 1 — Per-candidate rotation + watermark
- [ ] **Failing test** (`src/admin/tests`): two candidates for one job get a different question
      selection/order from the same bank, and each `AptitudeDelivery` carries a distinct `watermark`;
      grading still maps answers back correctly (regression).
- [ ] **Failing test — seed immutability:** create a delivery from a bank, then **grow the bank** and
      re-read/re-render the same `application_id`'s delivery — the served question ids and order are
      **unchanged** (replayed from the stored snapshot, not re-derived) and the `watermark` is stable.
      This is the guard that a growing bank never reshuffles an in-flight candidate or breaks grade-mapping.
- [ ] Add `watermark: str` to `AptitudeDelivery` (`model/aptitude.py`); set it on delivery creation.
      **Watermark = metadata token, NOT a visual element:** generate it as a deterministic
      `hash(application_id + selected_question_ids + server-side secret)` truncated to a short token;
      store it on the delivery only; never render it to the candidate. Because it's derived from the
      exact served set, it traces a leaked set back to its delivery.
- [ ] Add the **snapshotted selection** to `AptitudeDelivery` (the chosen subset/order of `question_ids`),
      set once at first delivery.
- [ ] Extend the existing order-randomization in `resources/aptitude.py` to select a per-candidate
      subset/order (seeded by `application_id`) when the bank is larger than the served count, **then
      snapshot the selected `question_ids` onto the delivery**. Subsequent reads replay the snapshot —
      **never re-derive from the (possibly grown) bank**. The seed is used **once, at first delivery**.
- [ ] Run → PASS. `bash scripts/check.sh` green.

## TIER B — adaptive probing (deter by design)

### Task 2 — "Defend it" follow-up on generic answers
- [ ] **Failing test** (`src/ai-agents/tests`, fake LLM): given a scripted generic/templated answer,
      `interviewer.next_question` returns a **specific follow-up/defend probe** (not the next planned
      topic); given a substantive answer, it proceeds normally. Hard `max_questions` cap unchanged.
- [ ] **Failing test — threshold gating:** a `generic` verdict **below** the confidence threshold does
      **not** fire a probe (proceeds to the next planned topic); a `generic` verdict **at/above** the
      threshold does. Confirms the conservative-by-default posture.
- [ ] Implement the **generic-answer heuristic** in `interviewer.py` as a **temp-0 LLM classification**
      (NOT keyword-matching): one judgement pass over `(question, answer)` → `specific | generic` + a
      confidence `0–1`. Fire the defend/follow-up probe **only when `generic` AND confidence ≥ threshold**
      (default **0.75**); otherwise proceed to the next planned topic. The fake LLM returns the verdict +
      confidence for the test, keeping it deterministic.
- [ ] **Read the threshold from config, not a literal:** `generic_answer_confidence` comes from the
      integrity settings surface (Task 4 / the config knob) so it's tunable without a deploy.
- [ ] Run → PASS. Gate green.

### Task 3 — Reasoning/curveball seeding in the blueprint
- [ ] **Failing test:** a built blueprint contains ≥1 reasoning-over-recall prompt per competency.
- [ ] Extend `blueprint.py` prompt to seed them. Run → PASS. Gate green.

## TIER C — advisory consistency signals (no biometrics)

### Task 4 — IntegritySignal model + consistency pass
- [ ] **Failing test:** `resources/integrity.py` emits `claim_inconsistency` when a claimed-senior
      skill is unsupported by the transcript, and `aptitude_interview_divergence` when aptitude and
      interview diverge beyond a threshold; emits nothing on a consistent candidate. Severity is
      canonical (server-assigned). Pure functions over claims + transcript + aptitude score (temp-0
      LLM judgement faked in the test).
- [ ] **Failing test — severity scales with the gap:** a **small** claim↔evidence gap yields **low**;
      a **wide** gap (claimed-senior skill unreasoned) yields **medium/high**. A **modest** aptitude↔
      interview divergence yields **info/low**; a **large** divergence yields **medium/high**. Assert the
      severity is **derived server-side from the gap size**, never taken from input.
- [ ] Implement `model/integrity.py` (`IntegritySignal`, `type` Literals, `severity` Literal
      `{info, low, medium, high}`, `SEVERITY` map). Implement the **severity algorithm** in
      `resources/integrity.py`: `claim_inconsistency` severity scales with the claimed-vs-demonstrated
      distance; `aptitude_interview_divergence` severity scales with the **normalized** score-divergence
      magnitude; `generic_answer_flag` and `watermark` are **info**. Run → PASS.
- [ ] **Config knob:** read the cutoffs from one integrity settings surface (e.g. admin
      `infra/settings`) — `divergence_threshold` (minimum gap before `aptitude_interview_divergence`
      fires) and the gap→`{low,medium,high}` bands — **read at call time**, not hardcoded, so they're
      tunable without a deploy. (The Task-2 `generic_answer_confidence` lives in the same surface.)
- [ ] Persist via mcp-data `save_integrity_signals(application_id, comp_id, signals)`; add the
      `integrity_signals` index in admin `infra/db.py` (the index authority): `(application_id)`,
      `(comp_id, application_id)`. Gate green.

### Task 5 — Wire into the interview finalize (advisory, non-blocking)
- [ ] **Failing test:** on `interview.completed` scoring, the consistency pass runs and signals are
      saved; a thrown integrity error is swallowed-and-logged (best-effort) and never blocks scoring
      or advances/gates the funnel.
- [ ] Call the consistency pass from the scoring handler (after the evaluator), best-effort. Run → PASS.

## TIER D — surface + erase + verify

### Task 6 — Recruiter report advisory band (backend read)
- [ ] Extend `report.py` read to include the comp-scoped `integrity_signals` on the report payload
      (typed: `{type, severity, detail, at}[]`, server-assigned severity) so the existing
      `getReport` response carries them. FE rendering is the **TIER F** detail below — backend just
      makes the comp-scoped signals available on the same payload; never a verdict, never a gate.

### Task 7 — Erasure cascade + final gate
- [ ] Add `integrity_signals` deletion to `CandidateEraser` (`compliance.py`); test the cascade purges
      them.
- [ ] Full `bash scripts/check.sh` green (grows from 423); `scripts/smoke_login.py --selftest` after
      any transport touch.

## TIER F — Frontend (detailed)

> **Recruiter-only for v2.** No candidate-facing surface — the candidate app is untouched (per the
> spec's open question: default recruiter-only, revisit later). The band is **advisory context**,
> **never a verdict**, and **never gates** any action. Reuses `@ip/ui` only — no new design tokens,
> no new dependency. Backend read (TIER D Task 6) puts `integritySignals` on the existing report
> payload; this tier renders it. No new poll, no new query — rides the existing `["report", appId]`
> TanStack query. Verify: `pnpm turbo run build --filter @ip/company` +
> `pnpm turbo run typecheck --filter @ip/{ui,shared,api-client}` green.

### Task F1 — Extend the report payload type (api-client + report-view contract)
- [ ] Add the advisory signal type to the report response so the FE reads it from the **same**
      `api.reports.getReport` call (no second request). In `report-view.tsx` extend the local
      `Report` interface with `integritySignals?: IntegritySignal[]` where
      `IntegritySignal = { type: "generic_answer_flag" | "claim_inconsistency" | "aptitude_interview_divergence" | "watermark"; severity: "info" | "low" | "medium" | "high"; detail: string; at: string }`.
      Keep it **optional** so an un-migrated/older report (no signals yet) still renders — the band
      then shows the clean empty state. Mirror the type wherever `@ip/api-client` types the report
      (the generated/`getReport` return) so `--filter @ip/api-client typecheck` stays green; if the
      client type is codegen-only, the optional field on the `Report` interface is the contract the
      component depends on.
- [ ] No change to `app/jobs/[id]/applicants/[appId]/page.tsx` — it already passes the whole
      `report.data` to `<ReportView>`; the new field flows through untouched. **Do not** add a new
      `useQuery`/`refetchInterval` — reuse the existing key (the band is part of the report, not a
      live signal).

### Task F2 — `IntegrityBand` component (new, recruiter report)
- [ ] **New file** `frontend/apps/company/components/integrity-band.tsx` (`"use client"`). Props:
      `{ signals?: IntegritySignal[] }`. Pure presentational — no fetching, no mutation, no gating.
- [ ] **UX balance (the bar):** the band must be **visible enough to catch a real issue** yet **never
      alarmist for a clean candidate** — a populated band reads as *advisory context*, a clean one reads
      as *reassurance*. Concretely: positive clean state (not silence), `info` populated tone (not
      `danger`), severity tops out at `warning`. A recruiter glancing at a clean report should feel the
      candidate is fine, not under suspicion.
- [ ] **States:**
  - **none / clean** (`!signals || signals.length === 0`): a **positive** empty state — an
    `Alert tone="success"` titled "No integrity concerns" with body "Nothing flagged for review."
    (reuse `Alert`; success tone reads as a reassuring clean state, not an error). This is the
    default for the common case and for older reports without the field.
  - **populated** (`signals.length > 0`): an `Alert tone="info"` (advisory — **info, never danger**,
    so it never reads as a verdict) wrapping a list. Each signal row =
    a `Badge` for the `type` (plain-language label via a `TYPE_LABEL` map, e.g.
    `claim_inconsistency → "Claim vs. interview"`, `aptitude_interview_divergence → "Score divergence"`,
    `generic_answer_flag → "Generic answer"`, `watermark → "Content watermark"`) + the
    `detail` string in plain language. **Severity drives Badge tone only** (`info→neutral`,
    `low→info`, `medium→warning`, `high→warning`) — deliberately **no `danger`** tone, because a
    flag is context, not a rejection.
- [ ] **Heading + advisory `Tooltip`:** a section heading ("Integrity signals") with a `Tooltip`
      (reuse the `@ip/ui` `Tooltip` convenience wrapper) on an `Info` icon trigger
      (`Icon` from `@ip/ui`), content: **"Advisory context for the recruiter — not a verdict, never
      auto-rejects, and based on no surveillance data (no camera, mic, or keystroke tracking)."**
      Keep the copy verbatim-equivalent so the non-blocking, non-surveillance posture is explicit in
      the UI itself.
- [ ] **Reuse only:** `Alert`, `Badge`, `Card`/`CardContent` (if a standalone card is cleaner than
      inlining into the report card — match `report-view.tsx`'s `Card` rhythm), `Tooltip`, `Icon`.
      No new primitive, no raw color — tones come from `@ip/ui` token families only.

### Task F3 — Wire `IntegrityBand` into `report-view.tsx`
- [ ] Import `IntegrityBand` and render it inside the existing `<CardContent className="flex flex-col gap-5">`,
      **after** the Highlights/Risks sections and **before** the `DecisionControl` block, passing
      `signals={report.integritySignals}`. It sits in the report flow as context the recruiter reads
      **before** deciding — but it does **not** alter the `["scored","shortlisted"].includes(report.state)`
      gate on `DecisionControl` (the decision logic is unchanged; the band only informs).
- [ ] Confirm the band renders for every report state (clean empty state when there are no signals),
      so a report with no integrity data looks intentional, not broken.

### Task F4 — Responsive, dark, a11y
- [ ] **Responsive:** signal rows wrap on narrow viewports (`flex flex-wrap items-start gap-2`,
      mirroring `applicants-table.tsx`'s `flex flex-wrap items-center gap-2`); the band must not
      overflow at ~375px (the same width the applicants table guards with its stacked-card layout).
- [ ] **Dark mode:** verified for free by using only `@ip/ui` token classes (Alert/Badge tones are
      already theme-aware); **no hard-coded hex**, no `dark:` overrides needed.
- [ ] **A11y:** the band is **informational** — wrap it in a `<section aria-label="Integrity signals">`
      (or `role="region"` + `aria-label`) so it's announced as advisory context, not an alert that
      demands action; the `Alert` already carries `role="alert"` for the inner status, and the
      `Tooltip` trigger is a real focusable control (button) with the advisory explanation reachable
      by keyboard. Each `Badge` label is plain text (no icon-only meaning).

### Task F5 — Explicit non-goals (assert in the plan, not code)
- [ ] **Not shown to candidates in v2:** no edit to `frontend/apps/candidate/**`; the band lives only
      under `frontend/apps/company/`. (Revisit candidate transparency post-v2 per the spec's open
      question.)
- [ ] **Never gates:** `IntegrityBand` has no actions, no mutations, no effect on
      `DecisionControl` or any funnel state — it is read-only advisory context. Grep guard: the
      component imports no `useMutation` and no `api.decisions.*`.

### Task F6 — FE verification
- [ ] `pnpm turbo run build --filter @ip/company` → green (the new component compiles and the page
      renders with the extended payload).
- [ ] `pnpm turbo run typecheck --filter @ip/{ui,shared,api-client}` → green (the `IntegritySignal`
      type and optional `integritySignals` field typecheck across the shared packages).
- [ ] **Do not** run `next build` while `pnpm dev` is live (known gotcha). LOCAL-ONLY — never git/gh.

## Verification (end-to-end)
1. Per slice: `bash scripts/check.sh` GREEN; offline (fake LLM, seeded rotation) — no network/containers/media.
2. Rotation/watermark: two candidates, distinct selection + watermark, grading still correct.
3. Probing: generic answer → defend-probe; substantive answer → normal progression.
4. Consistency: inconsistent candidate flags advisory signals; consistent candidate flags none; never gates.
5. Privacy check: confirm NO slice captures camera/mic/gaze/keystroke or any biometric — typed signals only.
6. Regression: the text interview + scoring path untouched and green.
7. FE (TIER F): `pnpm turbo run build --filter @ip/company` + `pnpm turbo run typecheck --filter @ip/{ui,shared,api-client}` green; `IntegrityBand` renders clean empty state with no signals and an advisory (info, non-verdict) band when populated; recruiter-only (candidate app untouched); never gates `DecisionControl`.

## Resolved gaps (completeness audit 2026-06-19)

The v2 completeness audit (Part B → "Integrity-by-design") flagged six underspecified points; each is
now woven into the tasks above. Traceability:

- **Generic-answer heuristic + threshold** → **Task 2**: temp-0 LLM `specific`/`generic` + confidence
  classification (not keyword-matching); probe fires only at confidence ≥ **0.75** (config-driven).
- **Consistency-signal severity algorithm** → **Task 4**: `severity ∈ {info, low, medium, high}`,
  **server-assigned, scaled by the claim↔evidence gap** (claimed-vs-demonstrated distance; normalized
  aptitude↔interview divergence), with a severity-scaling test.
- **Watermark defined** → **Task 1**: a **per-delivery metadata token** on `AptitudeDelivery`
  (`hash(application_id + selected_question_ids + secret)`), **not a visual element**; stored, never
  rendered.
- **Rotation seed immutability** → **Task 1**: selected `question_ids` **snapshotted on first delivery**
  and replayed; a dedicated "grow the bank, selection unchanged" test guards it.
- **Tunable threshold knob** → **Tasks 2 & 4**: `generic_answer_confidence`, `divergence_threshold`, and
  the gap→severity bands live in **one integrity settings surface**, read at call time — no deploy to tune.
- **Advisory band UX balance** → **Task F2**: explicit positive **clean state** + advisory **`info`**
  populated band (**no `danger` tone**), visible-but-not-alarmist; **advisory-only + recruiter-only**
  reaffirmed (candidate app untouched, Task F5).

## Risks
- **Probe over-firing** annoys good candidates — the generic-answer heuristic is a temp-0 LLM verdict
  gated at confidence ≥ **0.75** (conservative) and the threshold is config-tunable (Task 2).
- **Consistency false-positives** — advisory-only + human-reviewed by design; never auto-reject. Severity
  scales with the gap so a small slip can't read as a serious flag (Task 4).
- **Watermark/rotation must not break grading** — the regression test plus the seed-immutability test
  (growing bank, stable selection) in Task 1 are the guards.
