# Coding assessment — Backend contract (v3 · frozen)

> **Screen.** Coding assessment + sandbox (`/aptitude/[applicationId]`). **FE consumer:** [`frontend_coding-assessment.md`](./frontend_coding-assessment.md).
> **Status:** `EXISTING — reuse AptitudeService + run_code.` Restated from [`../../v2-screens/coding-assessment.md`](../../v2-screens/coding-assessment.md) §A. **No proto delta, no new collection, no new endpoint.** The v2 typed-sections + sandbox contract is the source of truth; the v3 Aperture Pro redesign is appearance-only (plus a v3-only FE upgrade of the editor from textarea → Monaco, which does not affect the contract).
> **Anti-fiction reminder.** Aptura is pre-launch. This contract describes only what the UI consumes today — no claimed language coverage we haven't implemented, no fabricated runtime benchmarks. The "+N hidden tests" UI surface is an **architectural truth** (hidden bodies are server-stripped; the DTO has no field for them) — preserve it.
> **Real-vs-mock today.** The page binds to `api.aptitude.getAptitudeTest` / `submitAptitude` (admin gRPC-web) + the ai-agents `POST /assessment/{id}/run` scratch endpoint; `makeMockAssessmentClient()` (`frontend/apps/candidate/lib/assessment.ts`) drives it under `NEXT_PUBLIC_MOCK`. The rebuild changes markup/classes only — the served sections, the **byte-identical MCQ scoring**, the run/submit clients, and the `aptitude.graded` emit are all untouched.

## Functionalities

- **Serve** a kind-aware test: typed sections (`mcq` / `coding` / `free_text`) — coding carries prompt + starter code + **visible** cases + a **hidden case count only**.
- **Scratch-run** candidate code against visible cases (+ a hidden aggregate); **does NOT grade or emit**.
- **Submit** kind-tagged answers → flat `{score, passed}`; admin grades + emits the **unchanged** `aptitude.graded` funnel event.
- **MCQ scoring stays byte-identical** (regression anchor); the editor upgrades from textarea → Monaco on the FE, but the request/response contract is unchanged.
- **Hidden tests masked.** The served DTO and the run result carry **no** hidden stdin / expected / diff — count + aggregate only.

## Service & RPCs

| Function | RPC / endpoint | Auth/scope |
|---|---|---|
| Get test | `admin.aptitude.v1` `GetAptitudeTest({applicationId})` → `AptitudeTest{sections[]}` | bearer; candidate owns the application |
| Submit | `admin.aptitude.v1` `SubmitAptitude({applicationId, answers[]})` → `AptitudeResult{score, passed}` | bearer; candidate owns the application |
| Scratch run | ai-agents REST `POST /assessment/{application_id}/run` `{section_id, language, source}` → run result | bearer; candidate-owned (scratch, no grade / emit) |

FE clients: `api.aptitude.*` (gRPC-web, regenerated `aptitude_pb.ts`) for get / submit; `assessment = makeAssessmentClient(AIAGENTS_URL, store)` (`frontend/apps/candidate/lib/assessment.ts`) for run. `run_code` sandbox is the mcp-capability tool behind the REST run.

## Request / Response structures (FE-side camelCase)

```ts
export type SectionKind = "mcq" | "coding" | "free_text";

export interface VisibleCase { stdin: string; expected: string; }

export interface AssessmentSection {
  id: string;
  kind: SectionKind;
  prompt: string;
  topic?: string;
  options?: string[];                                     // mcq
  language?: string;
  starterCode?: string;                                   // coding
  visibleCases?: VisibleCase[];
  hiddenCaseCount?: number;                               // coding — count only, no hidden bodies
  timeLimitS?: number;
}

export interface AssessmentTest { sections: AssessmentSection[]; }

export interface RunCaseResult { visible: boolean; passed: boolean; name?: string; }

export interface RunResult {
  compileOk: boolean;
  cases: RunCaseResult[];                                 // visible cases (per-case pass/fail)
  hiddenPassed: number;                                   // aggregate only
  hiddenTotal: number;
}

export type SectionAnswer =
  | { kind: "mcq"; option: number }                       // byte-identical to today
  | { kind: "coding"; source: string; language: string }
  | { kind: "free_text"; text: string };

export interface AptitudeResult { score: number; passed: boolean; }
```

- **`getTest`** — `AptitudeTest{sections[]}`; hidden stdin / expected **never** present (grep-test upstream), only `hiddenCaseCount`.
- **`run`** — visible pass/fail + `hiddenPassed` / `hiddenTotal`; **no field** carries hidden bodies (privacy / anti-cheat invariant); scratch (no persist / grade / emit).
- **`submit`** — `{score, passed}` flat result — **unchanged**; the funnel seam (`aptitude.graded`) stays a single emit site in admin.
- **FE mock shape:** the types above + `makeMockAssessmentClient()` (one MCQ + one coding section, scripted run results) — identical to today; the rebuild does not touch them.

## Data required

- `aptitude_banks` (typed sections; adapter-on-read for legacy MCQ banks — no migration). Grading via `resources/graders.py` (`grade_mcq` byte-identical; `grade_coding` hidden-weighted ×3/×1; `grade_free_text`). Sandbox enforces the STOP-SHIP isolation flags. **All unchanged** by this redesign.

## Errors & edge cases

- Run `idle` → `running` → `results` → `run-error`: errors are **inline warn-tone `.cell` Alert + Retry** (not a vanishing toast mid-test) — preserve.
- Sandbox outage at **grade** time → `SectionUngradable` (retryable, **never score 0**, no attempt row, no emit) — backend fairness invariant; the FE shows a submit-error toast.
- Served test with zero sections → neutral-tone `.cell` empty state (not a blank page).
- `PERMISSION_DENIED` (not owner) / `FAILED_PRECONDITION` (wrong state / past time limit) surfaced via `errorMessage`.

## Cross-references

- Shared contract: [`../../v2-screens/coding-assessment.md`](../../v2-screens/coding-assessment.md) §A (typed sections, `run_code` sandbox, the masked-hidden + MCQ-byte-identical invariants).
- Shared enum / event: `aptitude.graded` (single emit site, admin) — unchanged.
- `pnpm gen` regenerates `frontend/packages/api-client/src/gen/aptitude_pb.ts` — **do not hand-edit `src/gen`** (no regen needed for an appearance-only rebuild).
- Design language: [`../_design-language.md`](../_design-language.md) — `.cell` primitive for the 2-column problem | editor layout; `.cell-visual` for the mono sample-test blocks; `.pill.pill-neutral` for the "+N hidden tests" count.
