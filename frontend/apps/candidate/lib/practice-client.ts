// Practice client (ai-agents transport, gRPC). The candidate practice mock-interview is
// detached from the funnel by INVARIANT: no method takes comp_id / job_id / applicationId, and
// the growth feedback shape carries no recommendation / score, so no hire-or-reject verdict can
// surface (mirrors the backend's `publisher`-free `practice.py`).
//
// Wired 2026-06-21 — the FastAPI /practice/* REST surface is gone; everything now flows through
// `api.practice.*` on the ai-agents transport. `FAILED_PRECONDITION` from `getPracticeFeedback`
// maps to `StillFinalizingError` so the poll-while-scoring logic is unchanged.

import { useMemo } from "react";
import { Code, ConnectError } from "@ip/shared";
import type {
  PracticeClient,
  PracticeFeedbackResult,
  PracticeStartResult,
  PracticeSummaryRow,
  PracticeTurn,
  StartArgs,
} from "../app/practice/types.js";
import { useAuth } from "./auth";

/** Raised when feedback is requested for a run the server hasn't finished scoring yet — the UI
 *  treats it as "still finalizing" and polls (gRPC FailedPrecondition on an in-progress run). */
export class StillFinalizingError extends Error {
  constructor() {
    super("Your practice interview is still being scored.");
    this.name = "StillFinalizingError";
  }
}

export function isStillFinalizing(err: unknown): boolean {
  return err instanceof StillFinalizingError;
}

function isFailedPrecondition(err: unknown): boolean {
  return err instanceof ConnectError && err.code === Code.FailedPrecondition;
}

import type { ApiClients } from "@ip/api-client";
type Api = ApiClients;

/** Build a real PracticeClient backed by the ai-agents gRPC transport. Snake_case ↔ camelCase
 *  mapping happens here so the shared FE types stay stable. */
export function makeApiPracticeClient(api: Api): PracticeClient {
  return {
    start: async (args: StartArgs): Promise<PracticeStartResult> => {
      const res = await api.practice.startPractice({
        topic: args.topic ?? "",
        jdText: args.jd_text ?? "",
      });
      return { practice_id: res.practiceId, question: res.question };
    },

    turn: async (practiceId: string, answer: string): Promise<PracticeTurn> => {
      const res = await api.practice.submitPracticeTurn({ practiceId, answer });
      return { done: res.done, question: res.question };
    },

    feedback: async (practiceId: string): Promise<PracticeFeedbackResult> => {
      try {
        const res = await api.practice.getPracticeFeedback({ practiceId });
        const fb = res.feedback;
        return {
          evaluation_summary: res.evaluationSummary,
          feedback: {
            summary: fb?.summary ?? "",
            strengths: fb?.strengths ?? [],
            gaps: fb?.gaps ?? [],
            suggested_topics: fb?.suggestedTopics ?? [],
          },
        };
      } catch (err) {
        if (isFailedPrecondition(err)) throw new StillFinalizingError();
        throw err;
      }
    },

    list: async (): Promise<PracticeSummaryRow[]> => {
      const res = await api.practice.listPracticeSessions({});
      return res.sessions.map((s) => ({
        practice_id: s.practiceId,
        role_label: s.roleLabel,
        created_at: s.createdAt,
      }));
    },
  };
}

/** Hook: per-render memoized live client. Components call this and treat the returned object
 *  exactly the way the old `practiceClient` singleton was used. */
export function usePracticeClient(): PracticeClient {
  const { api } = useAuth();
  return useMemo(() => makeApiPracticeClient(api), [api]);
}
