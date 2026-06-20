"use client";

import { Button, EmptyState, ErrorState, Skeleton, buttonVariants, cn } from "@ip/ui";
import { errorMessage, useRequireAuth } from "@ip/shared";
import { useQuery } from "@tanstack/react-query";
import { Bookmark } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { CandidateShell } from "../../components/candidate-shell";
import { JobCard } from "../../components/job-card";
import { SaveJobButton } from "../../components/save-job-button";
import { useAuth } from "../../lib/auth";
import { savedJobsClient } from "../../lib/saved-jobs-client";

// Render-bound: show the first batch, reveal more on demand so a large saved list
// never mounts thousands of cards at once.
const PAGE = 30;

export default function SavedJobsPage() {
  const { token, ready } = useAuth();
  useRequireAuth(token, ready);
  const q = useQuery({
    queryKey: ["saved-jobs"],
    queryFn: () => savedJobsClient.list(),
    enabled: Boolean(token),
  });
  const [shown, setShown] = useState(PAGE);
  if (!token) return null; // hydration guard

  const jobs = q.data ?? [];
  return (
    <CandidateShell>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-foreground">Saved jobs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {jobs.length > 0 ? (
            <>
              <span className="tabular-nums">{jobs.length}</span>{" "}
              {jobs.length === 1 ? "role" : "roles"} bookmarked.
            </>
          ) : (
            "Roles you bookmark as you browse show up here."
          )}
        </p>
      </header>
      <div className="flex flex-col gap-3">
        {q.isLoading && (
          <>
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </>
        )}
        {q.isError && (
          <ErrorState message={errorMessage(q.error)} retry={() => q.refetch()} />
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
        {jobs.slice(0, shown).map((j) => (
          <JobCard key={j.jobId} job={j} action={<SaveJobButton jobId={j.jobId} />} />
        ))}
        {jobs.length > shown && (
          <Button
            variant="outline"
            className="self-center"
            onClick={() => setShown((n) => n + PAGE)}
          >
            Show more ({jobs.length - shown})
          </Button>
        )}
      </div>
    </CandidateShell>
  );
}
