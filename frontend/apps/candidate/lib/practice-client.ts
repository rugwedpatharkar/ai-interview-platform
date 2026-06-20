// Detached practice client (ai-agents) + an in-memory mock for building the screens before the
// gRPC RPCs land. Lives in the candidate app (this round owns the candidate app only).
//
// DETACHED INVARIANT: no method takes comp_id / job_id / applicationId — practice never reaches
// the funnel and is never shown to employers, mirroring the backend's `publisher`-free
// `practice.py`. The growth feedback shape carries no recommendation/score, so no hire/reject
// verdict can surface.
//
// gRPC swap: ai-agents is gRPC post-migration. When `api.practice.*` is generated, drop in
// `makeApiPracticeClient(api)` (stub below) and flip the one binding at the bottom — every
// screen/component stays byte-identical because they depend on the `PracticeClient` interface.

import type {
  PracticeClient,
  PracticeFeedbackResult,
  PracticeStartResult,
  PracticeSummaryRow,
  PracticeTurn,
  StartArgs,
} from "../app/practice/types.js";

export const USE_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";

/** Raised when feedback is requested for a run the server hasn't finished scoring yet — the UI
 *  treats it as "still finalizing" and polls (parity with the backend's 409 / gRPC
 *  FailedPrecondition on an in-progress run). */
export class StillFinalizingError extends Error {
  constructor() {
    super("Your practice interview is still being scored.");
    this.name = "StillFinalizingError";
  }
}

export function isStillFinalizing(err: unknown): boolean {
  return err instanceof StillFinalizingError;
}

interface MockRun {
  practiceId: string;
  roleLabel: string;
  createdAt: string;
  turnsLeft: number;
  finalizeAt: number | null; // epoch ms after which feedback is ready (simulates async scoring)
  feedback: PracticeFeedbackResult;
}

const QUESTIONS = [
  "Tell me about a system you designed end-to-end. What were the hardest trade-offs?",
  "Walk me through how you'd debug a service that's intermittently timing out under load.",
  "Describe a time you disagreed with a technical decision. How did you handle it?",
  "How would you design a rate limiter for a multi-tenant API?",
] as const;

/** Clamp into the scripted question bank — always returns a string for the turn loop.
 *  (The `?? FIRST` keeps the return non-optional under noUncheckedIndexedAccess; the clamp
 *  already guarantees an in-bounds hit.) */
const FIRST_QUESTION = QUESTIONS[0];
function questionAt(i: number): string {
  return QUESTIONS[Math.min(Math.max(i, 0), QUESTIONS.length - 1)] ?? FIRST_QUESTION;
}

function roleLabelFor(args: StartArgs): string {
  if (args.topic?.trim()) return args.topic.trim();
  const jd = args.jd_text?.trim() ?? "";
  const firstLine = jd.split("\n").find((l) => l.trim().length > 0)?.trim() ?? "";
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}…` : firstLine || "Practice interview";
}

function feedbackFor(roleLabel: string): PracticeFeedbackResult {
  return {
    evaluation_summary:
      "You communicated clearly and reasoned through trade-offs out loud. A few answers would land harder with a concrete example and an explicit success metric.",
    feedback: {
      summary: `Solid practice run for ${roleLabel}. Your strongest answers paired a clear approach with the "why"; the next level up is quantifying impact and naming the alternatives you ruled out.`,
      strengths: [
        "Structured answers — you led with the approach before the detail.",
        "Comfortable reasoning about trade-offs under follow-up questions.",
        "Clear, jargon-light communication an interviewer can follow.",
      ],
      gaps: [
        "Anchor system-design answers with a concrete example from your own work.",
        "State an explicit success metric (latency, error budget, adoption) when you propose a solution.",
        "Name the alternatives you considered and why you rejected them.",
      ],
      suggested_topics: [
        "System design: rate limiting",
        "Observability & SLOs",
        "Trade-off framing (STAR)",
        "Capacity estimation",
      ],
    },
  };
}

const MOCK_HISTORY_SEED: MockRun[] = [
  {
    practiceId: "practice-seed-1",
    roleLabel: "Senior Backend Engineer — Python",
    createdAt: "2026-06-18T09:30:00Z",
    turnsLeft: 0,
    finalizeAt: 0,
    feedback: feedbackFor("Senior Backend Engineer — Python"),
  },
];

// One module-level store so a started run is still readable by /feedback/[id] in the same session.
let seq = 1;
const runs = new Map<string, MockRun>(MOCK_HISTORY_SEED.map((r) => [r.practiceId, r]));

/** In-memory practice client: a short scripted turn loop + a simulated async finalize so the
 *  runner's "finalizing" poll and the feedback panel both exercise real states. */
export function makeMockPracticeClient(): PracticeClient {
  const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

  return {
    start: async (args: StartArgs): Promise<PracticeStartResult> => {
      await delay(400);
      const practiceId = `practice-${Date.now()}-${seq++}`;
      runs.set(practiceId, {
        practiceId,
        roleLabel: roleLabelFor(args),
        createdAt: new Date().toISOString(),
        turnsLeft: 3,
        finalizeAt: null,
        feedback: feedbackFor(roleLabelFor(args)),
      });
      return { practice_id: practiceId, question: questionAt(0) };
    },

    turn: async (practiceId: string, _answer: string): Promise<PracticeTurn> => {
      await delay(500);
      const run = runs.get(practiceId);
      if (!run) throw new Error("Practice session not found.");
      run.turnsLeft -= 1;
      if (run.turnsLeft <= 0) {
        // Finalize asynchronously: feedback isn't ready for a beat, so the UI shows "scoring…".
        run.finalizeAt = Date.now() + 1800;
        return { done: true, question: "" };
      }
      return { done: false, question: questionAt(QUESTIONS.length - 1 - run.turnsLeft) };
    },

    feedback: async (practiceId: string): Promise<PracticeFeedbackResult> => {
      await delay(300);
      const run = runs.get(practiceId);
      if (!run) throw new Error("Practice session not found.");
      if (run.finalizeAt === null || Date.now() < run.finalizeAt) throw new StillFinalizingError();
      return run.feedback;
    },

    list: async (): Promise<PracticeSummaryRow[]> => {
      await delay(300);
      return [...runs.values()]
        .filter((r) => r.finalizeAt !== null && Date.now() >= r.finalizeAt)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((r) => ({
          practice_id: r.practiceId,
          role_label: r.roleLabel,
          created_at: r.createdAt,
        }));
    },
  };
}

// Real adapter — wired after `pnpm gen` exposes the gRPC `api.practice` client. The detached
// invariant holds: still no comp_id / applicationId in any call. A FailedPrecondition on an
// in-progress run maps to StillFinalizingError so the poll logic is unchanged.
//
// import type { ApiClients } from "@ip/api-client";
// import { Code, ConnectError } from "@ip/shared";
// export function makeApiPracticeClient(api: ApiClients): PracticeClient {
//   const finalizing = (err: unknown) =>
//     err instanceof ConnectError && err.code === Code.FailedPrecondition;
//   return {
//     start: (args) => api.practice.start(args),
//     turn: (practiceId, answer) => api.practice.turn({ practiceId, answer }),
//     feedback: async (practiceId) => {
//       try {
//         return await api.practice.feedback({ practiceId });
//       } catch (err) {
//         if (finalizing(err)) throw new StillFinalizingError();
//         throw err;
//       }
//     },
//     list: async () => (await api.practice.listSessions({})).sessions,
//   };
// }

// Swap to makeApiPracticeClient(api) once `pnpm gen` exposes api.practice. The mock has no auth
// surface of its own — the real client reuses the candidate token store via the gRPC transport.
export const practiceClient: PracticeClient = makeMockPracticeClient();
