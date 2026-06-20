// Public job-detail client. Reads the (extended) public REST `GET /public/jobs/{id}`
// server-side (token-free, crawlable). A mock (`makeMockDetailClient`) stands in
// behind `NEXT_PUBLIC_MOCK=1` until the endpoint lands; only this module changes then.

import type { JobDetailDTO } from "./types";

/** Compact salary band, e.g. "USD 120k–160k". Null unless BOTH bounds are present. */
export function fmtSalary(
  j: Pick<JobDetailDTO, "salaryMin" | "salaryMax" | "salaryCurrency">,
): string | null {
  if (!j.salaryMin || !j.salaryMax) return null;
  return `${j.salaryCurrency ?? ""} ${(j.salaryMin / 1000) | 0}k–${(j.salaryMax / 1000) | 0}k`.trim();
}

const BASE = process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:8080";

// snake_case wire shape returned by `/public/jobs/{id}`.
interface WireDetail {
  job_id: string;
  title: string;
  jd_text: string;
  location: string | null;
  remote_mode: JobDetailDTO["remoteMode"];
  employment_type: JobDetailDTO["employmentType"];
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  skills: string[] | null;
  posted_at: string;
  company: { id: string; name: string; logo: string | null };
}

function toDetail(w: WireDetail): JobDetailDTO {
  return {
    jobId: w.job_id,
    title: w.title,
    jdText: w.jd_text,
    location: w.location,
    remoteMode: w.remote_mode,
    employmentType: w.employment_type,
    salaryMin: w.salary_min,
    salaryMax: w.salary_max,
    salaryCurrency: w.salary_currency,
    skills: w.skills ?? [],
    postedAt: w.posted_at,
    company: w.company,
  };
}

export async function getPublicJobDetail(id: string): Promise<JobDetailDTO> {
  const res = await fetch(`${BASE}/public/jobs/${encodeURIComponent(id)}`, {
    next: { revalidate: 120 }, // matches the BE Cache-Control: max-age=120
  });
  if (res.status === 404) throw new Error("not_found");
  if (!res.ok) throw new Error(`detail failed: ${res.status}`);
  return toDetail((await res.json()) as WireDetail);
}

// ---- mock client (NEXT_PUBLIC_MOCK=1) --------------------------------------------

const FIXTURE: JobDetailDTO = {
  jobId: "1",
  title: "Senior Frontend Engineer",
  jdText:
    "We're building the Aptura candidate experience in Next.js + React.\n\n" +
    "You will own the marketplace UI end to end, partner with design on the violet/dark " +
    "token system, and ship accessible, fast surfaces.\n\n" +
    "Requirements:\n• 5+ years React\n• TypeScript\n• A taste for craft.",
  location: "Remote (EU)",
  remoteMode: "remote",
  employmentType: "full_time",
  salaryMin: 120000,
  salaryMax: 160000,
  salaryCurrency: "USD",
  skills: ["react", "typescript", "next.js", "tailwind"],
  postedAt: "2026-06-18T00:00:00Z",
  company: { id: "c1", name: "Northwind", logo: null },
};

export function makeMockDetailClient() {
  return async (id: string): Promise<JobDetailDTO> => {
    if (id === "404") throw new Error("not_found");
    return { ...FIXTURE, jobId: id };
  };
}

export const USE_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";
export const detail: (id: string) => Promise<JobDetailDTO> = USE_MOCK
  ? makeMockDetailClient()
  : getPublicJobDetail;
