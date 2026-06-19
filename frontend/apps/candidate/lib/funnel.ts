import { TERMINAL_STATES } from "@ip/shared";

export const FUNNEL_STEPS = ["Applied", "Aptitude", "Interview", "Decision"] as const;

// Which funnel step a state sits at. Branch states (gated_out/rejected) snap to the
// step where they ended; the flags let the card render them as "stopped", not "in progress".
const STEP_INDEX: Record<string, number> = {
  applied: 0,
  aptitude_pending: 1,
  gated_out: 1, // ended at aptitude
  interview_pending: 2,
  interview_in_progress: 2,
  interviewed: 3,
  scored: 3,
  shortlisted: 3,
  hired: 3,
  rejected: 3,
  withdrawn: 0,
  expired: 0,
  abandoned: 0,
};

const NEGATIVE = new Set(["gated_out", "rejected", "expired", "abandoned"]);

export interface Stage {
  index: number;
  ended: boolean;
  negative: boolean;
}

export function funnelStage(state: string): Stage {
  return {
    index: STEP_INDEX[state] ?? 0,
    // gated_out is a stop but not in TERMINAL_STATES, so add it explicitly — keeps
    // the card's "ended" logic consistent with the page poll without duplicating the set.
    ended: TERMINAL_STATES.has(state) || state === "gated_out",
    negative: NEGATIVE.has(state),
  };
}
