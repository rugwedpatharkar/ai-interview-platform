import { Avatar } from "@ip/ui";
import { MapPin } from "lucide-react";
import Link from "next/link";

import { fmtSalary } from "./detail-client";
import type { JobDetailDTO } from "./types";

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

function postedLabel(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const days = Math.max(0, Math.round((Date.now() - then) / 86_400_000));
  if (days === 0) return "Posted today";
  return `Posted ${days}d ago`;
}

/** Hero band at the top of the job-detail page. Mirrors the marketing chrome's eyebrow +
 *  ap-h2 + ap-lead rhythm so the page reads as one continuous Aperture Pro surface. */
export function JobDetailHero({ job }: { job: JobDetailDTO }) {
  const remote = job.remoteMode ? REMOTE_LABEL[job.remoteMode] : null;
  const employment = job.employmentType
    ? (TYPE_LABEL[job.employmentType] ?? job.employmentType.replace(/_/g, " "))
    : null;
  const salary = fmtSalary(job);

  return (
    <section className="border-b border-line bg-surface-2 py-10 lg:py-14">
      <div className="ap-wrap">
        <Link
          href={`/companies/${job.company.id}`}
          className="ap-eyebrow hover:text-brand"
        >
          {job.company.name}
        </Link>
        <div className="mt-4 flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <Avatar name={job.company.name} src={job.company.logo} size="lg" />
          <div className="min-w-0">
            <h2 className="ap-h2">{job.title}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-2">
              {remote && <span className="ap-pill ap-pill--teal">{remote}</span>}
              {job.location && (
                <span className="ap-pill">
                  <MapPin className="size-3" aria-hidden /> {job.location}
                </span>
              )}
              {employment && <span className="ap-pill">{employment}</span>}
              {salary && (
                <span className="ap-pill ap-pill--good tabular-nums">{salary}</span>
              )}
              <span className="font-mono text-[0.72rem] uppercase tracking-[0.16em] text-ink-3">
                {postedLabel(job.postedAt)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
