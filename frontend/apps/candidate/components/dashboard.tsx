"use client";

import {
  ApIcon,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Skeleton,
  applicationStatus,
  cn,
  toast,
} from "@ip/ui";
import {
  TERMINAL_STATES,
  decodeJwtPayload,
  errorMessage,
  pollingBackoff,
  useAuthedQuery,
  useCountUp,
} from "@ip/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Briefcase, Dumbbell, Sparkles, Video } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";

import { useAuth } from "../lib/auth";
import { CandidateShell } from "./candidate-shell";
import { CandidateChecklist } from "./onboarding/candidate-checklist";

// Heavy, below-the-fold, client-only widget — load it lazily so it stays out of
// the initial dashboard bundle.
const AssistantChat = dynamic(
  () => import("./assistant-chat").then((m) => m.AssistantChat),
  { ssr: false, loading: () => null },
);

// Exponential backoff for the applications poll — ramps from 10s to 60s over 18 polls
// (~9 minutes total). Stops automatically when all applications reach a terminal state.
const applicationsBackoff = pollingBackoff({
  initialMs: 10_000,
  capMs: 60_000,
  maxPolls: 18,
  jitterRatio: 0.15,
});

// State buckets used to derive the four KPI tiles + the "responses received" count.
// Anything outside `applied` counts as a response — the company has done something
// past intake (gated through aptitude, run an interview, scored, decided).
const RESPONDED = new Set([
  "aptitude_pending",
  "interview_pending",
  "interview_in_progress",
  "interviewed",
  "scored",
  "shortlisted",
  "hired",
  "rejected",
  "gated_out",
]);

export function Dashboard() {
  const { api, token } = useAuth();
  const email = token
    ? ((decodeJwtPayload(token)?.email as string | undefined) ?? null)
    : null;
  const queryClient = useQueryClient();
  const [jobId, setJobId] = useState("");
  // Synchronous in-flight latch: survives a same-tick double-click / StrictMode
  // double-invoke that the `apply.isPending` flag (stale closure) cannot catch.
  const inFlight = useRef(false);

  const applications = useAuthedQuery(token, {
    queryKey: ["applications"],
    queryFn: () => api.applications.listMyApplications({}),
    // Notifications are email-only, so poll while anything is still in flight —
    // but cap via backoff so a long session doesn't hammer the backend forever.
    refetchInterval: (query) => {
      const apps = query.state.data?.applications ?? [];
      if (!apps.some((a) => !TERMINAL_STATES.has(a.state))) return false;
      return applicationsBackoff(query);
    },
  });

  const recommendations = useAuthedQuery(token, {
    queryKey: ["recommendations"],
    queryFn: () => api.recommendations.getCandidateRecommendations({}),
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["applications"] });

  const apply = useMutation({
    mutationFn: () => api.applications.apply({ jobId, consent: true }),
    onSuccess: () => {
      setJobId("");
      toast.success("Application submitted");
      refresh();
      // The applied role should drop out of recommendations (no stale Apply button).
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
    onSettled: () => {
      inFlight.current = false;
    },
  });

  const withdraw = useMutation({
    mutationFn: (applicationId: string) =>
      api.applications.withdrawApplication({ applicationId }),
    onSuccess: () => {
      toast.success("Application withdrawn");
      refresh();
      // A withdrawn role becomes eligible for recommendations again — refresh them.
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const list = applications.data?.applications ?? [];
  const matches = recommendations.data?.matches ?? [];

  // KPI + up-next are derived client-side from the already-fetched applications —
  // display-only, no extra fetch. Memoized so the count-up tiles and up-next don't
  // recompute (or re-animate) on unrelated re-renders.
  const { inFlightCount, interviewApps, respondedCount } = useMemo(() => {
    const inFlight = list.filter((a) => !TERMINAL_STATES.has(a.state));
    const interviews = list.filter(
      (a) =>
        a.state === "interview_pending" || a.state === "interview_in_progress",
    );
    const responded = list.filter((a) => RESPONDED.has(a.state));
    return {
      inFlightCount: inFlight.length,
      interviewApps: interviews,
      respondedCount: responded.length,
    };
  }, [list]);

  const nextInterview = interviewApps[0];
  // No display-name field exists on the identity (id is a Mongo ObjectId), so derive a
  // friendly name from the email local-part and fall back to "there" — never the raw id.
  const firstName = email?.split("@")[0]?.split(/[.\s_]/)[0] || "there";
  const greetName = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  // Stable callback for the application rows so memoized children don't re-render.
  const onWithdraw = useCallback(
    (id: string) => withdraw.mutate(id),
    [withdraw],
  );

  function onApply() {
    if (inFlight.current || !jobId.trim()) return;
    inFlight.current = true;
    apply.mutate();
  }

  return (
    <CandidateShell>
      <div className="flex flex-col gap-10">
        {/* Greeting */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="ap-eyebrow">Dashboard</p>
            <h1 className="txt-h1 mt-2">Welcome back, {greetName}.</h1>
            <p className="ap-lead mt-2 text-base">
              {inFlightCount} application{inFlightCount === 1 ? "" : "s"} in flight
              {interviewApps.length > 0 && (
                <>
                  {" · "}
                  {interviewApps.length} interview
                  {interviewApps.length === 1 ? "" : "s"} active
                </>
              )}
              {" · every company here answers."}
            </p>
          </div>
          <Link href="/jobs" className="ap-btn ap-btn-primary shrink-0">
            Find roles
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </header>

        <CandidateChecklist />

        {/* KPI strip — three anchored stats. We always render the strip and only
            swap the values in once data lands; that prevents layout jump and keeps
            the dashboard's vertical rhythm stable. */}
        <section
          aria-label="At-a-glance"
          className="rounded-[var(--rad-xl)] border border-line bg-surface p-6"
        >
          <p className="ap-eyebrow">At a glance</p>
          <div className="ap-stats mt-6" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            {applications.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="ap-stat">
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="mt-3 h-3 w-32" />
                </div>
              ))
            ) : (
              <>
                <StatCell
                  value={inFlightCount}
                  label="Applications in flight"
                />
                <StatCell
                  value={interviewApps.length}
                  label="Interviews to start"
                />
                <StatCell
                  value={respondedCount}
                  label="Responses received"
                />
              </>
            )}
          </div>
        </section>

        {/* Two-column body — applications anchor on the left; up-next/recommended/practice
            stack on the right. Collapses to one column under lg. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr] lg:items-start">
          {/* LEFT — applications + apply form */}
          <section className="flex flex-col gap-6">
            <div className="ap-cell ap-cell--anchor">
              <span className="ap-cell-tag">A · 01</span>
              <div className="flex items-center justify-between gap-3">
                <h2 className="txt-h2 flex items-center gap-2">
                  <Briefcase className="size-5 text-primary" aria-hidden />
                  Your applications
                </h2>
                {list.length > 0 && (
                  <span className="ap-pill ap-pill--teal tabular-nums">
                    {list.length}
                  </span>
                )}
              </div>

              <div className="mt-5 flex flex-col gap-3">
                {applications.isLoading && (
                  <>
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4"
                      >
                        <Skeleton className="size-10 shrink-0 rounded-full" />
                        <div className="flex-1">
                          <Skeleton className="h-4 w-40" />
                          <Skeleton className="mt-2 h-3 w-24" />
                        </div>
                        <Skeleton className="h-6 w-20 rounded-full" />
                      </div>
                    ))}
                  </>
                )}
                {applications.isError && (
                  <ErrorState
                    message={`Couldn't load your applications — ${errorMessage(applications.error)}`}
                    retry={() => applications.refetch()}
                  />
                )}
                {!applications.isLoading &&
                  !applications.isError &&
                  list.length === 0 && (
                    <EmptyState
                      title="No applications yet"
                      description="Browse open roles — every company here answers, so you'll always hear back."
                      icon={Briefcase}
                      action={
                        <Link
                          href="/jobs"
                          className="ap-btn ap-btn-ghost ap-btn-sm"
                        >
                          Browse jobs
                          <ArrowRight className="size-4" aria-hidden />
                        </Link>
                      }
                    />
                  )}
                {list.map((a, i) => (
                  <DashboardApplicationRow
                    key={a.applicationId}
                    app={a}
                    delay={Math.min(i, 6) * 40}
                    onWithdraw={onWithdraw}
                    withdrawing={withdraw.isPending}
                  />
                ))}
              </div>
            </div>

            {/* Apply by ID — minimal seam preserved so the existing apply mutation still works.
                The marketplace is the primary path; this is the fallback for invite links. */}
            <div className="ap-cell">
              <span className="ap-cell-tag">A · 02</span>
              <h3 className="txt-h2">Have a job ID from an invite?</h3>
              <p className="mt-1 text-sm text-ink-2">
                Paste it below to apply directly. AI-assisted screening is enabled
                by default — review our{" "}
                <Link href="/privacy" className="underline">
                  privacy notice
                </Link>
                .
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  onApply();
                }}
                className="mt-4 flex flex-col gap-3 sm:flex-row"
              >
                <input
                  id="jobId"
                  aria-label="Job ID"
                  value={jobId}
                  disabled={apply.isPending}
                  onChange={(e) => setJobId(e.target.value)}
                  placeholder="job_…"
                  className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-foreground placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  type="submit"
                  disabled={!jobId.trim() || apply.isPending}
                  className={cn(
                    "ap-btn ap-btn-primary",
                    (!jobId.trim() || apply.isPending) &&
                      "cursor-not-allowed opacity-60",
                  )}
                >
                  {apply.isPending ? "Applying…" : "Apply"}
                </button>
              </form>
            </div>
          </section>

          {/* RIGHT — up next + recommended + practice */}
          <aside className="flex flex-col gap-6">
            {nextInterview && (
              <div className="ap-cell ap-cell--anchor">
                <span className="ap-cell-tag">B · UP NEXT</span>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="txt-h3">Up next</h2>
                  <span className="ap-pill ap-pill--good">
                    <ApIcon name="shield-check" className="size-3" />
                    Proctored
                  </span>
                </div>
                <div className="my-4 flex items-center gap-3">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-teal-soft text-primary">
                    <Video className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      Interview · Job {nextInterview.jobId}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-2">
                      {nextInterview.state === "interview_in_progress"
                        ? "In progress — resume now."
                        : "Ready when you are."}
                    </p>
                  </div>
                </div>
                <Link
                  href={`/interview/${nextInterview.applicationId}`}
                  className="ap-btn ap-btn-primary w-full justify-center"
                >
                  Join interview
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            )}

            {/* Recommended — keep the existing query key + matches shape verbatim;
                rendered inline here so the right rail stays self-contained. */}
            <div className="ap-cell">
              <span className="ap-cell-tag">B · 01</span>
              <h2 className="txt-h3 flex items-center gap-2">
                <Sparkles className="size-4 text-primary" aria-hidden />
                Recommended
              </h2>
              <div className="mt-4 flex flex-col gap-3">
                {recommendations.isLoading &&
                  Array.from({ length: 2 }).map((_, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-line bg-surface p-4"
                    >
                      <Skeleton className="h-4 w-3/5" />
                      <Skeleton className="mt-2 h-3 w-full" />
                    </div>
                  ))}
                {recommendations.isError && (
                  <ErrorState
                    message={`Couldn't load recommendations — ${errorMessage(recommendations.error)}`}
                    retry={() => recommendations.refetch()}
                  />
                )}
                {!recommendations.isLoading &&
                  !recommendations.isError &&
                  matches.length === 0 && (
                    <p className="text-sm text-ink-2">
                      Once your profile is parsed, roles that fit your skills appear
                      here.
                    </p>
                  )}
                {matches.slice(0, 3).map((m, i) => (
                  <Link
                    key={m.jobId}
                    href={`/jobs/${m.jobId}`}
                    style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                    className="animate-rise-in flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 transition-colors hover:bg-surface-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium text-foreground">
                        Recommended role
                      </p>
                      <span className="ap-pill ap-pill--teal tabular-nums">
                        {Math.round(m.score * 100)}% match
                      </span>
                    </div>
                    {m.reasons.length > 0 && (
                      <p className="line-clamp-2 text-sm text-ink-2">
                        {m.reasons[0]}
                      </p>
                    )}
                  </Link>
                ))}
                {matches.length > 0 && (
                  <Link
                    href="/jobs"
                    className="self-start text-sm font-medium text-primary hover:underline"
                  >
                    See all matches →
                  </Link>
                )}
              </div>
            </div>

            <div className="ap-cell">
              <span className="ap-cell-tag">B · 02</span>
              <h2 className="txt-h3 flex items-center gap-2">
                <Dumbbell className="size-4 text-primary" aria-hidden />
                Practice
              </h2>
              <p className="mt-2 text-sm text-ink-2">
                Run a private mock interview with instant feedback. Never shared with
                employers.
              </p>
              <Link
                href="/practice"
                className="ap-btn ap-btn-ghost ap-btn-sm mt-4"
              >
                Start a practice run
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          </aside>
        </div>

        <AssistantChat />
      </div>
    </CandidateShell>
  );
}

/** Single stat cell inside the `.ap-stats` strip. Integer values animate from 0 on
 *  mount (count-up) so the dashboard feels alive on first paint. */
function StatCell({ value, label }: { value: number; label: string }) {
  const n = useCountUp(value);
  return (
    <div className="ap-stat">
      <div className="ap-stat-n">
        <span className="tabular-nums">{Math.round(n)}</span>
      </div>
      <div className="ap-stat-l">{label}</div>
    </div>
  );
}

/** One application row in the dashboard's anchor cell. Uses `.ap-pill` for the state
 *  badge + carries the existing CTAs (take test / start interview / withdraw confirm). */
function DashboardApplicationRow({
  app,
  delay,
  onWithdraw,
  withdrawing,
}: {
  app: {
    applicationId: string;
    jobId: string;
    state: string;
    jobTitle?: string;
    companyName?: string;
  };
  delay: number;
  onWithdraw: (id: string) => void;
  withdrawing: boolean;
}) {
  const status = applicationStatus(app.state);
  const title = app.jobTitle ?? `Job ${app.jobId}`;
  const company = app.companyName ?? "Company";
  const initial = (app.companyName ?? title).charAt(0).toUpperCase();
  const pillClass =
    status.tone === "success"
      ? "ap-pill ap-pill--good"
      : status.tone === "warning"
        ? "ap-pill ap-pill--warn"
        : status.tone === "danger"
          ? "ap-pill ap-pill--danger"
          : status.tone === "info"
            ? "ap-pill ap-pill--teal"
            : "ap-pill";

  return (
    <div
      className="animate-rise-in flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 transition-colors hover:bg-surface-2 sm:flex-row sm:items-center sm:justify-between"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full border border-line bg-surface-2 font-display text-base font-semibold text-foreground">
          {initial}
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{title}</p>
          <p className="truncate text-sm text-ink-2">{company}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={pillClass}>{status.label}</span>
        {app.state === "aptitude_pending" && (
          <Link
            href={`/aptitude/${app.applicationId}`}
            className="ap-btn ap-btn-ghost ap-btn-sm"
          >
            Take test
          </Link>
        )}
        {app.state === "interview_pending" && (
          <Link
            href={`/interview/${app.applicationId}`}
            className="ap-btn ap-btn-primary ap-btn-sm"
          >
            Start interview
          </Link>
        )}
        {!TERMINAL_STATES.has(app.state) && (
          <ConfirmDialog
            trigger={
              <button type="button" className="ap-btn ap-btn-ghost ap-btn-sm">
                Withdraw
              </button>
            }
            title="Withdraw application?"
            description="This can't be undone — you'd need to re-apply."
            confirmLabel="Withdraw"
            destructive
            busy={withdrawing}
            onConfirm={() => onWithdraw(app.applicationId)}
          />
        )}
      </div>
    </div>
  );
}
