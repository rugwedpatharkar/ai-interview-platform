"use client";

import {
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  applicationStatus,
  buttonVariants,
  toast,
} from "@ip/ui";
import { errorMessage } from "@ip/shared";
import type { ApplicationResponse } from "@ip/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";

import { useAuth } from "../lib/auth";
import { DecisionControl } from "./decision-control";

const TERMINAL = new Set([
  "withdrawn",
  "hired",
  "rejected",
  "expired",
  "abandoned",
]);

// States where a recruiter can open the report + record/adjust a decision. Shortlisted
// is included so a shortlisted candidate can still be moved to hired/rejected.
const ACTIONABLE = new Set(["scored", "shortlisted"]);

const POLL_MS = 10_000;
// Cap background polling so a candidate stuck mid-funnel (e.g. an interview that never
// completes) can't poll forever. ~20 min of 10s ticks, then the recruiter refreshes.
const MAX_POLLS = 120;

export function ApplicantsTable({ jobId }: { jobId: string }) {
  const { api } = useAuth();
  const queryClient = useQueryClient();

  const applicants = useQuery({
    queryKey: ["applicants", jobId],
    queryFn: () => api.applications.listApplicants({ jobId }),
    refetchInterval: (query) => {
      const apps = query.state.data?.applications ?? [];
      const pending = apps.some((a) => !TERMINAL.has(a.state));
      return pending && query.state.dataUpdateCount < MAX_POLLS ? POLL_MS : false;
    },
  });

  const override = useMutation({
    mutationFn: (applicationId: string) =>
      api.decisions.overrideGate({ applicationId }),
    onSuccess: () => {
      toast.success("Gate overridden");
      queryClient.invalidateQueries({ queryKey: ["applicants", jobId] });
      // An override moves the candidate out of gated_out — the funnel dashboard shifts.
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const list = applicants.data?.applications ?? [];

  if (applicants.isLoading) return <LoadingState />;
  if (applicants.isError)
    return (
      <ErrorState
        message={errorMessage(applicants.error)}
        retry={() => applicants.refetch()}
      />
    );
  if (list.length === 0)
    return (
      <EmptyState
        title="No applicants yet"
        description="Applications appear here as candidates apply."
      />
    );

  // Shared action cluster so the table and the stacked-card layouts stay in lockstep.
  const actions = (a: ApplicationResponse) => {
    if (a.state === "gated_out")
      return (
        <ConfirmDialog
          trigger={
            <Button variant="outline" size="sm">
              Override gate
            </Button>
          }
          title="Override the aptitude gate?"
          description="This lets the candidate proceed to interview despite not passing."
          confirmLabel="Override"
          busy={override.isPending}
          onConfirm={() => override.mutate(a.applicationId)}
        />
      );
    if (ACTIONABLE.has(a.state))
      return (
        <>
          <Link
            href={`/jobs/${jobId}/applicants/${a.applicationId}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            View report
          </Link>
          <DecisionControl applicationId={a.applicationId} jobId={jobId} />
        </>
      );
    return <span className="text-sm text-muted-foreground">—</span>;
  };

  return (
    <>
      {/* Stacked cards on narrow viewports — the 3-column table overflows at ~375px. */}
      <div className="flex flex-col gap-3 sm:hidden">
        {list.map((a) => {
          const status = applicationStatus(a.state);
          return (
            <Card key={a.applicationId}>
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <span
                    className="truncate font-mono text-xs text-muted-foreground"
                    aria-label={`Candidate ${a.candidateUserId}`}
                  >
                    {a.candidateUserId.slice(0, 10)}…
                  </span>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2">{actions(a)}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Candidate</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((a) => {
              const status = applicationStatus(a.state);
              return (
                <TableRow key={a.applicationId}>
                  <TableCell
                    className="font-mono text-xs"
                    aria-label={`Candidate ${a.candidateUserId}`}
                  >
                    {a.candidateUserId.slice(0, 10)}…
                  </TableCell>
                  <TableCell>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </TableCell>
                  <TableCell>
                    {/* Fixed min-height keeps rows level whether the cell holds a button
                        cluster or a single dash. */}
                    <div className="flex min-h-9 items-center justify-end gap-3">
                      {actions(a)}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
