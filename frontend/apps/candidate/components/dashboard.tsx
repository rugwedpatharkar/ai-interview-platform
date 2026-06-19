"use client";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  applicationStatus,
  toast,
} from "@ip/ui";
import { errorMessage } from "@ip/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase, FileText, Send, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { useAuth } from "../lib/auth";
import { AssistantChat } from "./assistant-chat";
import { CandidateShell } from "./candidate-shell";
import { RecommendedRoles } from "./recommended-roles";

const TERMINAL = new Set([
  "withdrawn",
  "hired",
  "rejected",
  "expired",
  "abandoned",
]);

export function Dashboard() {
  const { api } = useAuth();
  const queryClient = useQueryClient();
  const [jobId, setJobId] = useState("");
  const [consent, setConsent] = useState(false);
  // Synchronous in-flight latch: survives a same-tick double-click / StrictMode
  // double-invoke that the `apply.isPending` flag (stale closure) cannot catch.
  const inFlight = useRef(false);

  const applications = useQuery({
    queryKey: ["applications"],
    queryFn: () => api.applications.listMyApplications({}),
    // Notifications are email-only, so poll while anything is still in flight.
    refetchInterval: (query) => {
      const apps = query.state.data?.applications ?? [];
      return apps.some((a) => !TERMINAL.has(a.state)) ? 10_000 : false;
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

  return (
    <CandidateShell>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Your dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Apply to roles, track your applications, and chat with the assistant.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="size-5 text-brand-500" aria-hidden />
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

        <section className="flex flex-col gap-4">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-foreground">
            <Sparkles className="size-5 text-brand-500" aria-hidden />
            Recommended for you
          </h2>
          <RecommendedRoles />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-foreground">
            <Briefcase className="size-5 text-brand-500" aria-hidden />
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
                description="Apply to a job above to get started."
                icon={Briefcase}
              />
            )}
          {list.map((a) => {
            const status = applicationStatus(a.state);
            return (
              <Card key={a.applicationId} hoverable>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                      <FileText className="size-4" aria-hidden />
                    </span>
                    <div className="flex flex-col gap-1">
                      <p className="font-medium text-foreground">Job {a.jobId}</p>
                      <Badge tone={status.tone} className="w-fit">
                        {status.label}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {a.state === "aptitude_pending" && (
                      <Link href={`/aptitude/${a.applicationId}`}>
                        <Button variant="secondary" size="sm">
                          Take test
                        </Button>
                      </Link>
                    )}
                    {a.state === "interview_pending" && (
                      <Link href={`/interview/${a.applicationId}`}>
                        <Button size="sm">Start interview</Button>
                      </Link>
                    )}
                    {!TERMINAL.has(a.state) && (
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="sm">
                            Withdraw
                          </Button>
                        }
                        title="Withdraw application?"
                        description="This can't be undone — you'd need to re-apply."
                        confirmLabel="Withdraw"
                        destructive
                        busy={withdraw.isPending}
                        onConfirm={() => withdraw.mutate(a.applicationId)}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>

        <AssistantChat />
      </div>
    </CandidateShell>
  );
}
