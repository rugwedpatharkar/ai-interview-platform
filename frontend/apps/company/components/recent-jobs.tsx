"use client";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  jobStatus,
} from "@ip/ui";
import { useAuthedQuery } from "@ip/shared";
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
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent jobs</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No jobs yet" description="Post a role to get started." />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((job) => {
              const status = jobStatus(job.status);
              return (
                <li key={job.jobId}>
                  <Link
                    href={`/jobs/${job.jobId}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted"
                  >
                    <span className="truncate text-sm font-medium text-foreground">
                      {job.title}
                    </span>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
