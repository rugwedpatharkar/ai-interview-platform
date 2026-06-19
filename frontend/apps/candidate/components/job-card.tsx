import { Badge, Card, CardContent } from "@ip/ui";
import { Building2, MapPin } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { JobCardDTO } from "../app/saved/types";

const REMOTE_LABEL: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};

/** Compact salary range, e.g. "$120k–160k". Omitted when both bounds are 0. */
function formatSalary(min: number, max: number, currency: string): string | null {
  if (!min && !max) return null;
  const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : `${currency} `;
  const k = (n: number) => `${Math.round(n / 1000)}k`;
  if (min && max) return `${sym}${k(min)}–${k(max)}`;
  return `${sym}${k(min || max)}`;
}

/** Shared marketplace job card. The whole card links to the public job page; the
 * optional `action` slot (e.g. SaveJobButton) sits top-right and stops propagation
 * so toggling it doesn't navigate. */
export function JobCard({ job, action }: { job: JobCardDTO; action?: ReactNode }) {
  const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency);
  const remote = job.remoteMode ? REMOTE_LABEL[job.remoteMode] : null;
  return (
    <Card hoverable className="relative">
      {action && <div className="absolute right-3 top-3 z-10">{action}</div>}
      <Link href={`/jobs/${job.jobId}`} className="block">
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex flex-col gap-1 pr-10">
            <p className="font-medium text-foreground">{job.title}</p>
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Building2 className="size-3.5" aria-hidden />
              {job.companyName}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {remote && (
              <Badge tone="info" variant="subtle">
                {remote}
              </Badge>
            )}
            {job.location && (
              <Badge tone="neutral" variant="subtle">
                <MapPin className="mr-1 size-3" aria-hidden />
                {job.location}
              </Badge>
            )}
            {salary && (
              <Badge tone="success" variant="subtle">
                {salary}
              </Badge>
            )}
          </div>

          {job.snippet && (
            <p className="line-clamp-2 text-sm text-muted-foreground">{job.snippet}</p>
          )}

          {job.skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {job.skills.slice(0, 6).map((s) => (
                <Badge key={s} tone="neutral" variant="outline">
                  {s}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Link>
    </Card>
  );
}
