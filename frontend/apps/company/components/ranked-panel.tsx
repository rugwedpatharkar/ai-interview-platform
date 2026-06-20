"use client";

import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  LoadingState,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ip/ui";
import { errorMessage, isNotFound, isTransient, useAuthedQuery } from "@ip/shared";

import { useAuth } from "../lib/auth";

const POLL_MS = 3000;
// The matcher runs async after applicants are scored — a 404 means "not run yet". Poll
// through that (and transient blips) but cap it so an un-run matcher doesn't poll forever.
const MAX_POLLS = 60;

/**
 * Recruiter view of a job's AI-ranked applicants (match_results, comp-scoped + sorted by
 * score server-side). Read-only ranking with the match reasons; the Reports tab carries
 * the per-applicant report links.
 */
export function RankedPanel({ jobId }: { jobId: string }) {
  const { api, token } = useAuth();

  const ranked = useAuthedQuery(token, {
    queryKey: ["ranked", jobId],
    retry: false,
    queryFn: () => api.recommendations.getJobRankedCandidates({ jobId }),
    refetchInterval: (query) => {
      if (query.state.status === "success") return false;
      if (query.state.dataUpdateCount + query.state.errorUpdateCount >= MAX_POLLS)
        return false;
      const err = query.state.error;
      return isNotFound(err) || isTransient(err) ? POLL_MS : false;
    },
  });

  const notReady = ranked.isError && isNotFound(ranked.error);

  // Genuine first load → skeleton rows; "matcher not run yet" keeps the explanatory
  // auto-updating label so the recruiter knows ranking is still in flight.
  if (ranked.isLoading)
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  if (notReady)
    return <LoadingState label="Ranking candidates — this updates automatically…" />;
  if (ranked.isError)
    return (
      <ErrorState message={errorMessage(ranked.error)} retry={() => ranked.refetch()} />
    );

  const matches = ranked.data?.matches ?? [];
  if (matches.length === 0)
    return (
      <EmptyState
        title="No ranked candidates yet"
        description="Applicants appear here once the AI matcher scores them for this job. Refresh to check for new rankings."
        action={
          <Button variant="outline" size="sm" onClick={() => ranked.refetch()}>
            Refresh
          </Button>
        }
      />
    );

  const reasons = (list: string[]) =>
    list.length > 0 ? (
      <ul className="flex list-disc flex-col gap-1 pl-4">
        {list.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    ) : (
      <span className="text-muted-foreground">—</span>
    );

  return (
    <>
      {/* Stacked cards on narrow viewports — the reasons column makes the table too wide. */}
      <div className="flex flex-col gap-3 sm:hidden">
        {matches.map((m) => (
          <Card key={m.candidateUserId}>
            <CardContent className="flex flex-col gap-2 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <Avatar
                    name={m.candidateUserId.slice(0, 8).toUpperCase()}
                    size="sm"
                  />
                  <span
                    className="truncate font-mono text-xs text-muted-foreground"
                    aria-label={`Candidate ${m.candidateUserId}`}
                  >
                    {m.candidateUserId.slice(0, 8).toUpperCase()}
                  </span>
                </span>
                <Badge tone="info" className="tabular-nums">
                  {Math.round(m.score * 100)}%
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">{reasons(m.reasons)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Candidate</TableHead>
              <TableHead>Match</TableHead>
              <TableHead>Why</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matches.map((m) => (
              <TableRow key={m.candidateUserId}>
                <TableCell className="align-top">
                  <span className="flex items-center gap-2">
                    <Avatar
                      name={m.candidateUserId.slice(0, 8).toUpperCase()}
                      size="sm"
                    />
                    <span
                      className="font-mono text-xs"
                      aria-label={`Candidate ${m.candidateUserId}`}
                    >
                      {m.candidateUserId.slice(0, 8).toUpperCase()}
                    </span>
                  </span>
                </TableCell>
                <TableCell className="align-top">
                  <Badge tone="info" className="tabular-nums">
                    {Math.round(m.score * 100)}%
                  </Badge>
                </TableCell>
                {/* Cap the reasons column so long rationale wraps instead of stretching the row. */}
                <TableCell className="max-w-md align-top text-sm text-muted-foreground">
                  {reasons(m.reasons)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
