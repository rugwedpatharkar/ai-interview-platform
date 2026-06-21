"use client";

import { errorMessage, useAuthedQuery, useRequireRole } from "@ip/shared";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { CompanyShell } from "../../components/company-shell";
import { useAuth } from "../../lib/auth";

/* ============================================================
   APTURA · v3 — Recruiter dashboard (`/company`)
   Aperture-Pro page head + 4-stat band + bento with an
   anchor "Active funnel" cell and three supporting cells.
   ============================================================ */

interface FunnelStage {
  state: string;
  label: string;
  count: number;
}

const STAGE_LABEL: Record<string, string> = {
  applied: "Applied",
  aptitude: "Aptitude",
  aptitude_pending: "Aptitude",
  scored: "Interviewed",
  interview_pending: "Interview",
  assessment_review: "Review",
  shortlisted: "Shortlisted",
  hired: "Hired",
  rejected: "Rejected",
  gated_out: "Gated out",
};

// `states` is the wire name (analytics_pb.FunnelAnalytics); `count` is bigint —
// widen to number once for downstream math.
function aggregate(funnel: { states: { state: string; count: bigint }[] }): FunnelStage[] {
  return funnel.states.map((s) => ({
    state: s.state,
    label: STAGE_LABEL[s.state] ?? s.state.replace(/_/g, " "),
    count: Number(s.count),
  }));
}

function sumStages(stages: FunnelStage[], match: (state: string) => boolean): number {
  return stages.reduce((acc, s) => (match(s.state) ? acc + s.count : acc), 0);
}

export default function CompanyDashboardPage() {
  const { api, token, identity, ready } = useAuth();
  useRequireRole(identity?.role, ["recruiter", "company_admin"], ready);

  // Hide SSR/CSR mismatch flash by deferring children until mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Same query key as the analytics page → TanStack dedups the fetch across surfaces.
  const funnel = useAuthedQuery(token, {
    queryKey: ["analytics", "funnel"],
    queryFn: () => api.analytics.getFunnelAnalytics({}),
    enabled: Boolean(token),
  });
  const jobs = useAuthedQuery(token, {
    queryKey: ["jobs"],
    queryFn: () => api.jobs.listJobs({}),
    enabled: Boolean(token),
  });

  const stages = useMemo<FunnelStage[]>(
    () => (funnel.data ? aggregate(funnel.data) : []),
    [funnel.data],
  );

  const jobList = jobs.data?.jobs ?? [];
  const activeRoles = jobList.filter((j) => j.status === "published").length;
  const applicantsTotal = sumStages(stages, () => true);
  const interviewsScheduled = sumStages(stages, (s) =>
    ["interview_pending", "scored"].includes(s),
  );
  const decisionsPending = sumStages(stages, (s) =>
    ["assessment_review", "scored"].includes(s),
  );

  if (!mounted) return null;
  if (!token || (identity?.role !== "recruiter" && identity?.role !== "company_admin")) {
    return null;
  }

  return (
    <CompanyShell>
      <PageHead />

      {/* 4-stat band — counts are derived from the funnel + jobs list. */}
      <div className="ap-stats mt-6">
        <Stat
          n={activeRoles}
          label="Active roles"
          loading={jobs.isLoading}
          unit={activeRoles === 1 ? "role" : "roles"}
        />
        <Stat
          n={applicantsTotal}
          label="Applicants this week"
          loading={funnel.isLoading}
        />
        <Stat
          n={interviewsScheduled}
          label="Interviews scheduled"
          loading={funnel.isLoading}
        />
        <Stat
          n={decisionsPending}
          label="Decisions pending"
          loading={funnel.isLoading}
        />
      </div>

      {/* Bento — anchor (Active funnel) + 3 supporting cells. */}
      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        <div className="ap-cell ap-cell--anchor lg:col-span-2 lg:row-span-2">
          <span className="ap-cell-tag">Active funnel</span>
          <h2 className="ap-h3 mb-1">Where every applicant stands</h2>
          <p className="text-[0.95rem] text-ink-2">
            Live counts across your hiring stages. Every applicant has an outcome.
          </p>

          {funnel.isError && (
            <p className="mt-6 text-sm text-danger">{errorMessage(funnel.error)}</p>
          )}
          {funnel.isLoading && (
            <div className="mt-6 grid gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-9 animate-pulse rounded-md bg-surface-2"
                />
              ))}
            </div>
          )}
          {!funnel.isLoading && !funnel.isError && stages.length === 0 && (
            <p className="mt-6 text-sm text-ink-2">
              No applicants yet — once a candidate applies, the funnel populates here.
            </p>
          )}
          {!funnel.isLoading && stages.length > 0 && (
            <ul className="mt-6 grid gap-2.5">
              {stages.map((s) => (
                <li key={s.state} className="ap-bar">
                  <span className="name">{s.label}</span>
                  <span className="v">{s.count}</span>
                  <span className="t">
                    <i style={{ width: barWidth(s.count, applicantsTotal) }} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="ap-cell">
          <span className="ap-cell-tag">Recent activity</span>
          <h3 className="ap-h4 mb-3">Latest postings</h3>
          {jobs.isLoading && (
            <div className="grid gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-md bg-surface-2" />
              ))}
            </div>
          )}
          {!jobs.isLoading && jobList.length === 0 && (
            <p className="text-sm text-ink-2">
              No jobs yet —{" "}
              <Link href="/company/jobs/new" className="text-teal-strong underline-offset-2 hover:underline">
                post a role
              </Link>
              .
            </p>
          )}
          {!jobs.isLoading && jobList.length > 0 && (
            <ul className="grid gap-2">
              {jobList.slice(0, 4).map((job) => (
                <li key={job.jobId}>
                  <Link
                    href={`/company/jobs/${job.jobId}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm hover:bg-surface-3"
                  >
                    <span className="min-w-0 truncate font-medium text-ink-deep">
                      {job.title}
                    </span>
                    <span className="ap-pill">{job.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="ap-cell">
          <span className="ap-cell-tag">Team</span>
          <h3 className="ap-h4 mb-3">Your workspace</h3>
          <p className="text-sm text-ink-2">
            Invite teammates and assign hiring lanes. Each decision is logged with the
            reviewer&apos;s name.
          </p>
          <Link
            href="/company/team"
            className="ap-btn ap-btn-ghost ap-btn-sm mt-4 inline-flex"
          >
            Manage team
          </Link>
        </div>

        <div className="ap-cell lg:col-span-2">
          <span className="ap-cell-tag">What needs attention</span>
          <h3 className="ap-h4 mb-3">Decisions waiting on you</h3>
          {decisionsPending === 0 ? (
            <p className="text-sm text-ink-2">
              Nothing waiting — every applicant has an outcome or is mid-funnel.
            </p>
          ) : (
            <p className="text-sm text-ink-2">
              {decisionsPending} candidate{decisionsPending === 1 ? "" : "s"} are scored
              and waiting for your call.{" "}
              <Link
                href="/company/jobs"
                className="text-teal-strong underline-offset-2 hover:underline"
              >
                Open jobs to decide
              </Link>
              .
            </p>
          )}
        </div>
      </div>
    </CompanyShell>
  );
}

function PageHead() {
  return (
    <div className="ap-section-head ap-section-head--two">
      <div>
        <span className="ap-eyebrow">Dashboard</span>
        <h1 className="ap-h2">Hire on evidence. Decide with confidence.</h1>
      </div>
      <p className="ap-lead">
        A live view across roles, applicants, interviews and decisions — every
        applicant gets an answer.
      </p>
    </div>
  );
}

function Stat({
  n,
  label,
  unit,
  loading,
}: {
  n: number;
  label: string;
  unit?: string;
  loading?: boolean;
}) {
  return (
    <div className="ap-stat">
      <div className="ap-stat-n">
        {loading ? (
          <span className="inline-block h-[1em] w-[1.5em] animate-pulse rounded bg-surface-2 align-middle" />
        ) : (
          n.toLocaleString()
        )}
        {unit && <span className="ap-stat-unit"> {unit}</span>}
      </div>
      <div className="ap-stat-l">{label}</div>
    </div>
  );
}

function barWidth(n: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.max(4, Math.round((n / total) * 100))}%`;
}
