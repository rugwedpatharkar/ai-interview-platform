"use client";

import { EmptyState, Skeleton } from "@ip/ui";
import { useQuery } from "@tanstack/react-query";
import { SearchX } from "lucide-react";
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
 * server component around this. */
export function Marketplace({
  initial,
  initialParams,
}: {
  initial: SearchJobsResult | null;
  initialParams: SearchJobsParams;
}) {
  const [params, setParams] = useState<SearchJobsParams>(initialParams);

  const q = useQuery({
    queryKey: ["public-jobs", params],
    queryFn: ({ signal }) => query(params, signal),
    initialData:
      sameParams(params, initialParams) && initial ? initial : undefined,
    placeholderData: (prev) => prev,
  });

  const jobs = q.data?.jobs ?? [];
  const showSkeletons = q.isLoading && !q.data;

  return (
    <div className="flex flex-col gap-4">
      <JobSearchBar value={params} onSearch={setParams} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px_1fr]">
        <FilterSidebar facets={q.data?.facets} value={params} onChange={setParams} />

        <div className="flex flex-col gap-3">
          {q.data && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {q.data.total} {q.data.total === 1 ? "role" : "roles"}
            </p>
          )}

          {showSkeletons && (
            <>
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
            </>
          )}

          {q.isError && (
            <EmptyState
              title="Couldn't load jobs"
              description="Something went wrong fetching the catalog. Try again in a moment."
              icon={SearchX}
            />
          )}

          {!showSkeletons && !q.isError && jobs.length === 0 && (
            <EmptyState
              title="No matching jobs"
              description="Try broadening your search or clearing some filters."
              icon={SearchX}
            />
          )}

          {jobs.map((j) => (
            <JobCard key={j.jobId} job={j} action={<SaveJobButton jobId={j.jobId} />} />
          ))}
        </div>
      </div>
    </div>
  );
}
