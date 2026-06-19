"use client";

import {
  Badge,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ip/ui";
import { Users } from "lucide-react";
import { errorMessage, useAuthedQuery } from "@ip/shared";

import { CompanyShell } from "../../components/company-shell";
import { useAuth } from "../../lib/auth";

export default function TalentPage() {
  const { api, token } = useAuth();
  const pool = useAuthedQuery(token, {
    queryKey: ["talent"],
    queryFn: () => api.talent.getTalentPool({}),
  });
  const entries = pool.data?.entries ?? [];

  return (
    <CompanyShell>
      <PageHeader
        title="Talent pool"
        description="Candidates who have applied to your company's jobs."
      />
      {pool.isLoading && <LoadingState />}
      {pool.isError && (
        <ErrorState message={errorMessage(pool.error)} retry={() => pool.refetch()} />
      )}
      {!pool.isLoading && !pool.isError && entries.length === 0 && (
        <EmptyState
          icon={Users}
          title="No candidates yet"
          description="Candidates appear here once they apply to your jobs."
        />
      )}
      {entries.length > 0 && (
        <>
          {/* Stacked cards on narrow viewports keep the id + count readable at ~375px. */}
          <div className="flex flex-col gap-3 sm:hidden">
            {entries.map((e) => (
              <Card key={e.candidateUserId}>
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <span
                    className="truncate font-mono text-xs text-muted-foreground"
                    aria-label={`Candidate ${e.candidateUserId}`}
                  >
                    {e.candidateUserId.slice(0, 12)}…
                  </span>
                  <Badge tone="neutral">
                    {Number(e.applicationCount)} application
                    {Number(e.applicationCount) === 1 ? "" : "s"}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="hidden sm:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Applications</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e) => (
                    <TableRow key={e.candidateUserId}>
                      <TableCell
                        className="font-mono text-xs"
                        aria-label={`Candidate ${e.candidateUserId}`}
                      >
                        {e.candidateUserId.slice(0, 12)}…
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {Number(e.applicationCount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </CompanyShell>
  );
}
