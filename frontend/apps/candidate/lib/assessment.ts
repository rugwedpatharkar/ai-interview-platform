// Typed assessment sections + a mock client for the kind-aware candidate assessment page.
//
// These live in the candidate app (this round owns the candidate app only). The live
// AptitudeService still serves MCQ-only `questions[]` and the scratch `run` endpoint does not
// exist in the generated client yet; until the backend deltas land + `pnpm gen` regenerates,
// the typed-sections + coding-run paths are driven by `makeMockAssessmentClient()` (toggle on
// NEXT_PUBLIC_MOCK=1). The MCQ path stays byte-identical against the real client — the page
// adapts the real `AptitudeQuestion[]` into `mcq` sections (see `questionsToSections`).
//
// Privacy/anti-cheat invariant: `RunResult` has NO field carrying hidden stdin/expected/diff —
// only a `hiddenPassed`/`hiddenTotal` aggregate. The candidate can never receive hidden bodies.

import type { AptitudeQuestion } from "@ip/api-client";

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

// Mock client: one MCQ + one coding section (hidden tests masked to a count), and a scripted
// `run()` returning some visible pass/fail + a hidden aggregate. Lets the page + editor +
// results panel build and preview before the proto regenerates or the sandbox lands.
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
