"use client";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  buttonVariants,
  cn,
  toast,
} from "@ip/ui";
import {
  TERMINAL_STATES,
  decodeJwtPayload,
  errorMessage,
  useAuthedQuery,
} from "@ip/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Briefcase,
  Dumbbell,
  Send,
  Sparkles,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { useAuth } from "../lib/auth";
import { ApplicationCard } from "./application-card";
import { AssistantChat } from "./assistant-chat";
import { CandidateShell } from "./candidate-shell";
import { CandidateChecklist } from "./onboarding/candidate-checklist";
import { RecommendedRoles } from "./recommended-roles";

export function Dashboard() {
  const { api, token, identity } = useAuth();
  const email = token
    ? ((decodeJwtPayload(token)?.email as string | undefined) ?? null)
    : null;
  const queryClient = useQueryClient();
  const [jobId, setJobId] = useState("");
  const [consent, setConsent] = useState(false);
  // Synchronous in-flight latch: survives a same-tick double-click / StrictMode
  // double-invoke that the `apply.isPending` flag (stale closure) cannot catch.
  const inFlight = useRef(false);

  const applications = useAuthedQuery(token, {
    queryKey: ["applications"],
    queryFn: () => api.applications.listMyApplications({}),
    // Notifications are email-only, so poll while anything is still in flight.
    refetchInterval: (query) => {
      const apps = query.state.data?.applications ?? [];
      return apps.some((a) => !TERMINAL_STATES.has(a.state)) ? 10_000 : false;
    },
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["applications"] });

  const apply = useMutation({
    mutationFn: () => api.applications.apply({ jobId, consent }),
    onSuccess: () => {
      setJobId("");
      setConsent(false);
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

  function onApply() {
    if (inFlight.current || !jobId || !consent) return;
    inFlight.current = true;
    apply.mutate();
  }

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

  // KPI + up-next are derived client-side from the already-fetched applications —
  // display-only, no extra fetch.
  const inFlightCount = list.filter((a) => !TERMINAL_STATES.has(a.state)).length;
  const interviewApps = list.filter(
    (a) => a.state === "interview_pending" || a.state === "interview_in_progress",
  );
  const respondedCount = list.filter((a) =>
    [
      "aptitude_pending",
      "interview_pending",
      "interview_in_progress",
      "interviewed",
      "scored",
      "shortlisted",
      "hired",
      "rejected",
      "gated_out",
    ].includes(a.state),
  ).length;
  const nextInterview = interviewApps[0];
  const firstName =
    (email ? email.split("@")[0] : identity?.id)?.split(/[.\s_]/)[0] ?? "there";
  const greetName = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  const kpis = [
    {
      label: "Applications in flight",
      value: inFlightCount,
      delta: `${list.length} total submitted`,
    },
    {
      label: "Interviews scheduled",
      value: interviewApps.length,
      delta: nextInterview ? "ready to join" : "none scheduled",
    },
    {
      label: "Responses received",
      value: respondedCount,
      delta: list.length ? "every company answers" : "—",
    },
    {
      label: "Total applications",
      value: list.length,
      delta: "across all stages",
    },
  ];

  return (
    <CandidateShell>
      <div className="flex flex-col gap-8">
        {/* Greeting */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
              Welcome back, {greetName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {inFlightCount} application{inFlightCount === 1 ? "" : "s"} in flight ·{" "}
              {interviewApps.length} interview
              {interviewApps.length === 1 ? "" : "s"} active · every company here answers.
            </p>
          </div>
          <Link
            href="/jobs"
            className={cn(buttonVariants(), "shrink-0")}
          >
            Find roles
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>

        <CandidateChecklist />

        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {kpis.map((k) => (
            <div
              key={k.label}
              className="rounded-xl border border-border bg-surface p-4"
            >
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {k.label}
              </p>
              <p className="mt-2 font-display text-3xl font-semibold tabular-nums text-foreground">
                {k.value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{k.delta}</p>
            </div>
          ))}
        </div>

        {/* Two-column body */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
          {/* LEFT: applications */}
          <section className="flex flex-col gap-4">
            <h2 className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight text-foreground">
              <Briefcase className="size-5 text-primary" aria-hidden />
              Your applications
            </h2>
            {applications.isLoading && <LoadingState />}
            {applications.isError && (
              <ErrorState
                message={errorMessage(applications.error)}
                retry={() => applications.refetch()}
              />
            )}
            {!applications.isLoading &&
              !applications.isError &&
              list.length === 0 && (
                <EmptyState
                  title="No applications yet"
                  description="Apply to a job below to get started."
                  icon={Briefcase}
                />
              )}
            {list.length > 0 && (
              <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
                {list.map((a) => (
                  <ApplicationCard
                    key={a.applicationId}
                    app={a}
                    withdrawing={withdraw.isPending}
                    onWithdraw={(id) => withdraw.mutate(id)}
                  />
                ))}
              </div>
            )}

            {/* Apply to a job */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="size-5 text-primary" aria-hidden />
                  Apply to a job
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Field
                  label="Job ID"
                  htmlFor="jobId"
                  hint="Paste the job ID from your invite link."
                >
                  <Input
                    id="jobId"
                    value={jobId}
                    disabled={apply.isPending}
                    onChange={(e) => setJobId(e.target.value)}
                  />
                </Field>
                <label className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    className="mt-0.5"
                    checked={consent}
                    disabled={apply.isPending}
                    onCheckedChange={(v) => setConsent(v === true)}
                  />
                  <span>I consent to AI-assisted screening of my application.</span>
                </label>
                <Button
                  onClick={onApply}
                  loading={apply.isPending}
                  disabled={!jobId || !consent}
                  leadingIcon={Send}
                  className="self-start"
                >
                  {apply.isPending ? "Applying…" : "Apply"}
                </Button>
              </CardContent>
            </Card>
          </section>

          {/* RIGHT: up-next + recommended + practice */}
          <div className="flex flex-col gap-4">
            {/* Up next */}
            {nextInterview && (
              <div className="rounded-xl border border-border bg-gradient-to-b from-primary/5 to-surface p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">
                    Up next
                  </h2>
                  <span className="rounded-full bg-success-surface px-2.5 py-0.5 text-xs font-medium text-success-foreground">
                    Proctored
                  </span>
                </div>
                <div className="my-4 flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <Video className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      Interview · Job {nextInterview.jobId}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {nextInterview.state === "interview_in_progress"
                        ? "In progress · resume now"
                        : "Ready when you are · proctored"}
                    </p>
                  </div>
                </div>
                <Link
                  href={`/interview/${nextInterview.applicationId}`}
                  className={cn(buttonVariants(), "w-full")}
                >
                  Join interview
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            )}

            {/* Recommended */}
            <section className="flex flex-col gap-3">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-foreground">
                <Sparkles className="size-5 text-primary" aria-hidden />
                Recommended for you
              </h2>
              <RecommendedRoles />
            </section>

            {/* Practice CTA */}
            <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-primary">
                <Dumbbell className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">Practice an interview</p>
                <p className="text-sm text-muted-foreground">
                  Private mock with feedback — never shared with employers.
                </p>
              </div>
              <Link
                href="/practice"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}
              >
                Start
              </Link>
            </div>
          </div>
        </div>

        <AssistantChat />
      </div>
    </CandidateShell>
  );
}
