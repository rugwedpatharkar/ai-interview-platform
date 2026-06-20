"use client";

import {
  EmptyState,
  ErrorState,
  Skeleton,
  StatusPill,
  jobStatus,
} from "@ip/ui";
import { errorMessage, useAuthedQuery } from "@ip/shared";
import { Briefcase } from "lucide-react";
import Link from "next/link";

import { useAuth } from "../lib/auth";

export function RecentJobs() {
  const { api, token } = useAuth();
  const jobs = useAuthedQuery(token, {
    queryKey: ["jobs", "recent"],
    queryFn: () => api.jobs.listJobs({}),
  });
  const rows = (jobs.data?.jobs ?? []).slice(0, 5);

  return (
    <div className="rounded-xl border border-border bg-surface">
      <h3 className="px-4 pt-4 text-xl font-semibold tracking-tight text-foreground">
        Recent jobs
      </h3>
      {jobs.isLoading ? (
        <ul className="mt-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0"
            >
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </li>
          ))}
        </ul>
      ) : jobs.isError ? (
        <div className="p-4">
          <ErrorState
            message={errorMessage(jobs.error)}
            retry={() => jobs.refetch()}
          />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={Briefcase}
            title="No jobs yet"
            description="Post a role to start receiving applicants."
          />
        </div>
      ) : (
        <ul className="mt-3">
          {rows.map((job, i) => (
            <li
              key={job.jobId}
              className="animate-rise-in"
              style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
            >
              <Link
                href={`/jobs/${job.jobId}`}
                className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-surface-muted"
              >
                <span className="truncate text-sm font-medium text-foreground">
                  {job.title}
                </span>
                <StatusPill token={jobStatus(job.status)} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
