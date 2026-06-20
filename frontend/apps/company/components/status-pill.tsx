import { Badge, type StatusToken, applicationStatus } from "@ip/ui";

// App-local overrides for funnel states the shared `applicationStatus` map doesn't yet
// carry (e.g. the advisory-gate `assessment_review` hold). Kept here — not in `@ip/ui` —
// so the pipeline + report screens render the right label/tone before the shared status
// map is widened. Once `@ip/ui` learns these states, this map collapses to `{}`.
const OVERRIDES: Record<string, StatusToken> = {
  assessment_review: { label: "Under review", tone: "warning" },
};

export interface StatusPillProps {
  /** A funnel application state, e.g. "scored" | "assessment_review". */
  state: string;
  /** Show a leading dot (used in the pipeline funnel-stage view). */
  dot?: boolean;
  className?: string;
}

/** Funnel-state pill — label + tone come from the shared `applicationStatus` map. */
export function StatusPill({ state, dot, className }: StatusPillProps) {
  const { label, tone } = OVERRIDES[state] ?? applicationStatus(state);
  return (
    <Badge tone={tone} className={className}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {label}
    </Badge>
  );
}
