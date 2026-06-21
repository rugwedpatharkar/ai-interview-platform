// Typed assessment sections + (mock | live) clients for the kind-aware candidate assessment.
//
// Wiring (2026-06-21):
//   - MCQ path stays on the already-wired admin.aptitude.v1.AptitudeService (the page adapts
//     live `AptitudeQuestion[]` -> `mcq` sections via `questionsToSections`).
//   - Coding paths (run + submit) flip to admin.coding.v1.CodingService on the admin transport.
//     `runCode` is EPHEMERAL (no grade, just execute against visible cases); `submitCoding`
//     grades hidden cases + typed-answer keys. The answer key never crosses the wire — input
//     is sanitized at the page seam (string trim) and the BE is the authority.
//
// Privacy/anti-cheat invariant: `RunResult` has NO field carrying hidden stdin/expected/diff —
// only a `hiddenPassed`/`hiddenTotal` aggregate. The candidate can never receive hidden bodies.
// (The live gRPC `RunResult` carries stdout/stderr/exit_code/time_ms/timed_out — we collapse
// that into the candidate-shape visible-pass result the editor renders.)

import { useMemo } from "react";
import type { AdminClients, AptitudeQuestion } from "@ip/api-client";

import { useAuth } from "./auth";

export type SectionKind = "mcq" | "coding" | "free_text";

export interface VisibleCase {
  stdin: string;
  expected: string;
}

export interface AssessmentSection {
  id: string;
  kind: SectionKind;
  prompt: string;
  topic?: string;
  // mcq
  options?: string[];
  // coding
  language?: string;
  starterCode?: string;
  visibleCases?: VisibleCase[];
  hiddenCaseCount?: number;
  timeLimitS?: number;
}

export interface AssessmentTest {
  sections: AssessmentSection[];
}

// Run result — VISIBLE cases only + a hidden aggregate. There is intentionally NO field
// carrying hidden stdin/expected/diff to the candidate.
export interface RunCaseResult {
  visible: boolean;
  passed: boolean;
  name?: string;
}

export interface RunResult {
  compileOk: boolean;
  cases: RunCaseResult[];
  hiddenPassed: number;
  hiddenTotal: number;
}

// Kind-tagged positional answer (mapped back to the served descriptor on submit).
export type SectionAnswer =
  | { kind: "mcq"; option: number }
  | { kind: "coding"; source: string; language: string }
  | { kind: "free_text"; text: string };

export interface RunArgs {
  sectionId: string;
  language: string;
  source: string;
  stdin?: string;
}

export interface CodingSubmitArgs {
  language: string;
  source: string;
  /** Free-text answers keyed by section id (typed_questions on the wire). */
  typedAnswers: { id: string; answer: string }[];
}

export interface CodingSubmitResult {
  passed: boolean;
  score: number; // 0..100 — derived from (casesPassed + typedCorrect) / (casesTotal + typedTotal)
}

// Adapt the live MCQ-only test (gRPC `AptitudeQuestion[]`) into typed `mcq` sections so the
// page renders the SAME RadioGroup flow whether the test is live (MCQ) or mocked (typed). The
// section id is the question index as a string; the answer maps back to the positional
// `answers: number[]` the live SubmitAptitude expects (see the page's `submit`).
export function questionsToSections(questions: AptitudeQuestion[]): AssessmentSection[] {
  return questions.map((q) => ({
    id: String(q.index),
    kind: "mcq" as const,
    prompt: q.question,
    topic: q.topic || undefined,
    options: q.options,
  }));
}

/** Cheap derivation from the gRPC RunResult into the candidate-visible pass result. The wire
 *  carries stdout/stderr/exit_code/time_ms/timed_out; we surface a single "Case 1" pass when
 *  exit_code === 0 and no timeout — full per-case grading lives in submitCoding. */
function gRpcRunToVisible(stdout: string, exitCode: number, timedOut: boolean): RunResult {
  const passed = !timedOut && exitCode === 0;
  return {
    compileOk: !timedOut, // surface a compile error as a non-pass; the editor message uses it
    cases: [{ visible: true, passed, name: timedOut ? "Timed out" : stdout ? "Ran" : "No output" }],
    hiddenPassed: 0,
    hiddenTotal: 0,
  };
}

// ---- mock (NEXT_PUBLIC_MOCK=1) ----------------------------------------------------

// Mock client: one MCQ + one coding section (hidden tests masked to a count), and a scripted
// `run()` returning some visible pass/fail + a hidden aggregate. Lets the page + editor +
// results panel build and preview before the sandbox is hot.
export function makeMockAssessmentClient() {
  const test: AssessmentTest = {
    sections: [
      {
        id: "s1",
        kind: "mcq",
        prompt: "What is the time complexity of binary search on a sorted array?",
        options: ["O(n)", "O(log n)", "O(1)", "O(n^2)"],
        topic: "algorithms",
      },
      {
        id: "s2",
        kind: "coding",
        prompt:
          "Read space-separated integers from stdin and print their sum.\n\nExample: input `1 2 3` prints `6`.",
        language: "python",
        starterCode:
          "import sys\n\ndef solve(nums):\n    # your code here\n    ...\n\nprint(solve([int(x) for x in sys.stdin.read().split()]))\n",
        visibleCases: [
          { stdin: "1 2 3", expected: "6" },
          { stdin: "10 -5", expected: "5" },
        ],
        hiddenCaseCount: 3,
        timeLimitS: 600,
      },
    ],
  };
  return {
    getTest: async (_appId: string): Promise<AssessmentTest> => test,
    run: async (_appId: string, args: RunArgs): Promise<RunResult> => {
      const ok = args.source.includes("sum") || args.source.includes("+");
      return {
        compileOk: true,
        cases: [
          { visible: true, passed: ok, name: "Case 1" },
          { visible: true, passed: ok, name: "Case 2" },
        ],
        hiddenPassed: ok ? 3 : 1,
        hiddenTotal: 3,
      };
    },
    submit: async (
      _appId: string,
      _answers: SectionAnswer[],
    ): Promise<{ score: number; passed: boolean }> => ({ score: 80, passed: true }),
  };
}

export type MockAssessmentClient = ReturnType<typeof makeMockAssessmentClient>;

// ---- live coding client (admin.coding.v1.CodingService) ---------------------------

export interface CodingClient {
  runCode(applicationId: string, args: RunArgs): Promise<RunResult>;
  submitCoding(applicationId: string, args: CodingSubmitArgs): Promise<CodingSubmitResult>;
}

export const USE_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";

export function makeApiCodingClient(api: AdminClients): CodingClient {
  return {
    async runCode(applicationId, args) {
      // RunCode is ephemeral — no grade. The wire carries stdout/stderr/exit_code/time_ms;
      // we collapse that into the editor's visible-pass shape.
      const r = await api.coding.runCode({
        applicationId,
        language: args.language,
        source: args.source,
        stdin: args.stdin ?? "",
      });
      return gRpcRunToVisible(r.stdout, r.exitCode, r.timedOut);
    },
    async submitCoding(applicationId, args) {
      // typed-answer keys are server-side only; we just send the user's text. Sanitize the
      // user input client-side (trim) so a stray newline never miscounts a typed answer.
      const typedAnswers = args.typedAnswers.map((t) => ({
        id: t.id,
        answer: t.answer.trim(),
      }));
      const r = await api.coding.submitCoding({
        applicationId,
        language: args.language,
        source: args.source,
        typedAnswers,
      });
      const total = r.casesTotal + r.typedTotal;
      const correct = r.casesPassed + r.typedCorrect;
      const score = total > 0 ? Math.round((correct / total) * 100) : 0;
      return { passed: r.passed, score };
    },
  };
}

/** Hook: returns the live coding client. The mock path lives in `makeMockAssessmentClient`
 *  on the page (kept for offline dev under NEXT_PUBLIC_MOCK=1). */
export function useCodingClient(): CodingClient {
  const { api } = useAuth();
  return useMemo(() => makeApiCodingClient(api), [api]);
}
