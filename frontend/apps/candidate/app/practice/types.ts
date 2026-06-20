// Typed surface for the detached candidate practice mode + skill-gap feedback.
//
// Practice REUSES the live interview brain but is fully DETACHED from the funnel: the client
// signatures carry NO comp_id / job_id / applicationId — the same invariant the backend enforces
// (`practice.py` holds no `publisher`) reaches the FE type surface. There is no way to emit a
// funnel event or surface a hire/reject verdict from here, by type.
//
// The ai-agents service is gRPC post-migration, so the eventual real client is `api.practice.*`
// (see practice-client.ts's commented `makeApiPracticeClient` adapter). Until those RPCs land +
// `pnpm gen` regenerates, the screens run against `makeMockPracticeClient()` (NEXT_PUBLIC_MOCK=1).

/** Growth feedback — strengths / gaps / topics. Intentionally NO recommendation/score field:
 *  practice is growth-oriented, never pass/fail, never shown to an employer. */
export interface GrowthFeedbackView {
  summary: string;
  strengths: string[];
  gaps: string[];
  suggested_topics: string[];
}

export interface PracticeStartResult {
  practice_id: string;
  question: string;
}

export interface PracticeTurn {
  done: boolean;
  question: string;
}

export interface PracticeFeedbackResult {
  evaluation_summary: string;
  feedback: GrowthFeedbackView;
}

export interface PracticeSummaryRow {
  practice_id: string;
  role_label: string;
  created_at: string;
}

/** Start a run from EXACTLY ONE of a topic or a pasted JD (the server boundary enforces it;
 *  the start form sends only the active field). No comp_id / job_id anywhere. */
export interface StartArgs {
  topic?: string;
  jd_text?: string;
}

export interface PracticeClient {
  start(args: StartArgs): Promise<PracticeStartResult>;
  turn(practiceId: string, answer: string): Promise<PracticeTurn>;
  feedback(practiceId: string): Promise<PracticeFeedbackResult>;
  list(): Promise<PracticeSummaryRow[]>;
}
