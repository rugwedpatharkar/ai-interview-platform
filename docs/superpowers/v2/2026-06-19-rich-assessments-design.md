# Rich Assessments — Design

> **Context.** v2 Inc 2, Pillar B (see `2026-06-19-v2-architecture-overview-design.md` §5
> Pillar B and §7). Today the assessment engine is **MCQ-only**: an Aptitude-Setter LLM builds
> a multiple-choice bank, the candidate fetches a randomized timed test, and `grade_aptitude`
> scores it inline against `correct_index` and emits `aptitude.graded` — the single event that
> drives the funnel gate. This spec **generalizes that into a typed, multi-kind assessment
> engine with a grader registry** (mcq / coding / free_text) **without breaking the MCQ path or
> the funnel**. The new `coding` kind depends on the **code-execution sandbox**
> (`2026-06-19-code-execution-sandbox-design.md`) for `grade_coding`. **Local-only personal
> project; never run git/gh.** No production code yet — this is the design the plan
> (`2026-06-19-rich-assessments.md`) implements, keeping `bash scripts/check.sh` green.

---

## 1. Goal & scope

**In scope.**
- A **`kind`-discriminated** assessment model. A bank holds typed sections; each section is one
  of:
  - **`mcq`** *(built today)* — `{question, options, correct_index, topic}`.
  - **`coding`** *(new)* — `{prompt, language, starter_code, test_cases:[{stdin,expected,hidden}], time_limit_s, mem_limit_mb}`.
  - **`free_text` / `skills`** *(new)* — `{prompt, rubric}`, an open answer graded by an LLM
    rubric (reuses the existing Evaluator machinery).
- A **grader registry** that replaces the inline MCQ branch in `grade_aptitude`:
  `grade_mcq` (the extracted current permutation-map + `correct_index` logic), `grade_coding`
  (submit to the sandbox, run test cases, score = weighted pass-rate with hidden tests
  weighted higher), `grade_free_text` (temp-0 Evaluator chain over the rubric). The engine
  dispatches per section on `kind`, aggregates per-section scores into the existing flat
  `score`/`passed`, and emits the **same `aptitude.graded` event** — the funnel seam is
  unchanged.
- **Mixed bank generation:** extend `handle_job_published` so the Aptitude-Setter produces a
  **mixed bank (MCQ + coding)** from the JD, with **per-kind bank-vs-plan idempotency**.
- **Delivery section ordering:** extend `AptitudeDelivery` so it records *which sections* were
  served and in what order; **coding sections are selected, not permuted** (no point shuffling
  options on a coding task).

**Backward-compatibility guarantees (non-negotiable).**
- `AptitudeAttempt` **keeps the flat `score: int` + `passed: bool`** so the funnel, scheduler,
  analytics, and notifications read path are **untouched**. New `per_section_scores[]` and a
  per-attempt `kind` summary are **additive optional fields**.
- The `aptitude.graded` payload stays `{application_id, passed}` (admin `funnel.py` maps
  `passed → interview_pending / else gated_out`; `auto` mode unchanged; advisory mode is Inc 0,
  out of scope here).
- An **MCQ-only bank grades byte-for-byte as today** — the MCQ grader is the *extracted* (not
  rewritten) current logic, and the existing aptitude tests stay green as the regression
  baseline.

**Out of scope (deferred / YAGNI).**
- The sandbox engine itself (its own spec). New funnel states / advisory routing (Inc 0).
- Candidate IDE/editor UX polish, autosave, multi-file coding submissions, partial-credit
  hidden-test feedback to candidates.
- New assessment kinds beyond mcq/coding/free_text (e.g. SQL, system-design) — the registry
  makes them additive later.

---

## 2. Where it fits

```
job.published ─► ai-agents handle_job_published
                   └─ build_assessment_bank (Aptitude-Setter, mixed: mcq + coding)
                        │  per-kind idempotency (skip kinds already banked)
                        ▼
                   data.save_assessment_bank(job_id, bank)         (collection: aptitude_banks)

candidate ─► admin get_aptitude_test  ─► AptitudeDelivery {sections served + order}
                                          (mcq options permuted; coding selected, not permuted)
candidate ─► admin grade_aptitude (submit)
                   └─ for each served section: registry[kind].grade(...)
                        ├─ grade_mcq        (extracted correct_index logic — pure)
                        ├─ grade_coding ───MCP──► mcp-capability.run_code (sandbox)  ◄── coupling
                        └─ grade_free_text ──► Evaluator chain (temp-0, rubric)
                   └─ aggregate per-section → flat score/passed
                   └─ persist AptitudeAttempt (flat score/passed + per_section_scores[])
                   └─ publish "aptitude.graded" {application_id, passed}   ◄── UNCHANGED funnel seam
                        ▼
                   admin funnel.next_state: passed → interview_pending | else gated_out
```

- **Generation** lives in ai-agents (`resources/aptitude_setter.py` + `handlers.py`), the LLM
  injected (fake LLM offline), exactly as today.
- **Grading** lives in admin (`resources/aptitude.py`), where `aptitude.graded` is emitted. The
  registry is a new admin module; `grade_coding` reaches the sandbox through the existing
  **mcp-capability client** the way other agents reach `parse_document`/`kb_search` — so admin
  gains a capability gateway dependency for the coding path (injected, faked offline).
- **The funnel remains the integration seam.** New kinds change *how a score is computed*,
  never *how the result reaches the funnel*. CAS, audit, idempotency (the unique attempt index)
  are all preserved because the emit site and payload are unchanged.

---

## 3. Design

### 3.1 Typed bank model

A section is a discriminated union on `kind` (Pydantic `Field(discriminator="kind")`), so the
bank validates structurally and a grader can `match` on `kind` with the right typed payload:

```python
class McqSection(BaseModel):
    kind: Literal["mcq"] = "mcq"
    question: str; options: list[str]; correct_index: int; topic: str

class CodingSection(BaseModel):
    kind: Literal["coding"] = "coding"
    prompt: str; language: str; starter_code: str = ""
    test_cases: list[TestCase]          # {stdin, expected, hidden}
    time_limit_s: int = 10; mem_limit_mb: int = 256; topic: str = ""

class FreeTextSection(BaseModel):
    kind: Literal["free_text"] = "free_text"
    prompt: str; rubric: str; topic: str = ""

Section = Annotated[McqSection | CodingSection | FreeTextSection, Field(discriminator="kind")]

class AssessmentBank(BaseModel):
    sections: list[Section] = Field(default_factory=list)
```

The existing `AptitudeBank{questions:[AptitudeQuestion]}` (both admin and ai-agents copies) is
**read-compatible**: a legacy MCQ bank is interpreted as all-`mcq` sections (a tiny adapter, or
a one-time shape migration — decided in the plan). The collection name (`aptitude_banks`) and
the `aptitude.*` event names are **kept** to avoid churning the funnel/data layer; only the
*shape within* a bank document is richer.

### 3.2 Grader registry

A grader is a small async callable with a uniform signature; the registry maps `kind → grader`:

```python
# grade(section, answer, *, ctx) -> SectionScore{kind, points: float in 0..1, max: float, detail}
GRADERS: dict[str, Grader] = {
    "mcq": grade_mcq,
    "coding": grade_coding,
    "free_text": grade_free_text,
}
```

- **`grade_mcq`** — the *extracted* current logic: validate the answer indexes a real option
  (reject out-of-range — candidate input is a boundary), compare to `correct_index`, `points =
  1.0` if correct else `0.0`. Pure, no I/O. This is a **move, not a rewrite** — the existing
  scoring math is preserved verbatim so MCQ-only banks are byte-identical.
- **`grade_coding`** — call `capability.run_code(language, source=answer, test_cases=...)`; the
  sandbox returns per-case results. **Score = weighted pass-rate**, hidden cases weighted
  higher than visible ones (visible cases are partly a worked example the candidate sees;
  hidden cases are the real discrimination). `compile_ok=False` → `points = 0.0`. A
  `SandboxError` (infra failure, *not* candidate failure) is **caught at this boundary** and
  surfaced as an ungraded section / retryable error — never silently scored 0 (a sandbox outage
  must not look like a failing candidate). Weighting formula and the visible/hidden weights are
  config (proposed: hidden ×3, visible ×1).
- **`grade_free_text`** — reuse the Evaluator chain on a **temp-0** LLM (the same determinism
  discipline scoring already uses), grading the answer against the section `rubric`; map the
  Evaluator's 0..1 score to `points`. Untrusted candidate text is `fence()`d (the existing
  prompt-injection defense) before it reaches the grading prompt.

### 3.3 Aggregation → flat score (the compatibility bridge)

After per-section grading, the engine computes the **flat `score: int` (0..100)** and `passed`
exactly where `grade_aptitude` does today:

- `score = round(100 * Σ(section.points * section.max) / Σ(section.max))` — a weighted average
  over served sections (sections may carry different `max` weights; MCQ defaults to 1.0 so an
  all-MCQ bank reduces to today's `100 * correct / n`).
- `passed = score >= pass_threshold` (unchanged `AptitudeConfig.pass_threshold`).
- Persist `AptitudeAttempt{... score, passed, per_section_scores:[SectionScore], }` — flat
  fields drive the funnel; `per_section_scores` powers richer recruiter reporting + analytics
  (Inc 7) without changing any existing reader.

Then emit `aptitude.graded {application_id, passed}` — **identical to today**. This is the
crux: everything new collapses back into the one number + boolean the funnel already consumes.

### 3.4 Generation: mixed bank

`build_assessment_bank(jd_text, topics, *, counts, llm, ...)` extends today's
`build_aptitude_bank`:
- Produce `counts.mcq` MCQ sections (existing prompt/validation, unchanged) **plus**
  `counts.coding` coding sections — each coding section's prompt + `starter_code` +
  `test_cases` authored from the JD, with the existing `_validate` discipline extended:
  coding sections must have ≥1 test case and ≥1 **hidden** case (else not meaningfully
  auto-gradable), a supported `language`, and a sane `time_limit_s` (clamped). free_text
  sections (if generated) must carry a non-empty `rubric`.
- **Per-kind idempotency** in `handle_job_published`: today's "regenerate the bank only if
  absent" becomes "ensure each *kind* is present" — a redelivery that already has MCQ sections
  but no coding sections (e.g. a prior partial run, or coding added to an existing job) builds
  *only* the missing kind, never regenerating a kind already banked (regenerating would corrupt
  an in-flight delivery's served order — the same hazard the current bank-vs-plan split guards).

### 3.5 Delivery: section ordering

`AptitudeDelivery` gains a served-section descriptor. Today `order: list[int]` is a permutation
of MCQ question indices; v2 records **which sections were served and their order**, with
per-kind rules:
- **MCQ**: options/questions permuted per candidate as today (anti-cheat).
- **Coding / free_text**: **selected, not permuted** — order is stable, no option shuffling
  (there are no options to shuffle; randomizing a single coding prompt's position adds nothing).
- Submission maps the candidate's positional answers back through the served descriptor exactly
  as today, then dispatches each to its kind's grader. The delivery write stays the
  idempotency/anti-replay anchor (re-fetch is stable; the unique attempt index makes a second
  submit a clean conflict).

### 3.6 Optional additive coupling to the interview blueprint

A **strong coding score** can let `blueprint.py` **skip basic coding probes** in the downstream
interview (don't re-ask what the candidate already demonstrated). This is **purely additive and
optional**: it reads the attempt's `per_section_scores`, and if absent/low changes nothing
(the blueprint behaves exactly as today). Documented as a nice-to-have, gated so it can ship
after the core engine.

### 3.7 Multi-tenancy

Every assessment artifact stays `comp_id`-scoped exactly as today: the bank is keyed by
`job_id` (a job belongs to one `comp_id`), `AptitudeDelivery` and `AptitudeAttempt` already
carry `comp_id`, and the ownership check (`_owned`) gates fetch + submit. `grade_coding` passes
no tenant data to the sandbox beyond the candidate's source + the job's test cases — the
sandbox is tenant-agnostic by construction (see its spec §3.4).

---

## 4. Key decisions & tradeoffs

- **Registry over an `if kind == ...` ladder.** A dict-dispatch registry keeps `grade_aptitude`
  flat (no nested branching — house style), makes each grader independently testable, and makes
  a new kind an additive registration. The MCQ branch is *extracted* into `grade_mcq`
  unchanged, not rewritten — preserving behavior is the first constraint.
- **Keep the flat `score`/`passed` aggregate.** The alternative — teaching the funnel/analytics
  about per-section scores — would touch the funnel seam, CAS, and every reader. Collapsing to
  the existing number + boolean means **zero funnel change**; per-section detail rides along as
  additive fields for richer reporting only. This is the single most important compatibility
  decision.
- **Reuse `aptitude_banks` collection + `aptitude.*` events.** Renaming to "assessment_*" would
  be cleaner naming but a gratuitous data/event migration for no behavioral gain. Richer
  *shape* inside the same document + the same event names = no funnel/topology churn.
- **`grade_coding` owns scoring; the sandbox owns running.** The sandbox returns per-case
  facts, never a score — so the pass-rate weighting (hidden-weighted) is policy that lives with
  the grader and is unit-testable against `FakeCodeRunner` with no Docker. Clean
  separation; the security-critical surface (the runner) stays tiny and single-purpose.
- **Sandbox outage ≠ candidate failure.** Catching `SandboxError` at the `grade_coding`
  boundary and surfacing "ungraded/retryable" (not score 0) is a deliberate fairness
  invariant: infrastructure problems must never silently reject a human from the funnel. (Aligns
  with the platform's advisory/human-first compliance posture.)
- **Reuse the Evaluator for free_text.** A separate rubric-grading agent would duplicate the
  temp-0 + injection-fenced + numeric-validated machinery the Evaluator already has. Reuse keeps
  one grading brain.
- **Coding sections selected, not permuted.** Permutation exists to defeat MCQ answer-sharing;
  it's meaningless for a single coding prompt. Selecting (not shuffling) keeps delivery logic
  honest about what randomization buys per kind.

---

## 5. Testing approach

- **Regression first.** The existing aptitude tests are the MCQ regression baseline and **stay
  green** — `grade_mcq` is the extracted current logic, and an MCQ-only bank must produce the
  identical `score`/`passed`/`aptitude.graded` payload. This is asserted explicitly.
- **Registry / per-grader unit tests** (offline, deterministic):
  - `grade_mcq`: correct/incorrect/out-of-range answer (boundary rejection) — same cases as
    today, now against the extracted grader.
  - `grade_coding`: against **`FakeCodeRunner`** (no Docker) — all-pass → 1.0; some hidden fail
    → hidden-weighted partial; `compile_ok=False` → 0.0; `SandboxError` → ungraded/retryable
    (not 0). Proves the weighting policy without the sandbox.
  - `grade_free_text`: against a **fake LLM** — maps Evaluator score → points; candidate text is
    fenced.
- **Aggregation tests:** mixed bank (mcq + coding) → correct weighted flat `score`; all-MCQ
  bank → byte-identical to today; `per_section_scores` populated; one `aptitude.graded` emitted
  with the right `passed`.
- **Generation tests:** `build_assessment_bank` with a fake LLM yields a valid mixed bank
  (coding sections have ≥1 hidden case, supported language, clamped time limit); **per-kind
  idempotency** — a redelivery with MCQ-present/coding-absent builds only coding, never
  regenerates MCQ.
- **Delivery tests:** MCQ permuted, coding selected/stable; positional answers map back
  correctly across a mixed served set; second submit → conflict (unique attempt index).
- **Gate:** `bash scripts/check.sh` stays green throughout; coding grading never touches a
  container in tests (sandbox behind `FakeCodeRunner`, the same offline-seam discipline as the
  RAG and voice work).

## 6. Open questions

- **Legacy bank shape.** Adapter-on-read vs one-time migration of existing `aptitude_banks`
  docs to the typed section shape — decide in the plan (adapter is lower-risk; migration is
  cleaner long-term). Either way the MCQ scoring result is unchanged.
- **Hidden/visible weights & pass policy.** Proposed hidden ×3 / visible ×1; confirm. Also:
  should a coding section have a per-section minimum (e.g. must compile) or only feed the
  weighted average? Default: feed the average; revisit if recruiters want a hard gate.
- **Admin → sandbox path.** `grade_coding` runs in admin, which today has no mcp-capability
  client. Confirm admin gets the capability gateway (cleanest — reuse the existing client) vs.
  routing coding grading through an ai-agents event. Leaning gateway: keeps grading synchronous
  and `aptitude.graded` emitted from one place.
- **Coding answer size / language set at submit.** The sandbox caps source size and enforces
  the language allow-list; confirm the candidate-facing submit validates the same so a bad
  submission fails fast in admin before the MCP round-trip.
- **Time-limit authority.** `CodingSection.time_limit_s` flows to the sandbox's wall-clock kill
  (clamped to the sandbox's hard ceiling). Confirm the candidate-facing timer and the sandbox
  limit agree.
