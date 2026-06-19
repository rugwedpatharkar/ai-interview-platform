# Screen: Coding assessment + sandbox — FE plan + BE contract

> Part of the [v2 build program](../2026-06-20-v2-build-program.md) (Wave 2).
> **Route:** `apps/candidate/app/aptitude/[applicationId]/page.tsx` (**EXTEND** to typed sections incl. coding) · **Mockup:** `aptura_coding_assessment` · **Pillar:** [rich-assessments](../../v2/2026-06-19-rich-assessments.md) + [code-execution-sandbox](../../v2/2026-06-19-code-execution-sandbox.md)
> **Goal:** The candidate assessment page becomes **kind-aware** — it serves typed sections (`mcq` / `coding` / `free_text`). A coding section renders a problem pane + a **code editor** (CodeMirror from CDN) + Run/Submit, with **visible** test results shown and **hidden** tests masked to a count + aggregate. The grader runs candidate code in a Docker sandbox via a new `run_code` capability and emits the **unchanged** `aptitude.graded` event.

Today the page is **MCQ-only**: it fetches `api.aptitude.getAptitudeTest({applicationId})` → `questions[]`, renders a `RadioGroup` per `q.options`, and submits `answers: number[]`. A generated coding section has **no surface** — a candidate served one literally cannot answer. This plan generalizes the body from "map questions" to "map served sections, dispatch on `kind`", adds the coding card (editor + Run + results), and threads a **scratch** run-code path (does NOT grade) to ai-agents. The MCQ path stays **byte-identical** (regression anchor — the rich-assessments backend plan guarantees the same `score`/`passed`/`aptitude.graded`).

---

## A. Backend contract (hand this to a backend session)

Two coordinated deltas: (A.1) **EXTEND `AptitudeService`** (admin gRPC-web) to serve + accept typed sections; (A.2) **NEW `run_code`** capability (mcp-capability Docker sandbox) reachable from a thin candidate-facing **REST** run endpoint on ai-agents. Grading + the `aptitude.graded` emit stay in **admin** (one emit site).

### A.1 — `AptitudeService` typed sections (EXTEND)

**Status:** EXTEND · **Service:** `admin.aptitude.v1` (gRPC-web; proto `src/admin/app/routes/pb/aptitude.proto`)

`getAptitudeTest` today returns MCQ-shaped `AptitudeQuestion{index, question, options, topic}`. Generalize the served unit to carry `kind` + per-kind payload; generalize `submitAptitude` to a kind-tagged positional answer. The flat result (`score`/`passed`) is **unchanged** (the funnel seam is sacred — rich-assessments TIERS A–C keep it).

```proto
// service: admin.aptitude.v1 — EXTEND (additive; MCQ path byte-compatible)
rpc GetAptitudeTest(GetAptitudeTestRequest) returns (AptitudeTest);
rpc SubmitAptitude(SubmitAptitudeRequest) returns (AptitudeResult);

message AptitudeSection {
  string id = 1; string kind = 2;            // "mcq" | "coding" | "free_text"
  string prompt = 3; string topic = 4;
  // mcq
  repeated string options = 5;
  // coding
  string language = 6; string starter_code = 7;
  repeated VisibleCase visible_cases = 8;    // hidden cases are NEVER sent — only their count
  int32 hidden_case_count = 9; int32 time_limit_s = 10;
}
message VisibleCase { string stdin = 1; string expected = 2; }
message AptitudeTest { repeated AptitudeSection sections = 1; }

message SectionAnswer {
  string section_id = 1; string kind = 2;
  int32 option = 3;                          // mcq: selected option index
  string source = 4; string language = 5;    // coding: final submitted source
  string text = 6;                            // free_text
}
message SubmitAptitudeRequest { string application_id = 1; repeated SectionAnswer answers = 2; }
message AptitudeResult { int32 score = 1; bool passed = 2; }   // UNCHANGED flat result
```
- **Request:** `GetAptitudeTest{application_id}` (bearer, candidate scope); `SubmitAptitude{application_id, answers[]}` (kind-tagged positional answers mapped back to the served descriptor).
- **Response (FE renders these):** `AptitudeTest{sections[]}` — each section's `kind` + payload; coding carries `prompt`/`language`/`starter_code`/`visible_cases[]`/`hidden_case_count`/`time_limit_s`. **Hidden test stdin/expected are NEVER in the DTO** — only `hidden_case_count` (grep-test: no hidden case body on the served shape). `SubmitAptitude` → `AptitudeResult{score, passed}` (unchanged).
- **Auth/scope:** bearer; candidate must own the application (existing ownership/state/time-limit checks in `resources/aptitude.py` unchanged). MCQ sections permuted as today; coding sections selected, stable (not permuted) — rich-assessments Task 9.
- **Backed by:** `resources/aptitude.py` (delivery + grading + the single `publisher.publish("aptitude.graded", {application_id, passed})`) dispatching via the **grader registry** (`resources/graders.py`: `grade_mcq` extracted, `grade_coding`, `grade_free_text`); `model/assessment.py` typed sections; `aptitude_banks` collection (richer shape, **no data migration** — adapter-on-read for legacy MCQ banks). Per [rich-assessments](../../v2/2026-06-19-rich-assessments.md) TIERS A–C.
- **Proto/REST file:** `src/admin/app/routes/pb/aptitude.proto` → `pnpm gen` regenerates `frontend/packages/api-client/src/gen/aptitude_pb.ts` (**do not hand-edit `src/gen`**).

### A.2 — `run_code` sandbox + candidate-facing run endpoint (NEW)

**Status:** NEW · **Service:** mcp-capability tool `run_code` (Docker sandbox) + a thin ai-agents REST run endpoint (scratch execution — does NOT grade or emit).

```
# mcp-capability tool (the sandbox) — code-execution-sandbox plan, behind a CodeRunner seam:
run_code(language: str, source: str, test_cases: list[dict]) -> RunResult
  RunResult { compile_ok: bool, compile_error: str, cases: [CaseResult] }
  CaseResult { hidden: bool, passed: bool, status: "ok"|"wrong"|"timeout"|"oom"|"error",
               stdout_truncated: str, duration_ms: int }

# candidate-facing REST (ai-agents; mirrors interview.ts — scratch run, no grade/emit):
POST /assessment/{application_id}/run            (bearer; candidate-owned)
  body { "section_id": str, "language": str, "source": str }
→ 200 { "compileOk": bool, "cases": [{ "visible": bool, "passed": bool, "name": str? }],
        "hiddenPassed": int, "hiddenTotal": int }
```
- **Request:** `{section_id, language, source}` — the candidate's in-progress source for a **visible** scratch run against the section's cases.
- **Response (FE renders these):** per-**visible**-case pass/fail + a **hidden** aggregate (`hiddenPassed`/`hiddenTotal`). **Raw hidden stdin/expected/diff are NEVER returned** — the response type has no field for it (assert in the client type). Run is **scratch**: it does **not** persist an attempt, grade, or emit `aptitude.graded`.
- **Auth/scope:** bearer; candidate owns the application (same ownership check as `/interview/{id}/proctor`). Rate-limited; `source` size + language validated at the mcp-capability boundary (`run_code` allow-list, `sandbox_max_source_bytes`).
- **Backed by:** ai-agents reaches the sandbox via the existing MCP client (`infra/mcp_capability.py::McpCapability.run_code` — code-execution-sandbox Task 5); the sandbox enforces the STOP-SHIP isolation flags (`--network=none`, read-only FS, non-root, mem/cpu/pids caps, host-side wall-clock kill, output cap, always-reap). Tests use `FakeCodeRunner` (no Docker in the gate).
- **Grading path (separate, admin):** the **final** `submitAptitude` → admin `grade_coding(section, answer, *, capability)` → `capability.run_code(...)` → hidden-weighted score (hidden ×3 / visible ×1) → aggregate into the flat `score`/`passed` → the **unchanged** `aptitude.graded`. A `SandboxError` at grade time → `SectionUngradable` (retryable, **never score 0**; no attempt row, no emit). Per [rich-assessments](../../v2/2026-06-19-rich-assessments.md) Tasks 5–6.
- **REST file:** `src/ai-agents/app/routes/` (new `/assessment/{id}/run` route, mirroring `interview_api.py`); the sandbox tool is `src/mcp-capability/app/tools.py::run_code` + `server.py` wrapper.
- **Why REST for run, gRPC for submit:** run is a **long, sandbox-bound scratch** call (matches the ai-agents REST precedent for interview) that must NOT grade; submit/grading stay on the admin gRPC `AptitudeService` to keep the **single `aptitude.graded` emit site** (rich-assessments Task F1).

**FE mock shape** (`frontend/packages/shared/src/assessment.ts` types) — the FE codes against this until the deltas land:
```ts
export type SectionKind = "mcq" | "coding" | "free_text";
export interface VisibleCase { stdin: string; expected: string; }
export interface AssessmentSection {
  id: string; kind: SectionKind; prompt: string; topic?: string;
  options?: string[];                                  // mcq
  language?: string; starterCode?: string;             // coding
  visibleCases?: VisibleCase[]; hiddenCaseCount?: number; timeLimitS?: number;  // coding
}
export interface AssessmentTest { sections: AssessmentSection[]; }
// Run result — VISIBLE cases only + a hidden aggregate. There is intentionally NO field
// carrying hidden stdin/expected/diff to the candidate (the privacy/anti-cheat invariant).
export interface RunCaseResult { visible: boolean; passed: boolean; name?: string; }
export interface RunResult { compileOk: boolean; cases: RunCaseResult[]; hiddenPassed: number; hiddenTotal: number; }
export type SectionAnswer =
  | { kind: "mcq"; option: number }
  | { kind: "coding"; source: string; language: string }
  | { kind: "free_text"; text: string };
```

---

## B. Frontend plan (TDD, bite-sized)

**Files:**
- Create: `frontend/packages/shared/src/assessment.ts` (the types above + `makeAssessmentClient()` REST run client + `makeMockAssessmentClient()`)
- Modify: `frontend/packages/shared/src/index.ts` (export the assessment client + types)
- Modify: `frontend/apps/candidate/lib/auth.tsx` (wire an `assessment` client from `AIAGENTS_URL` + `store`, like `interview`/`proctor`)
- Create: `frontend/packages/ui/src/code-editor.tsx` (CodeMirror-from-CDN editor behind a controlled `{value,language,onChange,disabled}` seam) + export from `frontend/packages/ui/src/index.ts`
- Create: `frontend/apps/candidate/components/coding-section.tsx` (problem pane + editor + Run + results)
- Modify: `frontend/apps/candidate/app/aptitude/[applicationId]/page.tsx` (kind-aware: map served sections, dispatch on `kind`)
- Create tests: `assessment.test.ts` (mock client + the never-leak type guard), `coding-section.test.tsx`

**Components:** new `CodeEditor` (`@ip/ui`), `CodingSection` (candidate app); reuse `@ip/ui` `Card`, `CardContent`, `Button`, `Badge`, `Alert`, `Spinner`, `Select`, `RadioGroup`/`RadioGroupItem` (MCQ verbatim), `Textarea` (free_text), `Icon`, `toast`, `Progress`.
**Query keys:** existing `["aptitude", applicationId]` (the served test). Run is a `useMutation` keyed off the active coding section; submit is the existing `useMutation`.
**Deps:** CodeMirror loads from **CDN at runtime** (no package added — matches the "no new third-party deps" gate rule); the editor mounts client-only (no SSR touch).

> **Build-against-mock seam.** `makeMockAssessmentClient()` returns a fixture `AssessmentTest` with one MCQ + one coding section, and a fake `run()` that returns scripted `RunResult`s (some visible pass/fail + a hidden aggregate) — so the page + editor + results panel build and preview **before** the proto regenerates or the sandbox lands. Toggle on `NEXT_PUBLIC_MOCK=1`. The page component is identical against mock vs. real — only the client binding swaps (`getAptitudeTest`/`submitAptitude` flip to the regenerated gRPC client; `run` flips to the REST client).

### Task 1: Assessment types + mock client + the never-leak guard (pure, testable)

- [ ] **Step 1: Write the failing test** — `frontend/packages/shared/src/assessment.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { makeMockAssessmentClient } from "./assessment.js";

describe("mock assessment client", () => {
  it("serves an mcq + a coding section with masked hidden tests", async () => {
    const c = makeMockAssessmentClient();
    const test = await c.getTest("app1");
    expect(test.sections.map((s) => s.kind)).toContain("coding");
    const coding = test.sections.find((s) => s.kind === "coding")!;
    expect(coding.visibleCases!.length).toBeGreaterThan(0);
    expect(coding.hiddenCaseCount).toBeGreaterThan(0);   // count only, never bodies
  });
  it("run returns visible cases + a hidden aggregate, never hidden bodies", async () => {
    const c = makeMockAssessmentClient();
    const r = await c.run("app1", { sectionId: "s2", language: "python", source: "print(1)" });
    expect(r.cases.every((x) => "visible" in x && "passed" in x)).toBe(true);
    // privacy invariant: no hidden stdin/expected/diff anywhere in the result
    expect(JSON.stringify(r)).not.toMatch(/stdin|expected|diff/);
    expect(r).toHaveProperty("hiddenPassed");
    expect(r).toHaveProperty("hiddenTotal");
  });
});
```
- [ ] **Step 2: Run → FAIL** — `npx pnpm@9.15.0 --filter @ip/shared test assessment`. *(If the shared package has no test runner wired, add `vitest` + a `test` script first — fold into this task.)*
- [ ] **Step 3: Implement** `frontend/packages/shared/src/assessment.ts` — the types (from Part A) + the REST client + the mock:
```ts
import { authedFetch, restAuthFor } from "./authed-fetch.js";
import { HttpError } from "./errors.js";
import type { TokenStore } from "./tokens.js";
// …re-export the AssessmentSection / RunResult / SectionAnswer types from Part A…

export interface RunArgs { sectionId: string; language: string; source: string; }

// REST run client — mirrors makeInterviewClient: authedFetch so a mid-test token expiry
// silently refreshes + retries. Run is SCRATCH (no grade/emit). The RunResult type has no
// hidden-body field, so the candidate can never receive hidden stdin/expected/diff.
export function makeAssessmentClient(baseUrl: string, store: TokenStore) {
  const auth = restAuthFor(store);
  async function run(applicationId: string, args: RunArgs, signal?: AbortSignal): Promise<RunResult> {
    const res = await authedFetch(
      `${baseUrl}/assessment/${applicationId}/run`,
      { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ section_id: args.sectionId, language: args.language, source: args.source }) },
      auth, signal,
    );
    if (!res.ok) {
      const b = (await res.json().catch(() => null)) as { detail?: string } | null;
      throw new HttpError(res.status, b?.detail ?? `Run failed (${res.status})`, b?.detail);
    }
    return (await res.json()) as RunResult;
  }
  return { run };
}

export function makeMockAssessmentClient() {
  const test: AssessmentTest = {
    sections: [
      { id: "s1", kind: "mcq", prompt: "Big-O of binary search?", options: ["O(n)", "O(log n)", "O(1)", "O(n²)"], topic: "algorithms" },
      { id: "s2", kind: "coding", prompt: "Return the sum of a list of integers from stdin (space-separated).",
        language: "python", starterCode: "import sys\n\ndef solve(nums):\n    # your code here\n    ...\n\nprint(solve([int(x) for x in sys.stdin.read().split()]))\n",
        visibleCases: [{ stdin: "1 2 3", expected: "6" }, { stdin: "10 -5", expected: "5" }],
        hiddenCaseCount: 3, timeLimitS: 10 },
    ],
  };
  return {
    getTest: async (_appId: string): Promise<AssessmentTest> => test,
    run: async (_appId: string, args: RunArgs): Promise<RunResult> => {
      const ok = args.source.includes("sum") || args.source.includes("+");
      return { compileOk: true,
        cases: [{ visible: true, passed: ok, name: "case 1" }, { visible: true, passed: ok, name: "case 2" }],
        hiddenPassed: ok ? 3 : 1, hiddenTotal: 3 };
    },
    submit: async (_appId: string, _answers: SectionAnswer[]) => ({ score: 80, passed: true }),
  };
}
```
- [ ] **Step 4: Run → PASS** + `--filter @ip/shared typecheck`. Export the client + types from `frontend/packages/shared/src/index.ts`.
- [ ] **Step 5: Commit** — `git commit -am "feat(assessment): typed sections + REST run client + mock (never-leak guarded)"`

### Task 2: Wire the assessment client in candidate auth

- [ ] **Step 1:** In `frontend/apps/candidate/lib/auth.tsx`, construct an `assessment` client the same way as `interview`/`chat`/`proctor`:
```ts
import { makeAssessmentClient } from "@ip/shared";
/** Scratch code-run client (ai-agents REST), sharing the candidate's token store. */
export const assessment = makeAssessmentClient(AIAGENTS_URL, store);
```
- [ ] **Step 2: Verify** — `--filter @ip/candidate typecheck` clean.
- [ ] **Step 3: Commit** — `git commit -am "feat(candidate): wire assessment run client"`

### Task 3: `CodeEditor` — CodeMirror-from-CDN behind a controlled seam

A controlled `{value, language, onChange, disabled}` component. Internals load **CodeMirror 6 from CDN** (no package, no worker-CDN story); the seam means a later swap to a bundled editor (or back to a `<textarea>`) is a **one-file** change with no page/data/grader impact. Mounts **client-only** via `next/dynamic({ssr:false})` so SSR never touches `window`.

- [ ] **Step 1: Write the failing test** — `frontend/packages/ui/src/code-editor.test.tsx`: renders with `aria-label` including the language; calls `onChange` when the controlled value changes; respects `disabled`. (Test the **controlled contract** + a11y, not CodeMirror internals — render a fallback `<textarea>` in jsdom where CDN/CM is unavailable.)
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `frontend/packages/ui/src/code-editor.tsx`:
```tsx
"use client";
import { useEffect, useRef } from "react";
import { cn } from "./cn.js";

export interface CodeEditorProps {
  value: string; language: string; onChange: (v: string) => void; disabled?: boolean; className?: string;
}

// Controlled CodeMirror-6 editor loaded from CDN (no package added; the gate stays
// dependency-free). SSR-safe: the CM mount happens in useEffect (client-only). The
// {value,language,onChange,disabled} contract is the SWAP SEAM — replacing CM with a bundled
// editor or a <textarea> changes ONLY this file. A jsdom/no-CDN fallback renders a controlled
// monospace <textarea> so the component is always functional + testable.
export function CodeEditor({ value, language, onChange, disabled, className }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<{ destroy(): void; dispatch(t: unknown): void } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cm = await loadCodeMirrorFromCDN().catch(() => null);   // import() the CM6 ESM bundle
      if (cancelled || !cm || !host.current) return;                // fallback <textarea> stays
      view.current = cm.mount(host.current, { doc: value, language, readOnly: disabled, onChange });
    })();
    return () => { cancelled = true; view.current?.destroy(); view.current = null; };
  }, [language, disabled]);   // value is pushed via dispatch below, not a remount
  // (CM value sync + the loadCodeMirrorFromCDN/mount helper live in this file)
  return (
    <div className={cn("rounded-lg border border-border bg-surface-muted", className)}>
      {/* CM mounts here when CDN is available; otherwise the controlled textarea fallback renders */}
      <div ref={host} aria-label={`Code answer (${language})`} />
      <textarea
        data-cm-fallback
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-label={`Code answer (${language})`}
        className="hidden w-full resize-y bg-transparent p-3 font-mono text-sm text-foreground outline-none [&:only-child]:block"
      />
    </div>
  );
}
```
*(The executor wires the exact CodeMirror 6 CDN ESM URL + the `mount`/value-sync helpers; the **contract** the page depends on is the `{value,language,onChange,disabled}` controlled props. Tab-to-indent is out of scope — do NOT trap Tab, that's an a11y regression. Dark/tokens come from the `bg-surface-muted`/`text-foreground` classes.)*
- [ ] **Step 4: Run → PASS** + `--filter @ip/ui typecheck`. Export `CodeEditor` from `frontend/packages/ui/src/index.ts`.
- [ ] **Step 5: Commit** — `git commit -am "feat(ui): CodeEditor (CodeMirror-from-CDN behind a controlled seam)"`

### Task 4: `CodingSection` — problem pane + editor + Run + masked results

- [ ] **Step 1: Write the failing test** — `coding-section.test.tsx`: renders the prompt + the visible cases + a "+N hidden tests" line (count only); clicking Run calls the injected `onRun` and renders per-visible-case pass/fail + a hidden aggregate ("hidden tests: 3/5 passed"); a running state disables Run; asserts **no hidden stdin/expected** is ever in the DOM.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `frontend/apps/candidate/components/coding-section.tsx`:
```tsx
"use client";
import { Button, Card, CardContent, Badge, Alert, Spinner, Icon } from "@ip/ui";
import { CodeEditor } from "@ip/ui";
import type { AssessmentSection, RunResult } from "@ip/shared";

export interface CodingSectionProps {
  section: AssessmentSection;
  source: string; onSource: (v: string) => void;
  onRun: () => void; running: boolean; result?: RunResult; error?: string;
  timeLeft?: string;                                  // mm:ss countdown (Task 6)
}
export function CodingSection({ section, source, onSource, onRun, running, result, error, timeLeft }: CodingSectionProps) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 lg:grid lg:grid-cols-2 lg:gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold text-foreground">Coding task</h3>
            {timeLeft && <Badge tone="neutral" variant="subtle">{timeLeft}</Badge>}
          </div>
          <p className="whitespace-pre-wrap text-sm text-foreground">{section.prompt}</p>
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">Sample tests</p>
            {(section.visibleCases ?? []).map((c, i) => (
              <div key={i} className="rounded-md bg-surface-muted px-2.5 py-1.5 font-mono text-xs text-foreground">
                <span className="text-muted-foreground">in:</span> {c.stdin} → <span className="text-muted-foreground">out:</span> {c.expected}
              </div>
            ))}
            {!!section.hiddenCaseCount && (
              <p className="text-xs text-muted-foreground">+{section.hiddenCaseCount} hidden tests (run on submit)</p>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <CodeEditor value={source} language={section.language ?? "python"} onChange={onSource} disabled={running} />
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onRun} disabled={running}>
              {running ? <span className="flex items-center gap-2"><Spinner /> Running tests…</span> : "Run tests"}
            </Button>
          </div>
          {error && <Alert tone="danger"><span className="flex flex-col items-start gap-2">{error}<Button variant="outline" size="sm" onClick={onRun}>Retry</Button></span></Alert>}
          {result && (
            <div className="flex flex-col gap-1.5" role="status" aria-live="polite">
              {!result.compileOk && <Alert tone="danger">Your code didn't compile.</Alert>}
              {result.cases.map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <Icon name={c.passed ? "check" : "x"} className={c.passed ? "size-4 text-success-foreground" : "size-4 text-danger-foreground"} />
                  <span className="text-foreground">{c.name ?? `Case ${i + 1}`}</span>
                  <Badge tone={c.passed ? "success" : "danger"} variant="subtle">{c.passed ? "passed" : "failed"}</Badge>
                </div>
              ))}
              <p className="text-sm text-muted-foreground">Hidden tests: {result.hiddenPassed}/{result.hiddenTotal} passed</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```
- [ ] **Step 4: Run → PASS** + `--filter @ip/candidate typecheck`. (Confirm `Icon` names `check`/`x` exist; substitute real lucide names + import them in the candidate app if needed.)
- [ ] **Step 5: Commit** — `git commit -am "feat(assessment): CodingSection (problem pane + editor + masked results)"`

### Task 5: Make the page kind-aware (map served sections, dispatch on `kind`)

Generalize `frontend/apps/candidate/app/aptitude/[applicationId]/page.tsx` from "map `questions`" to "map `sections`, dispatch on `kind`", keeping the file's existing structure (the `useQuery` poll with `MAX_PREPARE_POLLS`, `useRequireAuth`, the preparing/stalled/error alerts, the result card). **MCQ renders verbatim** (regression).

- [ ] **Step 1:** Generalize state + the query/submit:
```tsx
// answers keyed by section id, kind-tagged
const [answers, setAnswers] = useState<Record<string, SectionAnswer>>({});
const [results, setResults] = useState<Record<string, RunResult>>({});

const test = useQuery({
  queryKey: ["aptitude", applicationId],
  enabled: Boolean(token),
  retry: false,
  queryFn: () => api.aptitude.getAptitudeTest({ applicationId }),   // regenerated → sections[]
  refetchInterval: (q) => /* unchanged preparing-poll predicate */ 3000,
});
const sections = test.data?.sections ?? [];
const answered = (s: AssessmentSection): boolean => {
  const a = answers[s.id];
  if (!a) return false;
  if (a.kind === "mcq") return a.option >= 0;
  if (a.kind === "coding") return a.source.trim().length > 0;
  return a.text.trim().length > 0;
};
const allAnswered = sections.length > 0 && sections.every(answered);

const run = useMutation({
  mutationFn: (s: AssessmentSection) => {
    const a = answers[s.id];
    const src = a?.kind === "coding" ? a.source : (s.starterCode ?? "");
    return assessment.run(applicationId, { sectionId: s.id, language: s.language ?? "python", source: src });
  },
  onSuccess: (r, s) => setResults((m) => ({ ...m, [s.id]: r })),
  onError: (err) => toast.error(errorMessage(err)),
});

const submit = useMutation({
  mutationFn: () => api.aptitude.submitAptitude({
    applicationId,
    answers: sections.map((s) => ({ sectionId: s.id, kind: s.kind, ...toWire(answers[s.id], s) })),
  }),
  onError: (err) => toast.error(errorMessage(err)),
});
```
- [ ] **Step 2:** Per-kind render — dispatch in the section map (seed coding answers from `starterCode`):
```tsx
{sections.map((s, i) => {
  if (s.kind === "mcq") return <McqCard key={s.id} section={s} index={i} total={sections.length} value={answers[s.id]} onChange={...} />;  // the EXISTING RadioGroup block, extracted verbatim
  if (s.kind === "coding") {
    const a = answers[s.id];
    const source = a?.kind === "coding" ? a.source : (s.starterCode ?? "");
    return <CodingSection key={s.id} section={s}
      source={source}
      onSource={(v) => setAnswers((m) => ({ ...m, [s.id]: { kind: "coding", source: v, language: s.language ?? "python" } }))}
      onRun={() => run.mutate(s)} running={run.isPending && run.variables?.id === s.id}
      result={results[s.id]} error={run.isError && run.variables?.id === s.id ? errorMessage(run.error) : undefined} />;
  }
  return <FreeTextCard key={s.id} section={s} value={answers[s.id]} onChange={...} />;  // prompt + Textarea
})}
```
- [ ] **Step 3:** Keep the `allAnswered`-gated single **Submit** + the existing success result card (`submit.data.score`/`passed`) **unchanged** — the flat result contract is preserved by the backend. Widen the page from `max-w-xl` to `max-w-3xl` when any coding section is present (editor + results need room). Add an `EmptyState` for a served test with zero sections.
- [ ] **Step 4: Verify build + preview** — `NEXT_PUBLIC_MOCK=1 npx pnpm@9.15.0 --filter @ip/candidate build` clean; then the preview loop: load `/aptitude/<id>`, confirm the MCQ renders as today, the coding section shows the prompt + editor seeded with starter code + sample tests + "+3 hidden tests", **Run** shows per-visible-case pass/fail + the hidden aggregate, Submit is gated until every section is answered, and the success card shows the score. Screenshot.
- [ ] **Step 5: Commit** — `git commit -am "feat(assessment): kind-aware candidate page (mcq verbatim + coding + free_text)"`

### Task 6: Per-section coding timer (advisory; auto-submit on expiry)

- [ ] **Step 1:** Add a small `useCountdown(seconds)` hook in the candidate `lib/` (no shared timer primitive exists — mirror the interview page's `useEffect`+`useRef` discipline) returning `mm:ss` + an `onExpire` callback. Coding sections carry `timeLimitS`.
- [ ] **Step 2:** Surface the countdown in `CodingSection` (`timeLeft` prop). On expiry, auto-fire Submit with whatever is entered (don't strand the candidate). Backend time-limit stays authoritative (admin enforces the delivery limit); the client timer is advisory UX.
- [ ] **Step 3: Verify** — `--filter @ip/candidate build` clean; preview the countdown ticking + auto-submit at zero (use a short `timeLimitS` fixture in the mock). **Step 4: Commit.**

### Task 7: Regenerate the gRPC client + verify the full app

- [ ] **Step 1:** Once A.1 lands (the admin proto delta), `pnpm gen` regenerates `frontend/packages/api-client/src/gen/aptitude_pb.ts` (`sections[]` + kind-tagged submit). **Do not hand-edit `src/gen`.** Until then the page builds against the mock (`NEXT_PUBLIC_MOCK=1`).
- [ ] **Step 2: Verify** — `npx pnpm@9.15.0 --filter @ip/candidate build` + `--filter @ip/{ui,shared,api-client} typecheck` green (against a **stopped** dev server — never `next build` while `pnpm dev` is live). Run the shared + UI tests.
- [ ] **Step 3: Commit** — `git commit -am "chore(assessment): integrate regenerated aptitude client"`

---

## C. States & acceptance

- **States:** loading (`LoadingState` while the test fetches — exists), preparing/stalled (the existing poll alerts — keep), empty (a served test with zero sections → `EmptyState`, not a blank page), **run idle → running → results → run-error** (per coding section: idle Run enabled; running disables Run + shows `Spinner` "Running tests…"; results show per-visible-case pass/fail + the hidden aggregate; error is an **inline** `Alert` with a Retry that re-fires the run — NOT a toast that vanishes mid-test), submitted (the existing score/`passed` card — unchanged), submit-error (toast — exists). No silent dead-ends.
- **Hidden tests masked (load-bearing):** visible cases show `stdin → expected`; hidden cases show **count only** ("+N hidden tests") pre-run and a **`hiddenPassed/hiddenTotal` aggregate** post-run. The `RunResult` type has **no field** for hidden stdin/expected/diff (Task 1 grep-test); `CodingSection` never renders hidden bodies (Task 4 DOM assertion). Hidden-case internals stay server-side.
- **MCQ regression (FE headline):** an MCQ-only served test renders the **identical** `RadioGroup` flow and submits the same shape → the result card is unchanged (mirrors the backend byte-identical MCQ guarantee).
- **Run is scratch (not grading):** "Run tests" calls the ai-agents REST run endpoint and does **not** persist/grade/emit. Only **Submit** triggers `submitAptitude` → admin grading → the unchanged `aptitude.graded`. A sandbox outage at **grade** time surfaces as retryable (never score 0; no attempt row, no emit) — the backend fairness invariant; the FE shows the submit error toast and the candidate can retry.
- **Responsive:** the page is `max-w-3xl` when a coding section is present; the coding card is editor-above-results on narrow viewports, side-by-side (`lg:grid lg:grid-cols-2`) on wide; the sample-tests list scrolls within its panel.
- **Dark + tokens:** `@ip/ui` token classes only (`text-foreground`, `bg-surface-muted`, `border-border`, tone foregrounds) — the editor inherits the violet/dark theme via `bg-surface-muted`; any lucide icon used is imported in the candidate app.
- **A11y:** the `CodeEditor` carries an explicit `aria-label` (incl. language) and does **not** trap Tab; Run/Submit are real `<button>`s with disabled/loading states; the results panel is `role="status" aria-live="polite"` so a screen reader announces pass/fail after a run; each section card has a labelled heading (`Question N` / `Coding task` / `Short answer`); MCQ stays `RadioGroup`-native.
- **Acceptance:** matches the `aptura_coding_assessment` mockup; `--filter @ip/candidate build` + `--filter @ip/{ui,shared,api-client} typecheck` green; works against the mock today (`NEXT_PUBLIC_MOCK=1`: a coding section + scripted run results) and against the typed `AptitudeService` + the `run_code` sandbox once the backend deltas land (flip `NEXT_PUBLIC_MOCK`, `pnpm gen`).
