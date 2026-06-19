"use client";

import {
  Badge,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  buttonVariants,
  jobStatus,
} from "@ip/ui";
import { errorMessage } from "@ip/shared";
import { useQuery } from "@tanstack/react-query";
import {
  Archive,
  ArrowRight,
  CheckCircle2,
  FileText,
  type LucideIcon,
  PauseCircle,
  Plus,
} from "lucide-react";
import Link from "next/link";

import { AssistantChat } from "../../components/assistant-chat";
import { CompanyShell } from "../../components/company-shell";
import { useAuth } from "../../lib/auth";

const STATUS_ICON: Record<string, LucideIcon> = {
  draft: FileText,
  published: CheckCircle2,
  paused: PauseCircle,
  closed: Archive,
};

const STATUS_HINT: Record<string, string> = {
  draft: "Not yet visible to candidates",
  published: "Accepting applications",
  paused: "Applications paused",
  closed: "No longer accepting applications",
};

export default function JobsPage() {
  const { api } = useAuth();
  const jobs = useQuery({
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
            Create job
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
          description="Create your first job posting to start receiving applicants."
          icon={FileText}
          action={
            <Link href="/jobs/new" className={buttonVariants()}>
              <Plus className="size-4" aria-hidden />
              Create job
            </Link>
          }
        />
      )}
      {list.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {list.map((job) => {
            const status = jobStatus(job.status);
            const StatusIcon = STATUS_ICON[job.status] ?? FileText;
            return (
              <Link
                key={job.jobId}
                href={`/jobs/${job.jobId}`}
                className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Card hoverable className="h-full">
                  <CardContent className="flex h-full items-start gap-3 p-4">
                    <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                      <StatusIcon className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-medium text-foreground">
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
                      <Badge tone={status.tone} className="mt-2">
                        {status.label}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-8">
        <AssistantChat />
      </div>
    </CompanyShell>
  );
}
