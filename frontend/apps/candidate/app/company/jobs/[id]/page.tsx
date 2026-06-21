"use client";

import { ConfirmDialog, ErrorState, LoadingState, toast } from "@ip/ui";
import {
  TERMINAL_STATES,
  errorMessage,
  useAuthedQuery,
  useRequireRole,
} from "@ip/shared";
import type { ApplicationResponse } from "@ip/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { CompanyShell } from "../../../../components/company-shell";
import { useAuth } from "../../../../lib/auth";

/* ============================================================
   APTURA · v3 — Job pipeline / Kanban (`/company/jobs/[id]`)
   Lanes: Applied · Aptitude · Interview · Shortlisted ·
   Hired · Rejected. Each lane shows applicant cards with
   handle + state pill. Click → applicant report.
   PRESERVES api.applications.listApplicants + the polling
   pattern from the recruiter app (10s, capped at 120 ticks).
   ============================================================ */

type LaneKey = "applied" | "aptitude" | "interview" | "shortlisted" | "hired" | "rejected";

const LANES: { key: LaneKey; label: string; states: string[]; tone: string }[] = [
  { key: "applied", label: "Applied", states: ["applied"], tone: "" },
  { key: "aptitude", label: "Aptitude", states: ["aptitude_pending", "aptitude", "gated_out"], tone: "" },
  { key: "interview", label: "Interview", states: ["interview_pending", "interviewed", "scored", "assessment_review"], tone: "" },
  { key: "shortlisted", label: "Shortlisted", states: ["shortlisted"], tone: "good" },
  { key: "hired", label: "Hired", states: ["hired"], tone: "good" },
  { key: "rejected", label: "Rejected", states: ["rejected"], tone: "warn" },
];

const STATE_LABEL: Record<string, string> = {
  applied: "Applied",
  aptitude_pending: "Aptitude pending",
  aptitude: "Aptitude",
  gated_out: "Gated out",
  interview_pending: "Interview pending",
  interviewed: "Interviewed",
  scored: "Scored",
  assessment_review: "Review",
  shortlisted: "Shortlisted",
  hired: "Hired",
  rejected: "Rejected",
};

const POLL_MS = 10_000;
const MAX_POLLS = 120;

// Short, stable handle for the opaque candidate id (no PII in the list payload).
const candidateHandle = (id: string) => id.slice(0, 8).toUpperCase();

function bucket(apps: ApplicationResponse[]): Record<LaneKey, ApplicationResponse[]> {
  const out: Record<LaneKey, ApplicationResponse[]> = {
    applied: [], aptitude: [], interview: [], shortlisted: [], hired: [], rejected: [],
  };
  for (const a of apps) {
    const lane = LANES.find((l) => l.states.includes(a.state));
    if (lane) out[lane.key].push(a);
  }
  return out;
}

function statePill(state: string): string {
  if (["shortlisted", "hired"].includes(state)) return "ap-pill ap-pill--good";
  if (["rejected", "gated_out"].includes(state)) return "ap-pill ap-pill--danger";
  if (state === "assessment_review") return "ap-pill ap-pill--warn";
  return "ap-pill";
}

export default function JobPipelinePage() {
  const { api, token, identity, ready } = useAuth();
  useRequireRole(identity?.role, ["recruiter", "company_admin"], ready);
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const job = useAuthedQuery(token, {
    queryKey: ["job", id],
    queryFn: () => api.jobs.getJob({ jobId: id }),
    enabled: Boolean(token && id),
  });

  // Preserve the existing polling pattern from the recruiter app's ApplicantsTable.
  const applicants = useAuthedQuery(token, {
    queryKey: ["applicants", id],
    queryFn: () => api.applications.listApplicants({ jobId: id }),
    enabled: Boolean(token && id),
    refetchInterval: (q) => {
      const apps = q.state.data?.applications ?? [];
      const pending = apps.some((a) => !TERMINAL_STATES.has(a.state));
      return pending && q.state.dataUpdateCount < MAX_POLLS ? POLL_MS : false;
    },
  });

  const override = useMutation({
    mutationFn: (applicationId: string) => api.decisions.overrideGate({ applicationId }),
    onSuccess: () => {
      toast.success("Gate overridden");
      qc.invalidateQueries({ queryKey: ["applicants", id] });
      qc.invalidateQueries({ queryKey: ["ranked", id] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const lanes = useMemo(
    () => bucket(applicants.data?.applications ?? []),
    [applicants.data],
  );

  if (!mounted) return null;
  if (!token || (identity?.role !== "recruiter" && identity?.role !== "company_admin")) {
    return null;
  }

  const status = (job.data?.status as string | undefined) ?? "";

  return (
    <CompanyShell>
      <div className="mb-4">
        <Link href="/company/jobs" className="ap-btn ap-btn-ghost ap-btn-sm inline-flex">
          <ArrowLeft className="size-4" aria-hidden /> All jobs
        </Link>
      </div>

      {job.isLoading && <LoadingState />}
      {job.isError && (
        <ErrorState message={errorMessage(job.error)} retry={() => job.refetch()} />
      )}

      {job.data && (
        <div className="ap-section-head ap-section-head--two">
          <div>
            <span className="ap-eyebrow">Pipeline</span>
            <h1 className="ap-h2">{job.data.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={statePillJobStatus(status)}>{status || "draft"}</span>
              <span className="text-sm text-ink-3">
                {applicants.data?.applications.length ?? 0} applicants
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2 justify-self-end">
            <Link
              href={`/company/jobs/${id}/edit`}
              className="ap-btn ap-btn-ghost"
            >
              <Pencil className="size-4" aria-hidden /> Edit job
            </Link>
          </div>
        </div>
      )}

      {applicants.isError && (
        <ErrorState message={errorMessage(applicants.error)} retry={() => applicants.refetch()} />
      )}
      {applicants.isLoading && (
        <div className="mt-6 grid gap-4 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="ap-cell h-64 animate-pulse" />
          ))}
        </div>
      )}

      {!applicants.isLoading && (applicants.data?.applications.length ?? 0) === 0 && (
        <div className="ap-cell ap-cell--anchor mt-6 grid place-items-center gap-3 py-12 text-center">
          <h2 className="ap-h3">No applicants yet</h2>
          <p className="ap-lead max-w-md">
            No applicants yet — share the role link from your jobs page and the funnel
            will populate here.
          </p>
        </div>
      )}

      {(applicants.data?.applications.length ?? 0) > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {LANES.map((lane) => {
            const apps = lanes[lane.key];
            return (
              <div key={lane.key} className="ap-cell flex flex-col gap-3">
                <header className="flex items-center justify-between gap-2">
                  <h3 className="ap-h4 text-[0.95rem]">{lane.label}</h3>
                  <span className="font-mono text-xs text-ink-3 tabular-nums">
                    {apps.length}
                  </span>
                </header>
                {apps.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-line-2 bg-surface-2 p-3 text-xs text-ink-3">
                    Empty
                  </p>
                ) : (
                  <ul className="grid gap-2">
                    {apps.map((a) => (
                      <li key={a.applicationId}>
                        <Link
                          href={`/company/jobs/${id}/applicants/${a.applicationId}`}
                          className="block rounded-xl border border-line bg-surface-2 p-3 transition-colors hover:bg-surface-3 hover:border-line-2"
                        >
                          <div className="flex items-center gap-2">
                            <Avatar handle={candidateHandle(a.candidateUserId)} />
                            <div className="min-w-0">
                              <div className="font-mono text-xs font-semibold text-ink-deep">
                                {candidateHandle(a.candidateUserId)}
                              </div>
                              <div className="text-[0.7rem] text-ink-3">Applicant</div>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className={statePill(a.state)}>
                              {STATE_LABEL[a.state] ?? a.state}
                            </span>
                          </div>
                          {a.state === "gated_out" && (
                            <div className="mt-2">
                              <ConfirmDialog
                                trigger={
                                  <button
                                    type="button"
                                    onClick={(e) => e.stopPropagation()}
                                    className="ap-btn ap-btn-ghost ap-btn-sm w-full"
                                  >
                                    Override gate
                                  </button>
                                }
                                title="Override the aptitude gate?"
                                description="This lets the candidate proceed to interview despite not passing."
                                confirmLabel="Override"
                                busy={override.isPending}
                                onConfirm={() => override.mutate(a.applicationId)}
                              />
                            </div>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </CompanyShell>
  );
}

function statePillJobStatus(status: string): string {
  if (status === "published") return "ap-pill ap-pill--good";
  if (status === "paused") return "ap-pill ap-pill--warn";
  if (status === "closed") return "ap-pill ap-pill--danger";
  return "ap-pill";
}

function Avatar({ handle }: { handle: string }) {
  const initial = handle.slice(0, 2);
  return (
    <span
      aria-hidden
      className="grid size-7 shrink-0 place-items-center rounded-full bg-teal-soft font-mono text-[0.65rem] font-bold text-teal-strong"
    >
      {initial}
    </span>
  );
}
