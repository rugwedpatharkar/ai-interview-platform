"use client";

import { ConfirmDialog, applicationStatus } from "@ip/ui";
import { TERMINAL_STATES, useCountUp } from "@ip/shared";
import Link from "next/link";

/** Single stat cell inside the `.ap-stats` strip. Integer values animate from 0 on
 *  mount (count-up) so the dashboard feels alive on first paint. */
export function StatCell({ value, label }: { value: number; label: string }) {
  const n = useCountUp(value);
  return (
    <div className="ap-stat">
      <div className="ap-stat-n">
        <span className="tabular-nums">{Math.round(n)}</span>
      </div>
      <div className="ap-stat-l">{label}</div>
    </div>
  );
}

/** One application row in the dashboard's anchor cell. Uses `.ap-pill` for the state
 *  badge + carries the existing CTAs (take test / start interview / withdraw confirm). */
export function DashboardApplicationRow({
  app,
  delay,
  onWithdraw,
  withdrawing,
}: {
  app: {
    applicationId: string;
    jobId: string;
    state: string;
    jobTitle?: string;
    companyName?: string;
  };
  delay: number;
  onWithdraw: (id: string) => void;
  withdrawing: boolean;
}) {
  const status = applicationStatus(app.state);
  const title = app.jobTitle ?? `Job ${app.jobId}`;
  const company = app.companyName ?? "Company";
  const initial = (app.companyName ?? title).charAt(0).toUpperCase();
  const pillClass =
    status.tone === "success"
      ? "ap-pill ap-pill--good"
      : status.tone === "warning"
        ? "ap-pill ap-pill--warn"
        : status.tone === "danger"
          ? "ap-pill ap-pill--danger"
          : status.tone === "info"
            ? "ap-pill ap-pill--teal"
            : "ap-pill";

  return (
    <div
      className="animate-rise-in flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-elev-1 transition-colors hover:border-line-2 sm:flex-row sm:items-center sm:justify-between"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full border border-line bg-surface-2 font-display text-base font-semibold text-foreground">
          {initial}
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{title}</p>
          <p className="truncate text-sm text-ink-2">{company}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={pillClass}>{status.label}</span>
        {app.state === "aptitude_pending" && (
          <Link
            href={`/aptitude/${app.applicationId}`}
            className="ap-btn ap-btn-ghost ap-btn-sm"
          >
            Take test
          </Link>
        )}
        {app.state === "interview_pending" && (
          <Link
            href={`/interview/${app.applicationId}`}
            className="ap-btn ap-btn-primary ap-btn-sm"
          >
            Start interview
          </Link>
        )}
        {!TERMINAL_STATES.has(app.state) && (
          <ConfirmDialog
            trigger={
              <button type="button" className="ap-btn ap-btn-ghost ap-btn-sm">
                Withdraw
              </button>
            }
            title="Withdraw application?"
            description="This can't be undone — you'd need to re-apply."
            confirmLabel="Withdraw"
            destructive
            busy={withdrawing}
            onConfirm={() => onWithdraw(app.applicationId)}
          />
        )}
      </div>
    </div>
  );
}
