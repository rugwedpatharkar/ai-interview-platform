import type { BadgeTone } from "./badge.js";

export interface StatusToken {
  label: string;
  tone: BadgeTone;
}

// Funnel application states → human label + badge tone. Single source for both apps.
const APPLICATION: Record<string, StatusToken> = {
  applied: { label: "Applied", tone: "neutral" },
  aptitude_pending: { label: "Aptitude test ready", tone: "info" },
  gated_out: { label: "Did not pass the gate", tone: "danger" },
  interview_pending: { label: "Interview ready", tone: "info" },
  interview_in_progress: { label: "Interview in progress", tone: "info" },
  interviewed: { label: "Interview complete", tone: "neutral" },
  scored: { label: "Under review", tone: "warning" },
  shortlisted: { label: "Shortlisted", tone: "success" },
  hired: { label: "Hired", tone: "success" },
  rejected: { label: "Not selected", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
  expired: { label: "Expired", tone: "neutral" },
  abandoned: { label: "Abandoned", tone: "neutral" },
};

export function applicationStatus(state: string): StatusToken {
  return APPLICATION[state] ?? { label: state, tone: "neutral" };
}

const JOB: Record<string, StatusToken> = {
  draft: { label: "Draft", tone: "neutral" },
  published: { label: "Published", tone: "success" },
  paused: { label: "Paused", tone: "warning" },
  closed: { label: "Closed", tone: "neutral" },
};

export function jobStatus(state: string): StatusToken {
  return JOB[state] ?? { label: state, tone: "neutral" };
}

// Midnight `.pill`-style token classes per badge tone (tinted surface + matching
// foreground). The leading dot is `before:bg-current`, so a pill that wraps these
// classes inherits its dot color from the text color. Single source for the dotted
// status pills used across the company funnel screens.
const PILL_TONE: Record<BadgeTone, string> = {
  neutral: "bg-surface-muted text-muted-foreground",
  info: "bg-info-surface text-info-foreground",
  success: "bg-success-surface text-success-foreground",
  warning: "bg-warning-surface text-warning-foreground",
  danger: "bg-danger-surface text-danger-foreground",
};

export function statusToneClasses(tone: BadgeTone): string {
  return PILL_TONE[tone];
}
