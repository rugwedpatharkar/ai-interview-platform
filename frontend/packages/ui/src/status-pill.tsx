import { cn } from "./cn.js";
import {
  type StatusToken,
  applicationPillStatus,
  statusToneClasses,
} from "./status.js";

export interface StatusPillProps {
  /** A funnel application state, e.g. "scored" | "assessment_review". Resolved to a
   *  label + tone via the shared application map (with local overrides applied). */
  state?: string;
  /** A pre-resolved token — used for non-application pills (e.g. job status). */
  token?: StatusToken;
  /** Show the leading dot. On by default (the pill-style signature). */
  dot?: boolean;
  className?: string;
}

/** The single canonical status pill for both apps: `.pill`-style tinted surface + a
 *  leading dot, with the application-state OVERRIDES applied so a given state renders
 *  the same label everywhere. Pass `state` for funnel pills, or `token` for a
 *  pre-resolved tone/label (e.g. `jobStatus(...)`). */
export function StatusPill({ state, token, dot = true, className }: StatusPillProps) {
  const { label, tone } = token ?? applicationPillStatus(state ?? "");
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        statusToneClasses(tone),
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {label}
    </span>
  );
}
