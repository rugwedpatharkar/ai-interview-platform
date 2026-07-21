// Public marketplace search client. Talks to the REAL public REST endpoint
// `GET /public/jobs` (snake_case JSON, token-free) and maps the response into the
// shared camelCase `JobCardDTO`. A mock client (`makeMockSearchClient`) stands in
// behind `NEXT_PUBLIC_MOCK=1` so the screen builds/runs before any data exists.

import type { JobCardDTO } from "../saved/types";
import type {
  FacetBucket,
  RemoteMode,
  SearchJobsParams,
  SearchJobsResult,
} from "./types";

/** Serialize search params to a querystring, dropping empties and joining skills.
 * `page=1` is omitted (the default) so the canonical URL for an unpaged search is clean. */
export function toQuery(p: SearchJobsParams): string {
  const u = new URLSearchParams();
  if (p.q) u.set("q", p.q);
  if (p.location) u.set("location", p.location);
  if (p.remote) u.set("remote", p.remote);
  if (p.type) u.set("type", p.type);
  if (p.level) u.set("level", p.level);
  if (p.skills?.length) u.set("skills", p.skills.join(","));
  if (p.sort) u.set("sort", p.sort);
  if (p.page && p.page > 1) u.set("page", String(p.page));
  if (p.pageSize) u.set("page_size", String(p.pageSize));
  return u.toString();
}

const BASE = process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:8080";

// ---- snake_case wire shape (what `/public/jobs` actually returns) ----------------

interface WireJob {
  job_id: string;
  title: string;
  company_name: string;
  company_id: string;
  location: string | null;
  remote_mode: RemoteMode | null;
  employment_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  skills: string[] | null;
  posted_at: string;
  snippet: string | null;
}

interface WireResult {
  jobs: WireJob[];
  facets?: {
    remote_mode?: FacetBucket[];
    employment_type?: FacetBucket[];
    experience_level?: FacetBucket[];
  };
  total: number;
  page: number;
  page_size: number;
}

/** Map one wire job (snake_case, nullable) into the shared `JobCardDTO`
 * (camelCase, `""`/`0` for unset — the contract JobCard already renders). */
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

function toResult(w: WireResult): SearchJobsResult {
  return {
    jobs: w.jobs.map(toJobCard),
    facets: {
      remoteMode: w.facets?.remote_mode ?? [],
      employmentType: w.facets?.employment_type ?? [],
      experienceLevel: w.facets?.experience_level ?? [],
    },
    total: w.total,
    page: w.page,
    pageSize: w.page_size,
  };
}

/** Fetch published jobs from the public REST endpoint. Token-free (this surface is
 * public + crawlable). Throws on a non-2xx so the caller can surface an error state. */
export async function searchJobs(
  p: SearchJobsParams,
  signal?: AbortSignal,
): Promise<SearchJobsResult> {
  const qs = toQuery(p);
  const res = await fetch(`${BASE}/public/jobs${qs ? `?${qs}` : ""}`, { signal });
  if (!res.ok) throw new Error(`search failed: ${res.status}`);
  return toResult((await res.json()) as WireResult);
}

// ---- mock client (NEXT_PUBLIC_MOCK=1) --------------------------------------------

const FIXTURE: JobCardDTO[] = [
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
    skills: ["react", "typescript", "next.js"],
    postedAt: "2026-06-18T00:00:00Z",
    snippet: "Build the Aptura candidate experience in Next.js + React.",
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
    skills: ["go", "mongodb", "grpc"],
    postedAt: "2026-06-17T00:00:00Z",
    snippet: "Scale the funnel services behind the marketplace.",
  },
  {
    jobId: "3",
    title: "Product Designer",
    companyName: "Lumen Labs",
    companyId: "c2",
    location: "London",
    remoteMode: "onsite",
    employmentType: "full_time",
    salaryMin: 80000,
    salaryMax: 110000,
    salaryCurrency: "GBP",
    skills: ["figma", "design-systems"],
    postedAt: "2026-06-16T00:00:00Z",
    snippet: "Own the violet/dark token system end to end.",
  },
  {
    jobId: "4",
    title: "Data Engineer",
    companyName: "Lumen Labs",
    companyId: "c2",
    location: "Remote (US)",
    remoteMode: "remote",
    employmentType: "contract",
    salaryMin: 0,
    salaryMax: 0,
    salaryCurrency: "",
    skills: ["python", "airflow", "dbt"],
    postedAt: "2026-06-15T00:00:00Z",
    snippet: "Build the data pipelines powering anti-ghosting signals.",
  },
  {
    jobId: "5",
    title: "Engineering Manager",
    companyName: "Atlas Robotics",
    companyId: "c3",
    location: "Munich",
    remoteMode: "hybrid",
    employmentType: "full_time",
    salaryMin: 140000,
    salaryMax: 180000,
    salaryCurrency: "EUR",
    skills: ["leadership", "hiring"],
    postedAt: "2026-06-14T00:00:00Z",
    snippet: "Lead a team building proctored interview infrastructure.",
  },
  {
    jobId: "6",
    title: "Junior QA Engineer",
    companyName: "Atlas Robotics",
    companyId: "c3",
    location: "Remote (EU)",
    remoteMode: "remote",
    employmentType: "internship",
    salaryMin: 45000,
    salaryMax: 55000,
    salaryCurrency: "EUR",
    skills: ["playwright", "typescript"],
    postedAt: "2026-06-13T00:00:00Z",
    snippet: "Help us keep the candidate experience fast and accessible.",
  },
];

const facetsOf = (jobs: JobCardDTO[]) => {
  const tally = (pick: (j: JobCardDTO) => string): FacetBucket[] => {
    const counts = new Map<string, number>();
    for (const j of jobs) {
      const v = pick(j);
      if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [...counts].map(([value, count]) => ({ value, count }));
  };
  return {
    remoteMode: tally((j) => j.remoteMode),
    employmentType: tally((j) => j.employmentType),
    // No experience level on the card DTO yet — empty until the extend-Job step.
    experienceLevel: [] as FacetBucket[],
  };
};

/** Mock that filters the fixture by the active params so the UI behaves end-to-end
 * (search narrows, facet checkboxes filter) before the real endpoint lands. */
export function makeMockSearchClient() {
  return async (p: SearchJobsParams): Promise<SearchJobsResult> => {
    const needle = p.q?.toLowerCase();
    const matched = FIXTURE.filter((j) => {
      if (needle && !`${j.title} ${j.companyName} ${j.snippet}`.toLowerCase().includes(needle))
        return false;
      if (p.location && !j.location.toLowerCase().includes(p.location.toLowerCase()))
        return false;
      if (p.remote && j.remoteMode !== p.remote) return false;
      if (p.type && j.employmentType !== p.type) return false;
      if (p.skills?.length && !p.skills.every((s) => j.skills.includes(s))) return false;
      return true;
    });
    // Slice to the requested page so the mock mirrors the real paged endpoint
    // (total = full match count; jobs = just this page).
    const page = p.page ?? 1;
    const pageSize = p.pageSize ?? 24;
    const start = (page - 1) * pageSize;
    return {
      jobs: matched.slice(start, start + pageSize),
      // Facets reflect the full catalog (so toggling one filter doesn't make the
      // others vanish) — same semantics a `$facet` aggregation gives server-side.
      facets: facetsOf(FIXTURE),
      total: matched.length,
      page,
      pageSize,
    };
  };
}

export const USE_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";

/** The client the screen actually calls — real fetch, or the mock under NEXT_PUBLIC_MOCK. */
export const query: (p: SearchJobsParams, signal?: AbortSignal) => Promise<SearchJobsResult> =
  USE_MOCK ? makeMockSearchClient() : searchJobs;
