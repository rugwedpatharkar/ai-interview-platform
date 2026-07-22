import type { JobDetailDTO } from "../app/jobs/[id]/types";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// schema.org employmentType uses its own vocabulary, not ours.
const EMPLOYMENT_TYPE: Record<NonNullable<JobDetailDTO["employmentType"]>, string> = {
  full_time: "FULL_TIME",
  part_time: "PART_TIME",
  contract: "CONTRACTOR",
  internship: "INTERN",
};

/**
 * Google `JobPosting` markup — what makes a listing eligible for the Jobs
 * experience. Only fields the DTO can actually support are emitted: invalid or
 * invented structured data is worse than none (it risks a manual action), so
 * anything uncertain is left out rather than guessed.
 *
 * Deliberately omitted, pending backend fields:
 * - `validThrough` — no expiry on the DTO. Without it Google ages postings out on
 *   its own schedule, which is acceptable but less precise than an explicit date.
 * - `applicantLocationRequirements` — recommended alongside TELECOMMUTE, but it
 *   expects a structured AdministrativeArea and `location` is free text
 *   ("Remote (EU)"). Omitting yields a warning; guessing yields bad data.
 *
 * `baseSalary` assumes an annual figure — the DTO carries no pay period.
 */
export function jobPostingJsonLd(job: JobDetailDTO): Record<string, unknown> {
  const isRemote = job.remoteMode === "remote";

  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.jdText,
    datePosted: job.postedAt,
    url: `${SITE}/jobs/${encodeURIComponent(job.jobId)}`,
    directApply: true,
    identifier: {
      "@type": "PropertyValue",
      name: job.company.name,
      value: job.jobId,
    },
    hiringOrganization: {
      "@type": "Organization",
      name: job.company.name,
      ...(job.company.logo ? { logo: job.company.logo } : {}),
    },
  };

  if (job.employmentType) {
    data.employmentType = EMPLOYMENT_TYPE[job.employmentType];
  }

  if (job.location) {
    data.jobLocation = {
      "@type": "Place",
      address: { "@type": "PostalAddress", addressLocality: job.location },
    };
  }

  if (isRemote) {
    data.jobLocationType = "TELECOMMUTE";
  }

  if (job.salaryMin && job.salaryMax && job.salaryMin > 0 && job.salaryMax > 0) {
    data.baseSalary = {
      "@type": "MonetaryAmount",
      currency: job.salaryCurrency ?? "USD",
      value: {
        "@type": "QuantitativeValue",
        minValue: job.salaryMin,
        maxValue: job.salaryMax,
        unitText: "YEAR",
      },
    };
  }

  if (job.skills.length > 0) {
    data.skills = job.skills.join(", ");
  }

  return data;
}

/**
 * Serialise for embedding in a <script type="application/ld+json"> block.
 *
 * The `<` escape is load-bearing, not cosmetic: job descriptions are tenant-supplied,
 * so a JD containing `</script>` would otherwise close the tag early and let the rest
 * of the text be parsed as markup. `<` is still valid JSON and parses identically.
 */
export function serializeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
