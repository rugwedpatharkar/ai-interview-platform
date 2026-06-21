import { MarketingShell } from "@ip/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SimilarRoles } from "./similar-roles";
import { JobDetailHero } from "./job-detail-hero";
import { JobDetailSidebar } from "./job-detail-sidebar";
import { detail } from "./detail-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const job = await detail(id).catch(() => null);
  if (!job) return { title: "Job · Aptura" };
  return {
    title: `${job.title} · ${job.company.name} · Aptura`,
    description: job.jdText.slice(0, 160),
  };
}

/** Public, SSR, crawlable job-detail page. The JD + meta render server-side
 * (token-free) so they land in the HTML; Apply + Save are client islands that
 * require sign-in. Draft/missing jobs → not-found (never leak draft existence).
 *
 * v3 layout: MarketingShell chrome, then a two-column body at lg+ — JD on the
 * left, a sticky sidebar with apply CTAs + meta on the right. */
export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await detail(id).catch((e) => {
    if (e instanceof Error && e.message === "not_found") return null;
    throw e; // genuine fetch failure → Next error boundary (error.tsx)
  });
  if (!job) notFound(); // → not-found.tsx

  return (
    <MarketingShell audience="applicants">
      {/* Single page-level h1 for the entity; the visible hero heading is the h2. */}
      <h1 className="sr-only">
        {job.title} · {job.company.name}
      </h1>

      <JobDetailHero job={job} />

      <div className="ap-wrap py-10 lg:py-12">
        <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
          {/* ---------- LEFT: full JD ---------- */}
          <article className="ap-cell ap-cell--anchor">
            <h2 className="ap-h3 mb-4">About the role</h2>
            {/* The JD is plain text from the BE today; whitespace-pre-wrap preserves
                hand-written newlines until a markdown renderer ships. Avoid
                dangerouslySetInnerHTML — the source isn't sanitized end-to-end. */}
            <p className="whitespace-pre-wrap text-[1.0rem] leading-relaxed text-ink-2">
              {job.jdText}
            </p>
          </article>

          {/* ---------- RIGHT: sticky sidebar ---------- */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <JobDetailSidebar job={job} placement="top" />
          </aside>
        </div>

        {/* Bottom Apply restated below the JD — a long JD should never bury the action. */}
        <div className="mt-8 lg:hidden">
          <JobDetailSidebar job={job} placement="bottom" />
        </div>

        <SimilarRoles companyId={job.company.id} excludeJobId={job.jobId} />
      </div>
    </MarketingShell>
  );
}
