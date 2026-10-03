import Link from "next/link";

import { SaveJobButton } from "../../../components/save-job-button";
import { ApplyIsland } from "./apply-island";
import { fmtSalary } from "./detail-client";
import { SkillGapIsland } from "./skill-gap-island";
import type { JobDetailDTO } from "./types";

const TYPE_LABEL: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
};

function fmtPosted(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Sticky apply sidebar — the v3 mockup wants Apply visible at both top + bottom of the
 *  page (long JDs would otherwise hide it on first viewport). `placement` swaps the heading
 *  so the bottom copy reads as a restatement rather than a duplicate. */
export function JobDetailSidebar({
  job,
  placement,
}: {
  job: JobDetailDTO;
  placement: "top" | "bottom";
}) {
  const salary = fmtSalary(job);
  const employment = job.employmentType
    ? (TYPE_LABEL[job.employmentType] ?? job.employmentType.replace(/_/g, " "))
    : null;

  return (
    <div className="ap-cell flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="ap-h4 text-base">
          {placement === "top" ? "Apply" : "Ready to apply?"}
        </h3>
        {/* Save toggle — renders null when signed out (client island). */}
        <SaveJobButton jobId={job.jobId} />
      </div>

      <ApplyIsland jobId={job.jobId} />

      <dl className="grid gap-3 border-t border-line pt-4 text-sm">
        {salary && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-ink-3">Compensation</dt>
            <dd className="font-medium tabular-nums text-foreground">{salary}</dd>
          </div>
        )}
        {employment && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-ink-3">Employment</dt>
            <dd className="font-medium text-foreground">{employment}</dd>
          </div>
        )}
        {job.location && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-ink-3">Location</dt>
            <dd className="text-right font-medium text-foreground">{job.location}</dd>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <dt className="text-ink-3">Posted</dt>
          <dd className="font-medium tabular-nums text-foreground">
            {fmtPosted(job.postedAt)}
          </dd>
        </div>
      </dl>

      <SkillGapIsland jobSkills={job.skills} />

      <div className="border-t border-line pt-4">
        <p className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-ink-3">
          About the company
        </p>
        <p className="mt-2 text-sm text-ink-2">
          {/* Public company profile is the canonical "about" — link out rather than
              duplicating the description here. */}
          <Link
            href={`/companies/${job.company.id}`}
            className="font-medium text-brand-strong hover:underline"
          >
            See {job.company.name}'s profile →
          </Link>
        </p>
      </div>
    </div>
  );
}
