import { Avatar, MarketingShell, buttonVariants, cn } from "@ip/ui";
import type { Metadata } from "next";
import { ExternalLink, MapPin, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { JobCard } from "../../../components/job-card";
import { SaveJobButton } from "../../../components/save-job-button";
import { TrustBadges } from "../../../components/trust-badges";
import { companyJobs, companyProfile } from "./company-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const c = await companyProfile(id).catch(() => null);
  return c
    ? { title: `${c.name} · Aptura`, description: c.about ?? undefined }
    : { title: "Company · Aptura" };
}

/** Public, SSR, crawlable company page: branding + funnel-derived trust signals +
 * the company's published roles (reusing the shared JobCard). Companies with no
 * published presence → not-found.
 *
 * Asymmetric error handling preserved:
 *  - profile 404 → notFound() (we don't show a half-page for a missing entity)
 *  - jobs error  → { jobs: [] } (the profile is still useful; an empty roles
 *    section reads as "no open roles" rather than a server error).
 *
 * ISR windows preserved: profile revalidates every 300s (slower-changing branding),
 * jobs every 120s (faster-changing). Both are set in company-client.ts via `next:
 * { revalidate }`. */
export default async function CompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const company = await companyProfile(id).catch((e) => {
    if (e instanceof Error && e.message === "not_found") return null;
    throw e; // genuine fetch failure → Next error boundary (error.tsx)
  });
  if (!company) notFound();

  const { jobs } = await companyJobs(id).catch(() => ({
    jobs: [],
    total: 0,
    page: 1,
    pageSize: 24,
  }));

  return (
    <MarketingShell audience="applicants">
      {/* Single page-level h1 for the entity; visible heading is the h2 in the hero. */}
      <h1 className="sr-only">{company.name}</h1>

      <section className="border-b border-line bg-surface-2 py-12 lg:py-16">
        <div className="ap-wrap">
          <span className="ap-eyebrow">Company profile</span>
          <div className="mt-5 flex flex-col items-start gap-6 sm:flex-row sm:items-center">
            <Avatar name={company.name} src={company.logo} size="lg" />
            <div className="min-w-0 flex-1">
              <h2 className="ap-h2">{company.name}</h2>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-ink-2">
                {company.website && (
                  <a
                    href={company.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-ink-2 transition-colors hover:text-ink-deep"
                  >
                    <ExternalLink className="size-3.5" aria-hidden />
                    {company.website.replace(/^https?:\/\//, "")}
                  </a>
                )}
                {company.locations.length > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-3.5" aria-hidden />
                    {company.locations.join(" · ")}
                  </span>
                )}
              </div>
              <div className="mt-3">
                {/* Trust chips: funnel-derived; "responds in" hidden when
                    respondsInDays === 0, plural "open role(s)" — see trustChips() */}
                <TrustBadges trust={company.trust} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="ap-wrap py-10 lg:py-12">
        <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
          {/* ---------- LEFT: about ---------- */}
          {company.about ? (
            <article className="ap-cell ap-cell--anchor">
              <h3 className="ap-h3 mb-4">About {company.name}</h3>
              <p className="whitespace-pre-wrap text-[1.0rem] leading-relaxed text-ink-2">
                {company.about}
              </p>
            </article>
          ) : (
            // Don't leave the layout asymmetric — show a neutral placeholder.
            <div className="ap-cell flex min-h-[160px] items-center justify-center">
              <p className="text-sm text-ink-3">
                This company hasn&apos;t added an about section yet.
              </p>
            </div>
          )}

          {/* ---------- RIGHT: at-a-glance ---------- */}
          <aside className="ap-cell flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-brand" aria-hidden />
              <h3 className="ap-h4 text-base">At a glance</h3>
            </div>
            <dl className="grid gap-3 text-sm">
              <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
                <dt className="text-ink-3">Open roles</dt>
                <dd className="font-medium tabular-nums text-foreground">
                  {company.trust.openJobs}
                </dd>
              </div>
              {company.trust.respondsInDays > 0 && (
                <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
                  <dt className="text-ink-3">Typical response</dt>
                  <dd className="font-medium tabular-nums text-foreground">
                    ~{company.trust.respondsInDays} days
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-3">Active hiring</dt>
                <dd className="font-medium text-foreground">
                  {company.trust.activelyReviewing ? "Yes" : "Quiet"}
                </dd>
              </div>
            </dl>
            <a
              href="#open-roles"
              className={cn(buttonVariants({ variant: "outline" }), "mt-2 self-start")}
            >
              See all roles
            </a>
          </aside>
        </div>

        <section id="open-roles" className="mt-12 flex flex-col gap-4 scroll-mt-24">
          <header className="flex items-end justify-between gap-3">
            <h3 className="ap-h3">Open roles</h3>
            {jobs.length > 0 && (
              <span className="font-mono text-[0.72rem] uppercase tracking-[0.16em] text-ink-3">
                {jobs.length} role{jobs.length === 1 ? "" : "s"}
              </span>
            )}
          </header>
          {jobs.length === 0 ? (
            <div className="ap-cell text-center">
              <p className="text-sm text-ink-2">
                No open roles right now. Check back soon or{" "}
                <Link
                  href="/jobs"
                  className="font-medium text-brand-strong hover:underline"
                >
                  browse other companies
                </Link>
                .
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {jobs.map((j) => (
                <JobCard
                  key={j.jobId}
                  job={j}
                  action={<SaveJobButton jobId={j.jobId} />}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </MarketingShell>
  );
}
