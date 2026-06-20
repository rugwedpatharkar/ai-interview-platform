# Backend — `coding-assessment` (Midnight v3)

> **Screen:** Coding assessment + sandbox · **FE consumer:** [`frontend_coding-assessment.md`](./frontend_coding-assessment.md)
> **Status:** **EXISTING — reuse `AptitudeService` + `run_code`.** Restated from [`../../v2-screens/coding-assessment.md`](../../v2-screens/coding-assessment.md) §A. **No proto delta, no new collection, no new endpoint** introduced by this redesign — the v2 typed-sections + sandbox contract is the source of truth. The Midnight redesign is appearance-only.
> **Real-vs-mock today:** the page binds to `api.aptitude.getAptitudeTest`/`submitAptitude` (admin gRPC-web) + the ai-agents `POST /assessment/{id}/run` scratch endpoint; `makeMockAssessmentClient()` (`frontend/apps/candidate/lib/assessment.ts`) drives it under `NEXT_PUBLIC_MOCK`. The reskin changes **markup/classes only** — the served sections, the **byte-identical MCQ scoring**, the run/submit clients, and `aptitude.graded` are all untouched.

## Functionalities
- **Serve** a kind-aware test: typed sections (`mcq` / `coding` / `free_text`) — coding carries prompt + starter code + **visible** cases + a **hidden case count only**.
- **Scratch-run** candidate code against visible cases (+ a hidden aggregate); **does NOT grade or emit**.
- **Submit** kind-tagged answers → flat `{score, passed}`; admin grades + emits the **unchanged** `aptitude.graded`.
- **MCQ scoring stays byte-identical** (regression anchor); the editor is a **textarea fallback** today (Monaco/CodeMirror deferred).
- **Hidden tests masked:** the served DTO and the run result carry **no** hidden stdin/expected/diff — count + aggregate only.

## Service & RPCs
| Function | RPC / endpoint | Auth/scope |
|---|---|---|
| Get test | `admin.aptitude.v1` `GetAptitudeTest({applicationId})` → `AptitudeTest{sections[]}` | bearer; candidate owns the application |
| Submit | `admin.aptitude.v1` `SubmitAptitude({applicationId, answers[]})` → `AptitudeResult{score, passed}` | bearer; candidate owns the application |
| Scratch run | ai-agents REST `POST /assessment/{application_id}/run` `{section_id, language, source}` → run result | bearer; candidate-owned (scratch, no grade/emit) |

FE clients: `api.aptitude.*` (gRPC-web, regenerated `aptitude_pb.ts`) for get/submit; `assessment = makeAssessmentClient(AIAGENTS_URL, store)` (`frontend/apps/candidate/lib/assessment.ts`) for run. `run_code` sandbox is the mcp-capability tool behind the REST run.

## Request / Response structures (FE-side camelCase)
```ts
export type SectionKind = "mcq" | "coding" | "free_text";
export interface VisibleCase { stdin: string; expected: string; }
export interface AssessmentSection {
  id: string; kind: SectionKind; prompt: string; topic?: string;
  options?: string[];                                     // mcq
  language?: string; starterCode?: string;                // coding
  visibleCases?: VisibleCase[]; hiddenCaseCount?: number; timeLimitS?: number;  // coding (count only — no hidden bodies)
}
export interface AssessmentTest { sections: AssessmentSection[]; }
export interface RunCaseResult { visible: boolean; passed: boolean; name?: string; }
export interface RunResult { compileOk: boolean; cases: RunCaseResult[]; hiddenPassed: number; hiddenTotal: number; }
export type SectionAnswer =
  | { kind: "mcq"; option: number }                       // MCQ scoring path — byte-identical to today
  | { kind: "coding"; source: string; language: string }
  | { kind: "free_text"; text: string };
```
- **`getTest`** — `AptitudeTest{sections[]}`; hidden stdin/expected **never** present (grep-test upstream), only `hiddenCaseCount`.
- **`run`** — visible pass/fail + `hiddenPassed`/`hiddenTotal`; **no field** carries hidden bodies (privacy/anti-cheat invariant); scratch (no persist/grade/emit).
- **`submit`** — `{score, passed}` flat result — **unchanged**; the funnel seam (`aptitude.graded`) stays a single emit site in admin.
- **FE mock shape:** the types above + `makeMockAssessmentClient()` (one MCQ + one coding section, scripted run results) — identical to today; the reskin does not touch them.

## Data required
- `aptitude_banks` (typed sections; adapter-on-read for legacy MCQ banks — no migration). Grading via `resources/graders.py` (`grade_mcq` byte-identical; `grade_coding` hidden-weighted ×3/×1; `grade_free_text`). Sandbox enforces the STOP-SHIP isolation flags. **All unchanged** by this redesign.

## Errors & edge cases
- Run idle → running → results → run-error: errors are **inline `Alert` + Retry** (not a vanishing toast mid-test) — preserve.
- Sandbox outage at **grade** time → `SectionUngradable` (retryable, **never score 0**, no attempt row, no emit) — backend fairness invariant; FE shows a submit error.
- Served test with zero sections → `EmptyState` (not a blank page).
- `PERMISSION_DENIED` (not owner) / `FAILED_PRECONDITION` (wrong state / past time limit) surfaced via `errorMessage`.

## Cross-references
- Shared contract: [`../../v2-screens/coding-assessment.md`](../../v2-screens/coding-assessment.md) §A (typed sections, `run_code` sandbox, the masked-hidden + MCQ-byte-identical invariants).
- Shared enum/event: `aptitude.graded` (single emit site, admin) — unchanged.
- `pnpm gen` regenerates `frontend/packages/api-client/src/gen/aptitude_pb.ts` — **do not hand-edit `src/gen`** (no regen needed for an appearance-only reskin).
