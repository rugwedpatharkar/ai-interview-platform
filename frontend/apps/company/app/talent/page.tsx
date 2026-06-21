"use client";

import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
} from "@ip/ui";
import { Users } from "lucide-react";
import { errorMessage, useAuthedQuery } from "@ip/shared";
import { useState } from "react";

import { CandidateSearch } from "../../components/candidate-search";
import { CompanyShell } from "../../components/company-shell";
import { useAuth } from "../../lib/auth";

// Render-bound: cap the pool view at PAGE rows, reveal the rest on demand so a large
// talent pool never mounts every row at once.
const PAGE = 30;

export default function TalentPage() {
  const { api, token } = useAuth();
  const [searching, setSearching] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const pool = useAuthedQuery(token, {
    queryKey: ["talent"],
    queryFn: () => api.talent.getTalentPool({ pageSize: 200, pageToken: "" }),
  });
  const entries = pool.data?.entries ?? [];
  const visible = entries.slice(0, shown);

  return (
    <CompanyShell>
      <PageHeader
        title="Talent search"
        description="Search and browse candidates who have applied to your jobs."
      />
      <div className="flex flex-col gap-6">
        <CandidateSearch onActive={setSearching} />

        {/* The full pool is the default view; a live search replaces it with ranked hits. */}
        {!searching && (
          <>
            {pool.isLoading && (
              <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading talent pool">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-xl" />
                ))}
              </div>
            )}
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
                  {visible.map((e, i) => (
                    <div
                      key={e.candidateUserId}
                      className="flex animate-rise-in items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4"
                      style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                    >
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
                    </div>
                  ))}
                </div>

                <div className="hidden overflow-hidden rounded-xl border border-border bg-surface sm:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-3">Candidate</th>
                        <th className="px-4 py-3">Applications</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((e, i) => (
                        <tr
                          key={e.candidateUserId}
                          className="animate-rise-in border-b border-border transition-colors last:border-b-0 hover:bg-surface-muted"
                          style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                        >
                          <td
                            className="px-4 py-3 font-mono text-xs text-muted-foreground"
                            aria-label={`Candidate ${e.candidateUserId}`}
                          >
                            {e.candidateUserId.slice(0, 12)}…
                          </td>
                          <td className="px-4 py-3 tabular-nums text-foreground">
                            {Number(e.applicationCount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {entries.length > shown && (
                  <Button
                    variant="outline"
                    className="self-center"
                    onClick={() => setShown((n) => n + PAGE)}
                  >
                    Show more ({entries.length - shown})
                  </Button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </CompanyShell>
  );
}
