// Public company-profile client. Reads `GET /public/companies/{id}` and
// `GET /public/companies/{id}/jobs` server-side (token-free). A mock
// (`makeMockCompanyClient`) stands in behind `NEXT_PUBLIC_MOCK=1` until the
// endpoints land; only this module swaps then. Trust signals are funnel-derived
// on the backend (never self-reported) — the FE only renders them.

import type { JobCardDTO } from "../../jobs/types";
import type { CompanyJobsResult, CompanyProfileDTO, TrustSignals } from "./types";

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Funnel-derived trust chips. Order: reviewing → responsiveness → open roles.
 * The responsiveness chip is hidden when `respondsInDays === 0` (below sample). */
export function trustChips(t: TrustSignals): string[] {
  const out: string[] = [];
  if (t.activelyReviewing) out.push("Actively reviewing");
  if (t.respondsInDays > 0) out.push(`Responds in ~${t.respondsInDays} days`);
  out.push(plural(t.openJobs, "open role"));
  return out;
}

const BASE = process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:8080";

// ---- snake_case wire shapes ------------------------------------------------------

interface WireProfile {
  id: string;
  name: string;
  about: string | null;
  website: string | null;
  logo: string | null;
  locations: string[] | null;
  trust: {
    actively_reviewing: boolean;
    responds_in_days: number;
    open_jobs: number;
  };
}

interface WireJob {
  job_id: string;
  title: string;
  company_name: string;
  company_id: string;
  location: string | null;
  remote_mode: "remote" | "hybrid" | "onsite" | null;
  employment_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  skills: string[] | null;
  posted_at: string;
  snippet: string | null;
}

interface WireJobsResult {
  jobs: WireJob[];
  total: number;
  page: number;
  page_size: number;
}

function toProfile(w: WireProfile): CompanyProfileDTO {
  return {
    id: w.id,
    name: w.name,
    about: w.about,
    website: w.website,
    logo: w.logo,
    locations: w.locations ?? [],
    trust: {
      activelyReviewing: w.trust.actively_reviewing,
      respondsInDays: w.trust.responds_in_days,
      openJobs: w.trust.open_jobs,
    },
  };
}

// Same mapping as the marketplace search client — the jobs endpoint returns the
// shared `JobCardDTO` wire shape, so `JobCard` renders these as-is.
function toJobCard(w: WireJob): JobCardDTO {
  return {
    jobId: w.job_id,
    title: w.title,
    companyName: w.company_name,
    companyId: w.company_id,
    location: w.location ?? "",
    remoteMode: w.remote_mode ?? "",
    employmentType: w.employment_type ?? "",
    salaryMin: w.salary_min ?? 0,
    salaryMax: w.salary_max ?? 0,
    salaryCurrency: w.salary_currency ?? "",
    skills: w.skills ?? [],
    postedAt: w.posted_at,
    snippet: w.snippet ?? "",
  };
}

export async function getCompanyProfile(id: string): Promise<CompanyProfileDTO> {
  const res = await fetch(`${BASE}/public/companies/${encodeURIComponent(id)}`, {
    next: { revalidate: 300 }, // matches BE Cache-Control: max-age=300
  });
  if (res.status === 404) throw new Error("not_found");
  if (!res.ok) throw new Error(`company failed: ${res.status}`);
  return toProfile((await res.json()) as WireProfile);
}

export async function getCompanyJobs(id: string, page = 1): Promise<CompanyJobsResult> {
  const res = await fetch(
    `${BASE}/public/companies/${encodeURIComponent(id)}/jobs?page=${page}`,
    { next: { revalidate: 120 } },
  );
  if (!res.ok) throw new Error(`company jobs failed: ${res.status}`);
  const w = (await res.json()) as WireJobsResult;
  return { jobs: w.jobs.map(toJobCard), total: w.total, page: w.page, pageSize: w.page_size };
}

// ---- mock client (NEXT_PUBLIC_MOCK=1) --------------------------------------------

const PROFILE: CompanyProfileDTO = {
  id: "c1",
  name: "Northwind",
  about:
    "We build developer tools used by 2M engineers. Remote-first, async by default.",
  website: "https://northwind.example",
  logo: null,
  locations: ["Berlin", "Remote (EU)"],
  trust: { activelyReviewing: true, respondsInDays: 4, openJobs: 3 },
};

const JOBS: JobCardDTO[] = [
  {
    jobId: "1",
    title: "Senior Frontend Engineer",
    companyName: "Northwind",
    companyId: "c1",
    location: "Remote (EU)",
    remoteMode: "remote",
    employmentType: "full_time",
    salaryMin: 120000,
    salaryMax: 160000,
    salaryCurrency: "USD",
    skills: ["react", "typescript"],
    postedAt: "2026-06-18T00:00:00Z",
    snippet: "Own the marketplace UI end to end.",
  },
  {
    jobId: "2",
    title: "Backend Engineer (Go)",
    companyName: "Northwind",
    companyId: "c1",
    location: "Berlin",
    remoteMode: "hybrid",
    employmentType: "full_time",
    salaryMin: 110000,
    salaryMax: 150000,
    salaryCurrency: "EUR",
    skills: ["go", "mongodb"],
    postedAt: "2026-06-17T00:00:00Z",
    snippet: "Scale the funnel services behind the marketplace.",
  },
];

export function makeMockCompanyClient() {
  return {
    profile: async (id: string): Promise<CompanyProfileDTO> => {
      if (id === "404") throw new Error("not_found");
      return { ...PROFILE, id };
    },
    jobs: async (_id: string, page = 1): Promise<CompanyJobsResult> => ({
      jobs: JOBS,
      total: JOBS.length,
      page,
      pageSize: 24,
    }),
  };
}

export const USE_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";
const mock = makeMockCompanyClient();
export const companyProfile: (id: string) => Promise<CompanyProfileDTO> = USE_MOCK
  ? mock.profile
  : getCompanyProfile;
export const companyJobs: (id: string, page?: number) => Promise<CompanyJobsResult> =
  USE_MOCK ? mock.jobs : getCompanyJobs;
