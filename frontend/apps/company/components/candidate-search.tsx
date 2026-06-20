"use client";

import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ErrorState,
  Skeleton,
  applicationStatus,
} from "@ip/ui";
import { errorMessage } from "@ip/shared";
import { useQuery } from "@tanstack/react-query";
import { Search, SearchX } from "lucide-react";
import { useState } from "react";

import { makeMockSourcingClient } from "../app/talent/sourcing-client";
import type { SearchCandidatesParams } from "../app/talent/sourcing-types";
import { FitBadge } from "./fit-badge";

const STAGES = [
  ["", "Any stage"],
  ["applied", "Applied"],
  ["interview_pending", "Interview"],
  ["shortlisted", "Shortlisted"],
  ["rejected", "Rejected"],
] as const;

// Render-bound: cap the result rows, reveal more on demand so a broad search never
// mounts every hit at once.
const PAGE = 30;

// Searches the company's OWN applicants only (the mock stands in until SourcingService
// lands). The query fires only when non-empty; the parent hides the full pool while active.
export function CandidateSearch({ onActive }: { onActive: (active: boolean) => void }) {
  // Swap to { search: (p) => api.sourcing.searchCandidates(p) } after pnpm gen.
  const client = makeMockSourcingClient();
  const [draft, setDraft] = useState("");
  const [params, setParams] = useState<SearchCandidatesParams>({ query: "" });
  const [shown, setShown] = useState(PAGE);
  const active = params.query.trim().length > 0;

  const results = useQuery({
    queryKey: ["candidate-search", params],
    queryFn: () => client.search(params),
    enabled: active,
  });

  function submit(next: Partial<SearchCandidatesParams>) {
    const merged = { ...params, ...next, query: (next.query ?? draft).trim() };
    setParams(merged);
    setShown(PAGE); // reset the render cap for each new search
    onActive(merged.query.length > 0);
  }

  const hits = results.data?.hits ?? [];

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4">
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            submit({ query: draft });
          }}
        >
          <div className="flex-1">
            <Field label="Search your applicants" htmlFor="q">
              <Input
                id="q"
                value={draft}
                placeholder="Keyword, skill, or role…"
                onChange={(e) => setDraft(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Stage">
            <Select value={params.stage ?? ""} onValueChange={(v) => submit({ stage: v })}>
              <SelectTrigger className="sm:w-40">
                <SelectValue placeholder="Any stage" />
              </SelectTrigger>
              <SelectContent>
                {STAGES.map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Button type="submit" leadingIcon={Search}>
            Search
          </Button>
        </form>

        {active && results.isLoading && (
          <div
            className="flex flex-col gap-2"
            aria-busy="true"
            aria-label="Searching candidates"
          >
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        )}
        {active && results.isError && (
          <ErrorState message={errorMessage(results.error)} retry={() => results.refetch()} />
        )}
        {active && !results.isLoading && !results.isError && hits.length === 0 && (
          <EmptyState
            icon={SearchX}
            title="No candidates match"
            description="Try a different keyword, or widen the stage filter to see more applicants."
          />
        )}
        {active && !results.isError && hits.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Candidate</th>
                  <th className="px-4 py-3">Fit</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Skills</th>
                  <th className="px-4 py-3">Apps</th>
                </tr>
              </thead>
              <tbody>
                {hits.slice(0, shown).map((h, i) => {
                  const stage = applicationStatus(h.topStage);
                  return (
                    <tr
                      key={h.candidateUserId}
                      className="animate-rise-in border-b border-border transition-colors last:border-b-0 hover:bg-surface-muted"
                      style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                    >
                      <td
                        className="px-4 py-3 font-mono text-xs text-muted-foreground"
                        aria-label={`Candidate ${h.candidateUserId}`}
                      >
                        {h.candidateUserId.slice(0, 12)}…
                      </td>
                      <td className="px-4 py-3">
                        <FitBadge score={h.fitScore} />
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={stage.tone}>{stage.label}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {h.matchedSkills.slice(0, 4).map((s) => (
                            <Badge key={s} tone="neutral">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-foreground">
                        {Number(h.applicationCount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {hits.length > shown && (
              <div className="border-t border-border p-3 text-center">
                <Button variant="outline" onClick={() => setShown((n) => n + PAGE)}>
                  Show more ({hits.length - shown})
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
