"use client";

import {
  Badge,
  Button,
  Card,
  CardContent,
  Checkbox,
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
  buttonVariants,
  toast,
} from "@ip/ui";
import { TERMINAL_STATES, errorMessage, useAuthedQuery } from "@ip/shared";
import type { ApplicationResponse } from "@ip/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuth } from "../lib/auth";
import { selectableIds, toggle, toggleAll } from "../lib/selection";
import { BatchDecisionBar } from "./batch-decision-bar";
import { DecisionControl } from "./decision-control";
import { StatusPill } from "./status-pill";

// States where a recruiter can open the report + record/adjust a decision. Shortlisted
// is included so a shortlisted candidate can still be moved to hired/rejected.
const ACTIONABLE = new Set(["scored", "shortlisted"]);
// Advisory-gate hold: the AI graded, the recruiter decides. Kept out of every terminal
// set so the row keeps polling until it transitions out of the queue.
const REVIEW = new Set(["assessment_review"]);

const POLL_MS = 10_000;
// Cap background polling so a candidate stuck mid-funnel (e.g. an interview that never
// completes) can't poll forever. ~20 min of 10s ticks, then the recruiter refreshes.
const MAX_POLLS = 120;

export function ApplicantsTable({ jobId }: { jobId: string }) {
  const { api, token } = useAuth();
  const queryClient = useQueryClient();
  const [sel, setSel] = useState<Set<string>>(new Set());

  const applicants = useAuthedQuery(token, {
    queryKey: ["applicants", jobId],
    queryFn: () => api.applications.listApplicants({ jobId }),
    refetchInterval: (query) => {
      const apps = query.state.data?.applications ?? [];
      const pending = apps.some((a) => !TERMINAL_STATES.has(a.state));
      return pending && query.state.dataUpdateCount < MAX_POLLS ? POLL_MS : false;
    },
  });

  const override = useMutation({
    mutationFn: (applicationId: string) =>
      api.decisions.overrideGate({ applicationId }),
    onSuccess: () => {
      toast.success("Gate overridden");
      queryClient.invalidateQueries({ queryKey: ["applicants", jobId] });
      // An override moves the candidate out of gated_out / advisory review into interview —
      // the ranked tab and the funnel dashboard both shift.
      queryClient.invalidateQueries({ queryKey: ["ranked", jobId] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const list = applicants.data?.applications ?? [];

  // Prune ids that left the decidable set after a refetch, so a stale selection can't
  // target a row that already transitioned out of a decidable state.
  useEffect(() => {
    const ok = new Set(selectableIds(list));
    setSel((prev) => {
      const next = new Set([...prev].filter((id) => ok.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [list]);

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

  const selectable = selectableIds(list);
  const allSelected = selectable.length > 0 && selectable.every((id) => sel.has(id));

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
    if (REVIEW.has(a.state))
      return (
        <div className="flex flex-col items-end gap-1.5">
          <Badge tone="warning">AI recommended — you decide</Badge>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/jobs/${jobId}/applicants/${a.applicationId}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              View report
            </Link>
            <ConfirmDialog
              trigger={
                <Button variant="outline" size="sm">
                  Advance
                </Button>
              }
              title="Advance this candidate?"
              description="The AI recommended a decision — advancing sends them to interview."
              confirmLabel="Advance"
              busy={override.isPending}
              onConfirm={() => override.mutate(a.applicationId)}
            />
            <DecisionControl applicationId={a.applicationId} jobId={jobId} />
          </div>
        </div>
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
    <div className="flex flex-col gap-3">
      {sel.size > 0 && (
        <BatchDecisionBar
          jobId={jobId}
          selected={[...sel]}
          onDone={() => setSel(new Set())}
        />
      )}

      {/* Stacked cards on narrow viewports — the table overflows at ~375px. */}
      <div className="flex flex-col gap-3 sm:hidden">
        {list.map((a) => {
          const canSelect = selectable.includes(a.applicationId);
          return (
            <Card key={a.applicationId}>
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    {canSelect && (
                      <Checkbox
                        checked={sel.has(a.applicationId)}
                        onCheckedChange={() =>
                          setSel((prev) => toggle(prev, a.applicationId))
                        }
                        aria-label={`Select candidate ${a.candidateUserId}`}
                      />
                    )}
                    <span
                      className="truncate font-mono text-xs text-muted-foreground"
                      aria-label={`Candidate ${a.candidateUserId}`}
                    >
                      {a.candidateUserId.slice(0, 10)}…
                    </span>
                  </div>
                  <StatusPill state={a.state} />
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
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  disabled={selectable.length === 0}
                  onCheckedChange={() => setSel((prev) => toggleAll(prev, list))}
                  aria-label="Select all decidable candidates"
                />
              </TableHead>
              <TableHead>Candidate</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((a) => {
              const canSelect = selectable.includes(a.applicationId);
              return (
                <TableRow key={a.applicationId}>
                  <TableCell>
                    {canSelect && (
                      <Checkbox
                        checked={sel.has(a.applicationId)}
                        onCheckedChange={() =>
                          setSel((prev) => toggle(prev, a.applicationId))
                        }
                        aria-label={`Select candidate ${a.candidateUserId}`}
                      />
                    )}
                  </TableCell>
                  <TableCell
                    scope="row"
                    className="font-mono text-xs"
                    aria-label={`Candidate ${a.candidateUserId}`}
                  >
                    {a.candidateUserId.slice(0, 10)}…
                  </TableCell>
                  <TableCell>
                    <StatusPill state={a.state} />
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
    </div>
  );
}
