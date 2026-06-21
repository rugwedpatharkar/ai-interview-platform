"use client";

import {
  Badge,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  applicationPillStatus,
} from "@ip/ui";
import { errorMessage, useAuthedQuery, useRequireRole } from "@ip/shared";
import { useQuery } from "@tanstack/react-query";
import { Search, SearchX, Users } from "lucide-react";
import { useState } from "react";

import { CompanyShell } from "../../../components/company-shell";
import { useAuth } from "../../../lib/auth";
import { useSourcingClient } from "./sourcing-client";
import type { CandidateHitDTO, SearchCandidatesParams } from "./sourcing-types";

// Render-bound: cap result rows; reveal more on demand so a broad search never mounts the world.
const PAGE = 30;

const STAGES = [
  ["", "Any stage"],
  ["applied", "Applied"],
  ["interview_pending", "Interview"],
  ["shortlisted", "Shortlisted"],
  ["rejected", "Rejected"],
] as const;

// Talent search & sourcing. Filter rail (left) drives a query against the company's OWN
// applicants only (no global candidate index). Empty-query default shows the full pool;
// non-empty query replaces it with ranked hits. Clicking a row opens a privacy-respecting
// detail drawer (still masked handle — no name/email reveal in this view).
export default function TalentPage() {
  const { api, token, identity, ready } = useAuth();
  useRequireRole(identity?.role, ["recruiter", "company_admin"], ready);

  const sourcingClient = useSourcingClient();

  const [draft, setDraft] = useState("");
  const [params, setParams] = useState<SearchCandidatesParams>({ query: "" });
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<CandidateHitDTO | null>(null);

  const active = params.query.trim().length > 0;

  const pool = useAuthedQuery(token, {
    queryKey: ["talent"],
    queryFn: () => api.talent.getTalentPool({ pageSize: 200, pageToken: "" }),
    enabled: !active,
  });

  const results = useQuery({
    queryKey: ["candidate-search", params],
    queryFn: () => sourcingClient.search(params),
    enabled: active,
  });

  function submit(next: Partial<SearchCandidatesParams>) {
    const merged = { ...params, ...next, query: (next.query ?? draft).trim() };
    setParams(merged);
    setShown(PAGE);
  }

  function reset() {
    setDraft("");
    setParams({ query: "" });
    setShown(PAGE);
  }

  return (
    <CompanyShell>
      <header className="mb-8 flex flex-col gap-3">
        <p className="ap-eyebrow">Sourcing</p>
        <h1 className="ap-h2">Find the candidate, not the keyword.</h1>
        <p className="ap-lead text-base">
          Search and browse the people who&apos;ve applied to your jobs. Handles are masked
          everywhere — names and emails surface only inside an active interview pipeline.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Filter rail */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="ap-cell">
            <span className="ap-cell-tag">FILTERS</span>
            <h2 className="ap-h4">Refine</h2>
            <form
              className="mt-4 flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                submit({ query: draft });
              }}
            >
              <Field label="Keyword" htmlFor="q">
                <Input
                  id="q"
                  value={draft}
                  placeholder="skill, role, or stack…"
                  onChange={(e) => setDraft(e.target.value)}
                />
              </Field>
              <Field label="Stage" htmlFor="stage">
                <Select
                  value={params.stage ?? ""}
                  onValueChange={(v) => submit({ stage: v })}
                >
                  <SelectTrigger id="stage">
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
              <div className="flex gap-2">
                <button type="submit" className="ap-btn ap-btn-primary ap-btn-sm flex-1">
                  <Search className="size-4" aria-hidden /> Search
                </button>
                {(active || params.stage) && (
                  <button
                    type="button"
                    className="ap-btn ap-btn-ghost ap-btn-sm"
                    onClick={reset}
                  >
                    Clear
                  </button>
                )}
              </div>
            </form>

            <div className="mt-5 border-t border-line pt-4">
              <p className="text-xs font-mono uppercase tracking-wide text-ink-3">
                Privacy
              </p>
              <p className="mt-2 text-xs text-ink-2">
                You see masked handles only. Names and emails appear inside a pipeline once
                a candidate progresses past application.
              </p>
            </div>
          </div>
        </aside>

        {/* Results grid */}
        <section>
          {active ? (
            <ResultsList
              isLoading={results.isLoading}
              isError={results.isError}
              error={results.error}
              hits={results.data?.hits ?? []}
              shown={shown}
              onShowMore={() => setShown((n) => n + PAGE)}
              onPick={(h) => setOpen(h)}
              retry={() => results.refetch()}
            />
          ) : (
            <PoolList
              isLoading={pool.isLoading}
              isError={pool.isError}
              error={pool.error}
              entries={(pool.data?.entries ?? []).map((e) => ({
                candidateUserId: e.candidateUserId,
                applicationCount: Number(e.applicationCount),
              }))}
              shown={shown}
              onShowMore={() => setShown((n) => n + PAGE)}
              retry={() => pool.refetch()}
            />
          )}
        </section>
      </div>

      {/* Detail drawer */}
      {open && <CandidateDrawer hit={open} onClose={() => setOpen(null)} />}
    </CompanyShell>
  );
}

function ResultsList({
  isLoading,
  isError,
  error,
  hits,
  shown,
  onShowMore,
  onPick,
  retry,
}: {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  hits: CandidateHitDTO[];
  shown: number;
  onShowMore: () => void;
  onPick: (h: CandidateHitDTO) => void;
  retry: () => void;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Searching">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-[22px]" />
        ))}
      </div>
    );
  }
  if (isError) {
    return <ErrorState message={errorMessage(error)} retry={retry} />;
  }
  if (hits.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title="No candidates match"
        description="Try a different keyword, or widen the stage filter."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {hits.slice(0, shown).map((h, i) => (
        <button
          key={h.candidateUserId}
          type="button"
          className="ap-cell animate-rise-in text-left transition-transform hover:-translate-y-0.5"
          style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
          onClick={() => onPick(h)}
          aria-label={`Open candidate ${h.candidateUserId.slice(0, 12)}`}
        >
          <CandidateRow hit={h} />
        </button>
      ))}
      {hits.length > shown && (
        <button
          type="button"
          className="ap-btn ap-btn-ghost ap-btn-sm self-center"
          onClick={onShowMore}
        >
          Show more ({hits.length - shown})
        </button>
      )}
    </div>
  );
}

function CandidateRow({ hit }: { hit: CandidateHitDTO }) {
  const stage = applicationPillStatus(hit.topStage);
  const score = Math.round(hit.fitScore * 100);
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        <div className="ap-ring shrink-0" style={{ ["--pct" as string]: String(score) }}>
          <span className="ap-ring-v">{score}</span>
        </div>
        <div className="min-w-0">
          <p
            className="truncate font-medium text-foreground"
            aria-label={`Candidate ${hit.candidateUserId}`}
          >
            <span className="font-mono text-sm text-ink-2">
              {hit.candidateUserId.slice(0, 12)}…
            </span>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={`ap-pill ap-pill--${tone(stage.tone)}`}>{stage.label}</span>
            <span className="text-xs text-ink-3">
              {hit.applicationCount}{" "}
              {hit.applicationCount === 1 ? "application" : "applications"}
            </span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 sm:max-w-[40%] sm:justify-end">
        {hit.matchedSkills.slice(0, 4).map((s) => (
          <Badge key={s} tone="neutral">
            {s}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function PoolList({
  isLoading,
  isError,
  error,
  entries,
  shown,
  onShowMore,
  retry,
}: {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  entries: { candidateUserId: string; applicationCount: number }[];
  shown: number;
  onShowMore: () => void;
  retry: () => void;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading talent pool">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-[22px]" />
        ))}
      </div>
    );
  }
  if (isError) {
    return <ErrorState message={errorMessage(error)} retry={retry} />;
  }
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No candidates yet"
        description="Candidates appear here once they apply to your jobs."
      />
    );
  }

  const visible = entries.slice(0, shown);
  return (
    <div className="flex flex-col gap-3">
      <div className="ap-cell !p-0 overflow-hidden">
        <div className="table-wrap">
          <table className="data w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left text-xs font-medium uppercase tracking-wide text-ink-3">
                <th className="px-4 py-3">Candidate</th>
                <th className="px-4 py-3">Applications</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((e, i) => (
                <tr
                  key={e.candidateUserId}
                  className="animate-rise-in border-b border-line transition-colors last:border-b-0 hover:bg-surface-2"
                  style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                >
                  <td
                    className="px-4 py-3 font-mono text-xs text-ink-2"
                    aria-label={`Candidate ${e.candidateUserId}`}
                  >
                    {e.candidateUserId.slice(0, 12)}…
                  </td>
                  <td className="px-4 py-3 tabular-nums text-foreground">
                    {e.applicationCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {entries.length > shown && (
        <button
          type="button"
          className="ap-btn ap-btn-ghost ap-btn-sm self-center"
          onClick={onShowMore}
        >
          Show more ({entries.length - shown})
        </button>
      )}
    </div>
  );
}

// Right-anchored slide-in detail. Uses the shared Dialog primitive with a position override
// — same a11y behavior (focus trap, esc to close, overlay click) as any modal in the app.
function CandidateDrawer({
  hit,
  onClose,
}: {
  hit: CandidateHitDTO;
  onClose: () => void;
}) {
  const stage = applicationPillStatus(hit.topStage);
  const score = Math.round(hit.fitScore * 100);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="left-auto right-0 top-0 h-full w-full max-w-md translate-x-0 translate-y-0 rounded-none rounded-l-2xl border-l border-line p-7 data-[state=open]:animate-slide-up data-[state=closed]:animate-fade-out"
      >
        <DialogTitle className="font-mono text-base">
          {hit.candidateUserId.slice(0, 12)}…
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-ink-2">
          A masked handle — names and emails appear only inside a live pipeline.
        </DialogDescription>

        <div className="mt-6 flex items-center gap-4">
          <div className="ap-ring" style={{ ["--pct" as string]: String(score) }}>
            <span className="ap-ring-v">{score}</span>
          </div>
          <div>
            <p className="text-xs font-mono uppercase tracking-wide text-ink-3">Fit</p>
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {score}
              <span className="ml-1 text-sm font-normal text-ink-3">/100</span>
            </p>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-5 text-sm">
          <div>
            <dt className="text-xs font-mono uppercase tracking-wide text-ink-3">Stage</dt>
            <dd className="mt-1">
              <span className={`ap-pill ap-pill--${tone(stage.tone)}`}>{stage.label}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-mono uppercase tracking-wide text-ink-3">
              Applications
            </dt>
            <dd className="mt-1 tabular-nums text-foreground">{hit.applicationCount}</dd>
          </div>
        </dl>

        <div className="mt-6">
          <p className="text-xs font-mono uppercase tracking-wide text-ink-3">
            Matched skills
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {hit.matchedSkills.length === 0 ? (
              <span className="text-sm text-ink-2">None matched.</span>
            ) : (
              hit.matchedSkills.map((s) => (
                <Badge key={s} tone="neutral">
                  {s}
                </Badge>
              ))
            )}
          </div>
        </div>

        <div className="mt-auto flex justify-end gap-2 pt-6">
          <button type="button" className="ap-btn ap-btn-ghost ap-btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function tone(t: string): "good" | "warn" | "danger" | "teal" | "coral" {
  if (t === "success") return "good";
  if (t === "warning") return "warn";
  if (t === "danger") return "danger";
  if (t === "info") return "teal";
  return "teal";
}
