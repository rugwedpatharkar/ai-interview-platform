import { Badge } from "@ip/ui";
import { MapPin } from "lucide-react";

import { fmtSalary } from "../app/jobs/[id]/detail-client";
import type { JobDetailDTO } from "../app/jobs/[id]/types";

const REMOTE_LABEL: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};

/** Compact metadata badge row for the job detail page: work mode, location,
 * employment type, salary, and skills. Each chip is omitted when its field is unset. */
export function JobMeta({
  job,
}: {
  job: Pick<
    JobDetailDTO,
    | "location"
    | "remoteMode"
    | "employmentType"
    | "salaryMin"
    | "salaryMax"
    | "salaryCurrency"
    | "skills"
  >;
}) {
  const salary = fmtSalary(job);
  return (
    <div className="flex flex-wrap gap-1.5">
      {job.remoteMode && (
        <Badge tone="info" variant="subtle">
          {REMOTE_LABEL[job.remoteMode] ?? job.remoteMode}
        </Badge>
      )}
      {job.location && (
        <Badge tone="neutral" variant="subtle">
          <MapPin className="mr-1 size-3" aria-hidden />
          {job.location}
        </Badge>
      )}
      {job.employmentType && (
        <Badge tone="neutral" variant="subtle">
          {job.employmentType.replace(/_/g, " ")}
        </Badge>
      )}
      {salary && (
        <Badge tone="success" variant="subtle">
          {salary}
        </Badge>
      )}
      {job.skills.map((s) => (
        <Badge key={s} tone="neutral" variant="outline">
          {s}
        </Badge>
      ))}
    </div>
  );
}
