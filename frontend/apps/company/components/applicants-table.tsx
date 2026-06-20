"use client";

import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Skeleton,
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
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "../lib/auth";
import { selectableIds, toggle, toggleAll } from "../lib/selection";
import { BatchDecisionBar } from "./batch-decision-bar";
import { DecisionControl } from "./decision-control";
import { KpiCard } from "./kpi-card";
import { StatusPill } from "./status-pill";

// Funnel-stage filter chips — pure presentational grouping over the existing state field
// (no new query). "all" passes everything through.
const STAGES = {
  all: () => true,
  interviewed: (s: string) =>
    ["interviewed", "scored", "shortlisted", "assessment_review"].includes(s),
  passed: (s: string) => ["shortlisted", "hired"].includes(s),
  shortlisted: (s: string) => s === "shortlisted",
} satisfies Record<string, (state: string) => boolean>;

type Stage = keyof typeof STAGES;

const STAGE_LABELS: Record<Stage, string> = {
  all: "All",
  interviewed: "Interviewed",
  passed: "Passed gate",
  shortlisted: "Shortlisted",
};

// States where a recruiter can open the report + record/adjust a decision. Shortlisted
// is included so a shortlisted candidate can still be moved to hired/rejected.
const ACTIONABLE = new Set(["scored", "shortlisted"]);
// Advisory-gate hold: the AI graded, the recruiter decides. Kept out of every terminal
// set so the row keeps polling until it transitions out of the queue.
const REVIEW = new Set(["assessment_review"]);

// Render-bound: cap how many rows mount at once. The cap is purely presentational —
// selection, select-all, and stage counts all still reason over the full list.
const RENDER_PAGE = 30;

const POLL_MS = 10_000;
// Cap background polling so a candidate stuck mid-funnel (e.g. an interview that never
// completes) can't poll forever. ~20 min of 10s ticks, then the recruiter refreshes.
const MAX_POLLS = 120;

// A short, stable handle for an opaque candidate id (no PII in the list payload).
const candidateHandle = (id: string) => id.slice(0, 8).toUpperCase();

export function ApplicantsTable({ jobId }: { jobId: string }) {
  const { api, token } = useAuth();
  const queryClient = useQueryClient();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [stage, setStage] = useState<Stage>("all");
  const [shown, setShown] = useState(RENDER_PAGE);

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

  const list = useMemo(
    () => applicants.data?.applications ?? [],
    [applicants.data],
  );

  // Prune ids that left the decidable set after a refetch, so a stale selection can't
  // target a row that already transitioned out of a decidable state.
  useEffect(() => {
    const ok = new Set(selectableIds(list));
    setSel((prev) => {
      const next = new Set([...prev].filter((id) => ok.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [list]);

  // Memoize the funnel derivations so they recompute only when the fetched list / active
  // stage actually change, not on every selection toggle.
  const selectable = useMemo(() => selectableIds(list), [list]);
  const visible = useMemo(
    // Stage filter is presentation-only: it narrows the rendered rows but never the
    // selection set (select-all + pruning still reason over the full list).
    () => list.filter((a) => STAGES[stage](a.state)),
    [list, stage],
  );
  const counts = useMemo(
    () =>
      (Object.keys(STAGES) as Stage[]).reduce(
        (acc, key) => {
          acc[key] = list.filter((a) => STAGES[key](a.state)).length;
          return acc;
        },
        {} as Record<Stage, number>,
      ),
    [list],
  );

  // Stable per-row toggle so memoized rows don't re-render on unrelated selection changes.
  const onToggle = useCallback(
    (id: string) => setSel((prev) => toggle(prev, id)),
    [],
  );

  if (applicants.isLoading) return <ApplicantsSkeleton />;
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
        description="Applications appear here as candidates apply. Refresh to check for new applicants."
        action={
          <Button variant="outline" size="sm" onClick={() => applicants.refetch()}>
            Refresh
          </Button>
        }
      />
    );

  const allSelected = selectable.length > 0 && selectable.every((id) => sel.has(id));

  // Capped render view — the cap bounds the DOM only; selection/counts use the full list.
  const shownRows = visible.slice(0, shown);

  const stageCount = (key: Stage) => counts[key];
  const kpis = [
    { label: "Applicants", value: String(list.length) },
    { label: "Interviewed", value: String(stageCount("interviewed")) },
    { label: "Passed gate", value: String(stageCount("passed")) },
    { label: "Shortlisted", value: String(stageCount("shortlisted")) },
  ];

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

  const candidateCell = (a: ApplicationResponse) => (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={candidateHandle(a.candidateUserId)} size="sm" />
      <div className="min-w-0">
        <div
          className="truncate font-mono text-xs font-medium text-foreground"
          aria-label={`Candidate ${a.candidateUserId}`}
        >
          {candidateHandle(a.candidateUserId)}
        </div>
        <div className="truncate text-xs text-muted-foreground">Applicant</div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* KPI strip — render-only funnel counts derived from the fetched list. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((k) => (
          <KpiCard key={k.label} label={k.label} value={k.value} />
        ))}
      </div>

      {/* Funnel-stage filter chips. */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(STAGES) as Stage[]).map((key) => {
          const active = stage === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setStage(key);
                setShown(RENDER_PAGE); // re-apply the render cap for the new stage
              }}
              className={
                active
                  ? "rounded-full border border-primary bg-primary/10 px-3 py-1 text-sm font-medium text-foreground"
                  : "rounded-full border border-border bg-surface px-3 py-1 text-sm text-muted-foreground transition-colors hover:bg-surface-muted"
              }
            >
              {STAGE_LABELS[key]} · {stageCount(key)}
            </button>
          );
        })}
      </div>

      {sel.size > 0 && (
        <BatchDecisionBar
          jobId={jobId}
          selected={[...sel]}
          onDone={() => setSel(new Set())}
        />
      )}

      {visible.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No candidates in this stage.
        </p>
      )}

      {/* Stacked cards on narrow viewports — the table overflows at ~375px. */}
      <div className="flex flex-col gap-3 sm:hidden">
        {shownRows.map((a, i) => {
          const canSelect = selectable.includes(a.applicationId);
          return (
            <Card
              key={a.applicationId}
              className="animate-rise-in"
              style={i < 6 ? { animationDelay: `${i * 40}ms` } : undefined}
            >
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    {canSelect && (
                      <Checkbox
                        checked={sel.has(a.applicationId)}
                        onCheckedChange={() => onToggle(a.applicationId)}
                        aria-label={`Select candidate ${a.candidateUserId}`}
                      />
                    )}
                    {candidateCell(a)}
                  </div>
                  <StatusPill state={a.state} dot={false} />
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
              <TableHead>Stage</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shownRows.map((a, i) => {
              const canSelect = selectable.includes(a.applicationId);
              return (
                <TableRow
                  key={a.applicationId}
                  data-state={sel.has(a.applicationId) ? "selected" : undefined}
                  className="animate-rise-in"
                  style={i < 6 ? { animationDelay: `${i * 40}ms` } : undefined}
                >
                  <TableCell>
                    {canSelect && (
                      <Checkbox
                        checked={sel.has(a.applicationId)}
                        onCheckedChange={() => onToggle(a.applicationId)}
                        aria-label={`Select candidate ${a.candidateUserId}`}
                      />
                    )}
                  </TableCell>
                  <TableCell scope="row">{candidateCell(a)}</TableCell>
                  <TableCell>
                    <StatusPill state={a.state} dot />
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

      {visible.length > shown && (
        <Button
          variant="outline"
          className="self-center"
          onClick={() => setShown((n) => n + RENDER_PAGE)}
        >
          Show more ({visible.length - shown})
        </Button>
      )}
    </div>
  );
}

// Load state: mirror the KPI strip + table shape with shimmer blocks rather than a spinner,
// so the layout doesn't jump when the data lands.
function ApplicantsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-24 rounded-full" />
        ))}
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
