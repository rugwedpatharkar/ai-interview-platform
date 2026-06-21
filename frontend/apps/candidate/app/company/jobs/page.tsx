"use client";

import { errorMessage, useAuthedQuery, useRequireRole } from "@ip/shared";
import { ArrowRight, FileText, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { CompanyShell } from "../../../components/company-shell";
import { useAuth } from "../../../lib/auth";

/* ============================================================
   APTURA · v3 — Jobs list (`/company/jobs`)
   Filter chips + cell-wrapped data.table of jobs with status,
   applicant counts, and per-row actions (Edit / Pipeline / Close).
   ============================================================ */

const STATUS_HINT: Record<string, string> = {
  draft: "Not yet visible to candidates",
  published: "Accepting applications",
  paused: "Applications paused",
  closed: "No longer accepting applications",
};

type StatusFilter = "all" | "draft" | "published" | "paused" | "closed";

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Drafts" },
  { value: "paused", label: "Paused" },
  { value: "closed", label: "Closed" },
];

function postedLabel(postedAt: string): string {
  if (!postedAt) return "—";
  const d = new Date(postedAt);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

function statusPillClass(status: string): string {
  if (status === "published") return "ap-pill ap-pill--good";
  if (status === "paused") return "ap-pill ap-pill--warn";
  if (status === "closed") return "ap-pill ap-pill--danger";
  return "ap-pill"; // draft / unknown
}

export default function CompanyJobsPage() {
  const { api, token, identity, ready } = useAuth();
  useRequireRole(identity?.role, ["recruiter", "company_admin"], ready);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [filter, setFilter] = useState<StatusFilter>("all");

  const jobs = useAuthedQuery(token, {
    queryKey: ["jobs"],
    queryFn: () => api.jobs.listJobs({}),
    enabled: Boolean(token),
  });
  const list = jobs.data?.jobs ?? [];
  const filtered = useMemo(
    () => (filter === "all" ? list : list.filter((j) => j.status === filter)),
    [list, filter],
  );

  const counts = useMemo(() => {
    const acc: Record<StatusFilter, number> = {
      all: list.length,
      draft: 0,
      published: 0,
      paused: 0,
      closed: 0,
    };
    for (const j of list) {
      const key = j.status as StatusFilter;
      if (key in acc) acc[key] += 1;
    }
    return acc;
  }, [list]);

  if (!mounted) return null;
  if (!token || (identity?.role !== "recruiter" && identity?.role !== "company_admin")) {
    return null;
  }

  return (
    <CompanyShell>
      <div className="ap-section-head ap-section-head--two">
        <div>
          <span className="ap-eyebrow">Jobs</span>
          <h1 className="ap-h2">Roles you&apos;re hiring for</h1>
        </div>
        <div className="flex flex-wrap items-end gap-3 justify-self-end">
          <p className="ap-lead">
            Every role here runs a proctored AI interview and emits an evidence-based
            report.
          </p>
          <Link href="/company/jobs/new" className="ap-btn ap-btn-primary">
            <Plus className="size-4" aria-hidden /> Post a job
          </Link>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.value;
          return (
            <button
              key={f.value}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(f.value)}
              className={
                active
                  ? "inline-flex items-center gap-2 rounded-full border border-teal bg-teal-soft px-3 py-1 text-sm font-semibold text-teal-strong"
                  : "inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-sm text-ink-2 hover:bg-surface-2"
              }
            >
              {f.label} · {counts[f.value] ?? 0}
            </button>
          );
        })}
      </div>

      {jobs.isError && (
        <div className="ap-cell mt-6">
          <p className="text-sm text-danger">{errorMessage(jobs.error)}</p>
          <button
            type="button"
            onClick={() => jobs.refetch()}
            className="ap-btn ap-btn-ghost ap-btn-sm mt-3"
          >
            Retry
          </button>
        </div>
      )}

      {jobs.isLoading && (
        <div className="ap-cell mt-6 grid gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-md bg-surface-2" />
          ))}
        </div>
      )}

      {!jobs.isLoading && !jobs.isError && list.length === 0 && (
        <div className="ap-cell ap-cell--anchor mt-6 grid place-items-center gap-3 py-12 text-center">
          <FileText className="size-7 text-teal" aria-hidden />
          <h2 className="ap-h3">No jobs yet</h2>
          <p className="ap-lead max-w-md">
            Post a role to start receiving applicants. Every applicant gets a strict
            proctored interview and an outcome.
          </p>
          <Link href="/company/jobs/new" className="ap-btn ap-btn-primary mt-2">
            <Plus className="size-4" aria-hidden /> Post a job
          </Link>
        </div>
      )}

      {!jobs.isLoading && filtered.length === 0 && list.length > 0 && (
        <p className="mt-6 text-sm text-ink-2">No jobs in this status.</p>
      )}

      {filtered.length > 0 && (
        <div className="ap-cell mt-6 overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-left text-[0.72rem] font-semibold uppercase tracking-wide text-ink-3">
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Posted</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((job) => (
                  <tr
                    key={job.jobId}
                    className="border-b border-line last:border-b-0 hover:bg-surface-2"
                  >
                    <td className="px-5 py-4">
                      <Link
                        href={`/company/jobs/${job.jobId}`}
                        className="text-[1rem] font-semibold text-ink-deep hover:underline"
                      >
                        {job.title}
                      </Link>
                      <p className="mt-0.5 text-xs text-ink-3">
                        {STATUS_HINT[job.status] ?? "Job posting"}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <span className={statusPillClass(job.status)}>{job.status}</span>
                    </td>
                    <td className="px-5 py-4 tabular-nums text-ink-2">
                      {postedLabel(job.postedAt)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/company/jobs/${job.jobId}/edit`}
                          className="ap-btn ap-btn-ghost ap-btn-sm"
                        >
                          Edit
                        </Link>
                        <Link
                          href={`/company/jobs/${job.jobId}`}
                          className="ap-btn ap-btn-ghost ap-btn-sm"
                        >
                          Pipeline
                          <ArrowRight className="size-3.5" aria-hidden />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </CompanyShell>
  );
}
