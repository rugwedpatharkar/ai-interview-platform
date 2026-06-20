"use client";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  buttonVariants,
  cn,
  jobStatus,
} from "@ip/ui";
import { errorMessage, useAuthedQuery } from "@ip/shared";
import { ArrowRight, FileText, Plus } from "lucide-react";
import Link from "next/link";

import { AssistantChat } from "../../components/assistant-chat";
import { CompanyShell } from "../../components/company-shell";
import { useAuth } from "../../lib/auth";

const STATUS_HINT: Record<string, string> = {
  draft: "Not yet visible to candidates",
  published: "Accepting applications",
  paused: "Applications paused",
  closed: "No longer accepting applications",
};

// Maps the shared jobStatus tone onto the Midnight `.pill-*` palette (dot + tinted surface).
const PILL: Record<string, string> = {
  success: "bg-success-surface text-success-foreground",
  warning: "bg-warning-surface text-warning-foreground",
  danger: "bg-danger-surface text-danger-foreground",
  info: "bg-info-surface text-info-foreground",
  neutral: "bg-surface-muted text-muted-foreground",
};

function StatusPill({ status }: { status: string }) {
  const tone = jobStatus(status);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium before:size-1.5 before:rounded-full before:bg-current",
        PILL[tone.tone] ?? PILL.neutral,
      )}
    >
      {tone.label}
    </span>
  );
}

function postedLabel(postedAt: string): string {
  if (!postedAt) return "—";
  const d = new Date(postedAt);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function JobsPage() {
  const { api, token } = useAuth();
  const jobs = useAuthedQuery(token, {
    queryKey: ["jobs"],
    queryFn: () => api.jobs.listJobs({}),
  });
  const list = jobs.data?.jobs ?? [];

  return (
    <CompanyShell>
      <PageHeader
        title="Jobs"
        description="Postings you've created for your company."
        action={
          <Link href="/jobs/new" className={buttonVariants()}>
            <Plus className="size-4" aria-hidden />
            Post a job
          </Link>
        }
      />
      {jobs.isLoading && <LoadingState />}
      {jobs.isError && (
        <ErrorState message={errorMessage(jobs.error)} retry={() => jobs.refetch()} />
      )}
      {!jobs.isLoading && !jobs.isError && list.length === 0 && (
        <EmptyState
          title="No jobs yet"
          description="Post a role to start receiving applicants."
          icon={FileText}
          action={
            <Link href="/jobs/new" className={buttonVariants()}>
              <Plus className="size-4" aria-hidden />
              Post a job
            </Link>
          }
        />
      )}
      {list.length > 0 && (
        <>
          {/* Desktop: a token-styled data table. */}
          <div className="hidden overflow-hidden rounded-xl border border-border bg-surface sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Posted</th>
                  <th className="px-4 py-3 text-right" />
                </tr>
              </thead>
              <tbody>
                {list.map((job) => (
                  <tr
                    key={job.jobId}
                    className="border-b border-border transition-colors last:border-b-0 hover:bg-surface-muted"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/jobs/${job.jobId}`}
                        className="text-base font-medium text-foreground hover:underline"
                      >
                        {job.title}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {STATUS_HINT[job.status] ?? "Job posting"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={job.status} />
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {postedLabel(job.postedAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/jobs/${job.jobId}`}
                        className={cn(
                          buttonVariants({ variant: "ghost", size: "sm" }),
                          "gap-1",
                        )}
                      >
                        View
                        <ArrowRight className="size-3.5" aria-hidden />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: stacked cards keep the title + status readable at ~375px. */}
          <div className="flex flex-col gap-3 sm:hidden">
            {list.map((job) => (
              <Link
                key={job.jobId}
                href={`/jobs/${job.jobId}`}
                className="group rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate text-base font-medium text-foreground">
                    {job.title}
                  </p>
                  <ArrowRight
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </div>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {STATUS_HINT[job.status] ?? "Job posting"}
                </p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <StatusPill status={job.status} />
                  <span className="tabular-nums text-xs text-muted-foreground">
                    {postedLabel(job.postedAt)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="mt-8">
        <AssistantChat />
      </div>
    </CompanyShell>
  );
}
