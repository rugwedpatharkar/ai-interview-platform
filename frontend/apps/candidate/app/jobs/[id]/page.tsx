import {
  AppShell,
  Avatar,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ip/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SaveJobButton } from "../../../components/save-job-button";
import { JobMeta } from "../../../components/job-meta";
import { ApplyIsland } from "./apply-island";
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
 * require sign-in. Draft/missing jobs → not-found (never leak draft existence). */
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
    <AppShell title="Aptura" nav={<Link href="/jobs">Browse jobs</Link>}>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Avatar name={job.company.name} src={job.company.logo} size="md" />
            <div>
              <CardTitle>{job.title}</CardTitle>
              <CardDescription>
                <Link
                  href={`/companies/${job.company.id}`}
                  className="hover:underline"
                >
                  {job.company.name}
                </Link>
              </CardDescription>
            </div>
          </div>
          {/* Save toggle — renders null when signed out (client island). */}
          <SaveJobButton jobId={job.jobId} />
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <JobMeta job={job} />
          <div className="rounded-lg border border-border bg-surface-muted p-5">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {job.jdText}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-5">
            <ApplyIsland jobId={job.jobId} />
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
