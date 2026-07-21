"use client";

import { Button, EmptyState, Skeleton, cn } from "@ip/ui";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Compass,
  RefreshCw,
  SearchX,
  Sparkles,
} from "lucide-react";
import { useState } from "react";

import { FilterSidebar } from "../../components/filter-sidebar";
import { JobCard } from "../../components/job-card";
import { JobSearchBar } from "../../components/job-search-bar";
import { SaveJobButton } from "../../components/save-job-button";
import { query } from "./search-client";
import type { SearchJobsParams, SearchJobsResult } from "./types";

const sameParams = (a: SearchJobsParams, b: SearchJobsParams) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Interactive search island. Seeded by the SSR `initial` result so the first paint
 * needs no client fetch; thereafter every params change re-queries via TanStack Query
 * (key `["public-jobs", params]`). The page shell + heading are rendered by the
 * server component around this.
 *
 * v3 layout: a 3-column grid at lg+ (filter rail · results · "why these results" rail),
 * with the filter rail collapsing into a `<details>` accordion on mobile and the right
 * rail moving below results.
 */
export function Marketplace({
  initial,
  initialParams,
}: {
  initial: SearchJobsResult | null;
  initialParams: SearchJobsParams;
}) {
  const [params, setParams] = useState<SearchJobsParams>(initialParams);

  // Any search / filter / sort change resets to page 1; only the pager moves pages.
  const setFilters = (next: SearchJobsParams) => setParams({ ...next, page: 1 });

  const q = useQuery({
    queryKey: ["public-jobs", params],
    queryFn: ({ signal }) => query(params, signal),
    initialData:
      sameParams(params, initialParams) && initial ? initial : undefined,
    placeholderData: (prev) => prev,
  });

  const jobs = q.data?.jobs ?? [];
  const showSkeletons = q.isLoading && !q.data;

  const page = q.data?.page ?? 1;
  const pageSize = q.data?.pageSize ?? 24;
  const totalPages = q.data ? Math.max(1, Math.ceil(q.data.total / pageSize)) : 1;
  const goToPage = (next: number) => {
    setParams({ ...params, page: next });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="flex flex-col gap-6">
      <JobSearchBar value={params} onSearch={setFilters} />

      {/* Mobile: filter rail as accordion above the results. */}
      <details className="ap-cell lg:hidden">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          Filters
        </summary>
        <div className="mt-4">
          <FilterSidebar facets={q.data?.facets} value={params} onChange={setFilters} />
        </div>
      </details>

      <div className="grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)_280px]">
        {/* ---------- LEFT: filter rail ---------- */}
        <aside className="hidden lg:block">
          <div className="ap-cell sticky top-24">
            <FilterSidebar facets={q.data?.facets} value={params} onChange={setFilters} />
          </div>
        </aside>

        {/* ---------- CENTER: results ---------- */}
        <div className="flex min-w-0 flex-col gap-4">
          {q.data && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted-foreground" aria-live="polite">
                <span className="font-semibold tabular-nums text-foreground">
                  {q.data.total}
                </span>{" "}
                {q.data.total === 1 ? "role matches" : "roles match"}
              </p>
              <span className="flex-1" />
              <div
                role="tablist"
                aria-label="Sort"
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-muted p-0.5"
              >
                {(
                  [
                    ["relevance", "Best match"],
                    ["recent", "Newest"],
                  ] as const
                ).map(([value, label]) => {
                  const active = (params.sort ?? "relevance") === value;
                  return (
                    <button
                      key={value}
                      role="tab"
                      type="button"
                      aria-selected={active}
                      onClick={() => setFilters({ ...params, sort: value })}
                      className={cn(
                        "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                        active
                          ? "bg-surface text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {showSkeletons &&
            Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))}

          {q.isError && (
            <EmptyState
              title="Couldn't load jobs"
              description="Something went wrong fetching the catalog. Check your connection, then try again."
              icon={CloudOff}
              action={
                <Button variant="outline" size="sm" onClick={() => q.refetch()}>
                  <RefreshCw className="size-4" aria-hidden />
                  Try again
                </Button>
              }
            />
          )}

          {!showSkeletons && !q.isError && jobs.length === 0 && (
            <EmptyState
              title="No jobs match — try widening your filters"
              description="Remove a filter, widen the location, or clear the keyword to see more roles."
              icon={SearchX}
            />
          )}

          {jobs.map((j, i) => (
            <div
              key={j.jobId}
              className="animate-rise-in"
              style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
            >
              <JobCard
                job={j}
                bestMatch={i === 0 && (params.sort ?? "relevance") === "relevance"}
                action={<SaveJobButton jobId={j.jobId} />}
              />
            </div>
          ))}

          {q.data && totalPages > 1 && (
            <nav
              className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-4"
              aria-label="Pagination"
            >
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => goToPage(page - 1)}
              >
                <ChevronLeft className="size-4" aria-hidden />
                Previous
              </Button>
              <span
                className="text-sm tabular-nums text-muted-foreground"
                aria-live="polite"
              >
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => goToPage(page + 1)}
              >
                Next
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </nav>
          )}
        </div>

        {/* ---------- RIGHT: "why these results" rail ---------- */}
        <aside className="order-last lg:order-none">
          <div className="ap-cell sticky top-24 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-brand" aria-hidden />
              <h2 className="txt-h3">Why these results</h2>
            </div>
            <p className="text-sm text-ink-2">
              {params.q
                ? `Roles ranked by relevance to "${params.q}". Tied results break by recency.`
                : "Roles ranked by recency. Add a keyword for a relevance-weighted match."}
            </p>
            <ul className="grid gap-2 text-sm text-ink-2">
              <li className="flex items-start gap-2">
                <Compass className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                <span>
                  Filters narrow the catalog deterministically — same filters, same
                  results, always.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                <span>
                  Sign in to save roles and get a feed weighted by your interview history.
                </span>
              </li>
            </ul>
            {q.data && (
              <p className="border-t border-line pt-3 font-mono text-[0.72rem] uppercase tracking-[0.16em] text-ink-3">
                Showing {jobs.length} of {q.data.total}
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
