"use client";

import { Skeleton } from "@ip/ui";
import { useQuery } from "@tanstack/react-query";

import { JobCard } from "../../../components/job-card";
import { SaveJobButton } from "../../../components/save-job-button";
import { query as searchJobs } from "../search-client";

/** "Similar roles" strip below the JD. v3 wants the page to feel actionable — if the role
 *  doesn't fit, the page should still send the visitor somewhere useful. Today we fetch
 *  other published roles at the same company (the closest "similar" proxy we have without
 *  the embeddings-based recommender on the public surface); the seam is the marketplace
 *  search client so when a public `similarRoles(id)` endpoint lands, only this hook swaps. */
export function SimilarRoles({
  companyId,
  excludeJobId,
}: {
  companyId: string;
  excludeJobId: string;
}) {
  const q = useQuery({
    queryKey: ["similar-roles", companyId, excludeJobId],
    // Without a "by company" filter on the public search yet, broaden by a single keyword
    // would over-narrow; just use the marketplace and post-filter by companyId. Cheap, and
    // it never returns a result that wouldn't appear in the public catalog.
    queryFn: ({ signal }) => searchJobs({ pageSize: 6 }, signal),
    staleTime: 60_000,
  });

  const peers = (q.data?.jobs ?? [])
    .filter((j) => j.companyId === companyId && j.jobId !== excludeJobId)
    .slice(0, 3);

  // No skeleton + no empty state — "similar roles" is an enhancement, not a primary surface.
  // If we have nothing useful to show, the section quietly disappears.
  if (q.isLoading) {
    return (
      <section className="mt-12">
        <h3 className="ap-h4 mb-4">Similar roles</h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      </section>
    );
  }
  if (q.isError || peers.length === 0) return null;

  return (
    <section className="mt-12">
      <h3 className="ap-h4 mb-4">Similar roles</h3>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {peers.map((j) => (
          <JobCard key={j.jobId} job={j} action={<SaveJobButton jobId={j.jobId} />} />
        ))}
      </div>
    </section>
  );
}
