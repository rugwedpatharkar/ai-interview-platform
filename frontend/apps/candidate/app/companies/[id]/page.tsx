import {
  AppShell,
  Avatar,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  buttonVariants,
  cn,
} from "@ip/ui";
import type { Metadata } from "next";
import { ExternalLink, MapPin } from "lucide-react";
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
 * published presence → not-found. */
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
    <AppShell title="Aptura" nav={<Link href="/jobs">Browse jobs</Link>}>
      <Card>
        <CardHeader className="flex flex-col items-start gap-4 sm:flex-row">
          <Avatar name={company.name} src={company.logo} size="lg" />
          <div className="flex flex-col gap-2">
            <CardTitle>{company.name}</CardTitle>
            {company.website && (
              <a
                href={company.website}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "self-start px-0 text-muted-foreground",
                )}
              >
                <ExternalLink className="size-3.5" aria-hidden />
                {company.website.replace(/^https?:\/\//, "")}
              </a>
            )}
            <TrustBadges trust={company.trust} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {company.about && (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {company.about}
            </p>
          )}
          {company.locations.length > 0 && (
            <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-4" aria-hidden />
              {company.locations.join(" · ")}
            </p>
          )}
        </CardContent>
      </Card>

      <section className="mt-6 flex flex-col gap-3">
        <h2 className="font-display text-lg font-medium text-foreground">
          Open roles
        </h2>
        {jobs.length === 0 ? (
          <EmptyState
            title="No open roles right now"
            description="Check back soon or browse other companies."
          />
        ) : (
          jobs.map((j) => (
            <JobCard key={j.jobId} job={j} action={<SaveJobButton jobId={j.jobId} />} />
          ))
        )}
      </section>
    </AppShell>
  );
}
