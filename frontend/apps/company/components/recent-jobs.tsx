"use client";

import { EmptyState, cn, jobStatus } from "@ip/ui";
import { useAuthedQuery } from "@ip/shared";
import Link from "next/link";

import { useAuth } from "../lib/auth";

// Maps the shared jobStatus tone onto the Midnight `.pill-*` palette.
const PILL: Record<string, string> = {
  success:
    "bg-success-surface text-success-foreground",
  warning:
    "bg-warning-surface text-warning-foreground",
  danger:
    "bg-danger-surface text-danger-foreground",
  info: "bg-info-surface text-info-foreground",
  neutral: "bg-surface-muted text-muted-foreground",
};

export function RecentJobs() {
  const { api, token } = useAuth();
  const jobs = useAuthedQuery(token, {
    queryKey: ["jobs", "recent"],
    queryFn: () => api.jobs.listJobs({}),
  });
  const rows = (jobs.data?.jobs ?? []).slice(0, 5);

  return (
    <div className="rounded-xl border border-border bg-surface">
      <h3 className="px-4 pt-4 font-display text-xl font-semibold tracking-tight text-foreground">
        Recent jobs
      </h3>
      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState title="No jobs yet" description="Post a role to get started." />
        </div>
      ) : (
        <ul className="mt-3">
          {rows.map((job) => {
            const status = jobStatus(job.status);
            return (
              <li key={job.jobId}>
                <Link
                  href={`/jobs/${job.jobId}`}
                  className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-surface-muted"
                >
                  <span className="truncate text-sm font-medium text-foreground">
                    {job.title}
                  </span>
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium before:size-1.5 before:rounded-full before:bg-current",
                      PILL[status.tone] ?? PILL.neutral,
                    )}
                  >
                    {status.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
