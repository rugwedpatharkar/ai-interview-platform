"use client";

import { EmptyState, Skeleton, buttonVariants, cn } from "@ip/ui";
import { errorMessage, useRequireAuth } from "@ip/shared";
import { useQuery } from "@tanstack/react-query";
import { Bookmark } from "lucide-react";
import Link from "next/link";

import { CandidateShell } from "../../components/candidate-shell";
import { JobCard } from "../../components/job-card";
import { SaveJobButton } from "../../components/save-job-button";
import { useAuth } from "../../lib/auth";
import { savedJobsClient } from "../../lib/saved-jobs-client";

export default function SavedJobsPage() {
  const { token, ready } = useAuth();
  useRequireAuth(token, ready);
  const q = useQuery({
    queryKey: ["saved-jobs"],
    queryFn: () => savedJobsClient.list(),
    enabled: Boolean(token),
  });
  if (!token) return null; // hydration guard

  const jobs = q.data ?? [];
  return (
    <CandidateShell>
      <h1 className="font-display text-xl font-medium text-foreground">Saved jobs</h1>
      <div className="mt-4 flex flex-col gap-3">
        {q.isLoading && (
          <>
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </>
        )}
        {q.isError && (
          <EmptyState
            title="Couldn't load saved jobs"
            description={errorMessage(q.error)}
          />
        )}
        {!q.isLoading && !q.isError && jobs.length === 0 && (
          <EmptyState
            title="No saved jobs yet"
            description="Bookmark roles as you browse and they'll show up here."
            icon={Bookmark}
            action={
              <Link
                href="/jobs"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Browse jobs
              </Link>
            }
          />
        )}
        {jobs.map((j) => (
          <JobCard key={j.jobId} job={j} action={<SaveJobButton jobId={j.jobId} />} />
        ))}
      </div>
    </CandidateShell>
  );
}
