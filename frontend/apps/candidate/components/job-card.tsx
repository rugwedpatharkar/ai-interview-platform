import { Badge, Card, buttonVariants, cn } from "@ip/ui";
import { MapPin } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { JobCardDTO } from "../app/saved/types";

const REMOTE_LABEL: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};
const TYPE_LABEL: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
};

/** Compact salary range, e.g. "$120k–160k". `0` (zero) is treated as "unset" — the
 * BE serializes missing salary fields as 0 (proto default), so showing "0k–0k" leaks
 * implementation detail instead of "salary not disclosed". */
function formatSalary(
  min: number | null | undefined,
  max: number | null | undefined,
  currency: string,
): string | null {
  const hasMin = min != null && min > 0;
  const hasMax = max != null && max > 0;
  if (!hasMin && !hasMax) return null;
  const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : `${currency} `;
  const k = (n: number) => `${Math.round(n / 1000)}k`;
  if (hasMin && hasMax) return `${sym}${k(min!)}–${k(max!)}`;
  return `${sym}${k((hasMin ? min : max)!)}`;
}

/** Relative posted date, e.g. "posted 2d ago". Falls back to the raw string. */
function postedLabel(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const days = Math.max(0, Math.round((Date.now() - then) / 86_400_000));
  if (days === 0) return "posted today";
  return `posted ${days}d ago`;
}

/** Shared marketplace job card. The whole card links to the public job page; the
 * optional `action` slot (e.g. SaveJobButton) sits in the footer and stops
 * propagation so toggling it doesn't navigate. `bestMatch` adds the accent pill. */
export function JobCard({
  job,
  action,
  bestMatch = false,
}: {
  job: JobCardDTO;
  action?: ReactNode;
  bestMatch?: boolean;
}) {
  const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency);
  const remote = job.remoteMode ? REMOTE_LABEL[job.remoteMode] : null;
  const employment = job.employmentType
    ? (TYPE_LABEL[job.employmentType] ?? job.employmentType.replace(/_/g, " "))
    : null;
  const initial = (job.companyName.trim()[0] ?? "?").toUpperCase();

  return (
    <Card
      hoverable
      className={cn(
        "relative",
        // Best match keeps the violet border for emphasis but retains the Card's
        // --elev-1 depth (a shadow-[…] override here would erase it).
        bestMatch && "border-primary",
      )}
    >
      {bestMatch && (
        <span className="absolute right-4 top-4 z-10 inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
          Best match
        </span>
      )}
      <Link href={`/jobs/${job.jobId}`} className="block">
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-start gap-4">
            <span
              className="grid size-12 shrink-0 place-items-center rounded-lg border border-border bg-surface-muted font-display text-xl font-semibold text-foreground"
              aria-hidden
            >
              {initial}
            </span>
            <div className="min-w-0 pr-16">
              <p className="font-display text-lg font-semibold leading-tight tracking-tight text-foreground">
                {job.title}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{job.companyName}</p>
            </div>
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
            {employment && (
              <Badge tone="neutral" variant="subtle">
                {employment}
              </Badge>
            )}
            {salary && (
              <Badge tone="success" variant="subtle" className="tabular-nums">
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

          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[0.74rem] text-muted-foreground">
              {postedLabel(job.postedAt)}
            </span>
            <span className="flex-1" />
            {action && <div className="z-10">{action}</div>}
            <span
              className={cn(buttonVariants({ size: "sm" }), "shrink-0")}
              aria-hidden
            >
              Apply
            </span>
          </div>
        </div>
      </Link>
    </Card>
  );
}
