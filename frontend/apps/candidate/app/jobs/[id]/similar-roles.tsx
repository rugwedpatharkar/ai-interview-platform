"use client";

import { Skeleton } from "@ip/ui";
import { useQuery } from "@tanstack/react-query";

import { companyJobs } from "../../companies/[id]/company-client";
import { JobCard } from "../../../components/job-card";
import { SaveJobButton } from "../../../components/save-job-button";

/** "Similar roles" strip below the JD. Today "similar" == other open roles at the same
 *  company (the closest proxy we have on the public surface without embeddings). The
 *  companies endpoint is company-scoped, so we get real peers even when the marketplace
 *  spans many companies — the previous shape fetched 6 platform-wide jobs and
 *  post-filtered, which almost never returned anything on a real catalog. */
export function SimilarRoles({
  companyId,
  excludeJobId,
}: {
  companyId: string;
  excludeJobId: string;
}) {
  const q = useQuery({
    queryKey: ["similar-roles", companyId, excludeJobId],
    queryFn: () => companyJobs(companyId),
    staleTime: 60_000,
  });

  const peers = (q.data?.jobs ?? [])
    .filter((j) => j.jobId !== excludeJobId)
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
