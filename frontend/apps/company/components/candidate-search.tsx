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
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  applicationStatus,
} from "@ip/ui";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
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

// Searches the company's OWN applicants only (the mock stands in until SourcingService
// lands). The query fires only when non-empty; the parent hides the full pool while active.
export function CandidateSearch({ onActive }: { onActive: (active: boolean) => void }) {
  // Swap to { search: (p) => api.sourcing.searchCandidates(p) } after pnpm gen.
  const client = makeMockSourcingClient();
  const [draft, setDraft] = useState("");
  const [params, setParams] = useState<SearchCandidatesParams>({ query: "" });
  const active = params.query.trim().length > 0;

  const results = useQuery({
    queryKey: ["candidate-search", params],
    queryFn: () => client.search(params),
    enabled: active,
  });

  function submit(next: Partial<SearchCandidatesParams>) {
    const merged = { ...params, ...next, query: (next.query ?? draft).trim() };
    setParams(merged);
    onActive(merged.query.length > 0);
  }

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

        {active && results.isLoading && <Skeleton className="h-24" />}
        {active && !results.isLoading && (results.data?.hits.length ?? 0) === 0 && (
          <EmptyState title="No candidates match" description="Try a different keyword or stage." />
        )}
        {active && (results.data?.hits.length ?? 0) > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Fit</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Skills</TableHead>
                <TableHead>Apps</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.data!.hits.map((h) => {
                const stage = applicationStatus(h.topStage);
                return (
                  <TableRow key={h.candidateUserId}>
                    <TableCell
                      className="font-mono text-xs"
                      aria-label={`Candidate ${h.candidateUserId}`}
                    >
                      {h.candidateUserId.slice(0, 12)}…
                    </TableCell>
                    <TableCell>
                      <FitBadge score={h.fitScore} />
                    </TableCell>
                    <TableCell>
                      <Badge tone={stage.tone}>{stage.label}</Badge>
                    </TableCell>
                    <TableCell className="flex flex-wrap gap-1">
                      {h.matchedSkills.slice(0, 4).map((s) => (
                        <Badge key={s} tone="neutral">
                          {s}
                        </Badge>
                      ))}
                    </TableCell>
                    <TableCell className="tabular-nums">{Number(h.applicationCount)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
