"use client";

import { ApIcon, EmptyState, ErrorState, Skeleton, cn } from "@ip/ui";
import { errorMessage, useRequireAuth } from "@ip/shared";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Bookmark, MapPin } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { CandidateShell } from "../../components/candidate-shell";
import { SaveJobButton } from "../../components/save-job-button";
import { useAuth } from "../../lib/auth";
import { useSavedJobsClient } from "../../lib/saved-jobs-client";
import type { SavedJobDTO } from "./types";

// Render-bound: show the first batch, reveal more on demand so a large saved list
// never mounts thousands of cards at once.
const PAGE = 30;

const REMOTE_LABEL: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};
const TYPE_LABEL: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
};

/** Compact salary range, e.g. "$120k–160k". `0` is treated as "unset" — the BE
 * serializes missing salary fields as 0 (proto default), so "0k–0k" would leak. */
function formatSalary(
  min: number | null | undefined,
  max: number | null | undefined,
  currency: string,
): string | null {
  const hasMin = min != null && min > 0;
  const hasMax = max != null && max > 0;
  if (!hasMin && !hasMax) return null;
  const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : `${currency} `;
  const k = (n: number) => `${Math.round(n / 1000)}k`;
  if (hasMin && hasMax) return `${sym}${k(min!)}–${k(max!)}`;
  return `${sym}${k((hasMin ? min : max)!)}`;
}

function postedLabel(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const days = Math.max(0, Math.round((Date.now() - then) / 86_400_000));
  if (days === 0) return "today";
  return `${days}d ago`;
}

function savedLabel(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "recently";
  const days = Math.max(0, Math.round((Date.now() - then) / 86_400_000));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

export default function SavedJobsPage() {
  const { token, ready } = useAuth();
  useRequireAuth(token, ready);
  const savedJobsClient = useSavedJobsClient();
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
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="ap-eyebrow">Saved</p>
            <h1 className="ap-h2 mt-2">Roles you bookmarked</h1>
            <p className="ap-lead mt-2 text-base">
              {jobs.length > 0 ? (
                <>
                  <span className="tabular-nums">{jobs.length}</span>{" "}
                  {jobs.length === 1 ? "role" : "roles"} waiting for a second look.
                </>
              ) : (
                "Roles you bookmark as you browse show up here."
              )}
            </p>
          </div>
          <Link href="/jobs" className="ap-btn ap-btn-ghost shrink-0">
            Browse jobs
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </header>

        <div className="flex flex-col gap-4">
          {q.isLoading && (
            <>
              <Skeleton className="h-32 rounded-[22px]" />
              <Skeleton className="h-32 rounded-[22px]" />
            </>
          )}
          {q.isError && (
            <ErrorState
              message={errorMessage(q.error)}
              retry={() => q.refetch()}
            />
          )}
          {!q.isLoading && !q.isError && jobs.length === 0 && (
            <EmptyState
              title="No saved jobs yet"
              description="Bookmark roles as you browse the marketplace and they'll show up here."
              icon={Bookmark}
              action={
                <Link href="/jobs" className="ap-btn ap-btn-primary ap-btn-sm">
                  Browse jobs
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              }
            />
          )}

          {jobs.slice(0, shown).map((j, i) => (
            <SavedJobCell
              key={j.jobId}
              job={j}
              delay={Math.min(i, 8) * 30}
              salary={formatSalary(j.salaryMin, j.salaryMax, j.salaryCurrency)}
            />
          ))}

          {jobs.length > shown && (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE)}
              className="ap-btn ap-btn-ghost self-center"
            >
              Show more ({jobs.length - shown})
            </button>
          )}
        </div>
      </div>
    </CandidateShell>
  );
}

/** A saved job rendered as an `.ap-cell`. The whole card links to the job detail; the
 *  SaveJobButton in the footer stops propagation so toggling doesn't navigate. */
function SavedJobCell({
  job,
  delay,
  salary,
}: {
  job: SavedJobDTO;
  delay: number;
  salary: string | null;
}) {
  const initial = useMemo(
    () => (job.companyName.trim()[0] ?? "?").toUpperCase(),
    [job.companyName],
  );
  const remote = job.remoteMode ? REMOTE_LABEL[job.remoteMode] : null;
  const employment = job.employmentType
    ? (TYPE_LABEL[job.employmentType] ??
      job.employmentType.replace(/_/g, " "))
    : null;

  return (
    <Link
      href={`/jobs/${job.jobId}`}
      style={{ animationDelay: `${delay}ms` }}
      className="ap-cell animate-rise-in block transition-colors hover:bg-surface-2"
    >
      <span className="ap-cell-tag">Saved {savedLabel(job.savedAt)}</span>
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-4 pr-32">
          <span
            className="grid size-12 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 font-display text-xl font-semibold text-foreground"
            aria-hidden
          >
            {initial}
          </span>
          <div className="min-w-0">
            <p className="ap-h3 text-lg leading-tight">{job.title}</p>
            <p className="mt-1 text-sm text-ink-2">{job.companyName}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {remote && <span className="ap-pill ap-pill--teal">{remote}</span>}
          {job.location && (
            <span className="ap-pill">
              <MapPin className="size-3" aria-hidden />
              {job.location}
            </span>
          )}
          {employment && <span className="ap-pill">{employment}</span>}
          {salary && (
            <span className="ap-pill ap-pill--good tabular-nums">{salary}</span>
          )}
        </div>

        {job.snippet && (
          <p className="line-clamp-2 text-sm text-ink-2">{job.snippet}</p>
        )}

        {job.skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {job.skills.slice(0, 6).map((s) => (
              <span
                key={s}
                className="ap-pill"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {s}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
          <span
            className="text-[0.74rem] text-ink-3"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            posted {postedLabel(job.postedAt)}
          </span>
          <span className="flex-1" />
          <span onClick={(e) => e.stopPropagation()}>
            <SaveJobButton jobId={job.jobId} />
          </span>
          <span
            className={cn("ap-btn ap-btn-primary ap-btn-sm pointer-events-none")}
            aria-hidden
          >
            View role
            <ApIcon name="arrow" className="size-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}
