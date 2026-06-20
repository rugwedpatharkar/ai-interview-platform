// Saved-jobs transport. Real gRPC client wraps `api.savedJobs.*` (admin); in-memory mock is
// kept so NEXT_PUBLIC_MOCK=1 and the test harness (saved-jobs-client.test.ts) still build.
//
// Wired 2026-06-21 — `api.savedJobs.*` is live. The proto `SavedJob` carries
// `salaryMin/Max: bigint` (int64); the SavedJobDTO uses `number`, so the adapter coerces with
// Number(...) — saved jobs live in user-mode currencies, never anywhere near 2^53.
//
// Singleton → hook: pages used to import `savedJobsClient` from module-eval time. The hook
// `useSavedJobsClient()` lets us read `api` at React render time. Consumers grab it once at
// the top of the component and use it byte-identically to the old singleton.

import { useMemo } from "react";

import type { SavedJob as ProtoSavedJob } from "@ip/api-client";
import type { SavedJobDTO, SavedJobsClient } from "../app/saved/types.js";
import { useAuth } from "./auth";

const FIXTURES: SavedJobDTO[] = [
  {
    jobId: "1",
    title: "Senior Frontend Engineer",
    companyName: "Northwind",
    companyId: "c1",
    location: "Remote",
    remoteMode: "remote",
    employmentType: "full_time",
    salaryMin: 120000,
    salaryMax: 160000,
    salaryCurrency: "USD",
    skills: ["react", "typescript"],
    postedAt: "2026-06-18T00:00:00Z",
    snippet: "Own the marketplace UI…",
    savedAt: "2026-06-19T00:00:00Z",
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
    snippet: "Scale the funnel services…",
    savedAt: "2026-06-19T00:00:00Z",
  },
];

// Template for a job saved from outside the seeded fixtures (e.g. saved from the
// marketplace mock): a plausible card the /saved list can render until the real
// api.savedJobs join supplies the actual card fields.
const SAVED_TEMPLATE: Omit<SavedJobDTO, "jobId" | "savedAt"> = {
  title: "Saved role",
  companyName: "Northwind",
  companyId: "c1",
  location: "Remote",
  remoteMode: "remote",
  employmentType: "full_time",
  salaryMin: 100000,
  salaryMax: 140000,
  salaryCurrency: "USD",
  skills: [],
  postedAt: "2026-06-18T00:00:00Z",
  snippet: "",
};

/** In-memory saved-jobs client for the test harness + NEXT_PUBLIC_MOCK=1 local dev. */
export function makeMockSavedJobsClient(): SavedJobsClient {
  const saved = new Map<string, SavedJobDTO>(FIXTURES.map((j) => [j.jobId, j]));
  const byId = new Map<string, SavedJobDTO>(FIXTURES.map((j) => [j.jobId, j]));
  return {
    list: async () =>
      [...saved.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
    save: async (jobId) => {
      const savedAt = new Date().toISOString();
      const existing = byId.get(jobId);
      const job: SavedJobDTO = existing
        ? { ...existing, savedAt }
        : { ...SAVED_TEMPLATE, jobId, savedAt };
      saved.set(jobId, job);
    },
    unsave: async (jobId) => void saved.delete(jobId),
  };
}

type Api = ReturnType<typeof useAuth>["api"];

/** SavedJob (proto, int64 salaries) → SavedJobDTO (number). Saved jobs are user-scoped
 *  marketplace cards — coercing bigint → number is safe well past any plausible salary. */
function mapSavedJob(j: ProtoSavedJob): SavedJobDTO {
  return {
    jobId: j.jobId,
    title: j.title,
    companyName: j.companyName,
    companyId: j.companyId,
    location: j.location,
    remoteMode: j.remoteMode as SavedJobDTO["remoteMode"],
    employmentType: j.employmentType,
    salaryMin: Number(j.salaryMin),
    salaryMax: Number(j.salaryMax),
    salaryCurrency: j.salaryCurrency,
    skills: j.skills,
    postedAt: j.postedAt,
    snippet: j.snippet,
    savedAt: j.savedAt,
  };
}

/** Real gRPC client over `api.savedJobs.*`. */
export function makeApiSavedJobsClient(api: Api): SavedJobsClient {
  return {
    list: async () => (await api.savedJobs.listSavedJobs({})).jobs.map(mapSavedJob),
    save: async (jobId) => void (await api.savedJobs.saveJob({ jobId })),
    unsave: async (jobId) => void (await api.savedJobs.unsaveJob({ jobId })),
  };
}

export const USE_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";

/** Hook: per-render memoized client. The page, SaveJobButton, and useSavedSet hook all call
 *  this and treat the returned object exactly the way the old `savedJobsClient` singleton
 *  was used — preserves the optimistic `["saved-jobs","ids"]` flip + rollback + invalidate
 *  pattern in SaveJobButton (the cache key map lives in the consumers). */
export function useSavedJobsClient(): SavedJobsClient {
  const { api } = useAuth();
  return useMemo(
    () => (USE_MOCK ? makeMockSavedJobsClient() : makeApiSavedJobsClient(api)),
    [api],
  );
}
