import type { SavedJobDTO, SavedJobsClient } from "../app/saved/types.js";

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

/** In-memory saved-jobs client for building the screen before `api.savedJobs` lands. */
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

// Real adapter — wired after `pnpm gen` exposes api.savedJobs (snake→camel via proto-es).
// import type { ApiClients } from "@ip/api-client";
// export function makeApiSavedJobsClient(api: ApiClients): SavedJobsClient {
//   return {
//     list: async () => (await api.savedJobs.listSavedJobs({})).jobs as unknown as SavedJobDTO[],
//     save: async (jobId) => void (await api.savedJobs.saveJob({ jobId })),
//     unsave: async (jobId) => void (await api.savedJobs.unsaveJob({ jobId })),
//   };
// }

export const USE_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";
// Swap to makeApiSavedJobsClient(api) once `pnpm gen` exposes api.savedJobs.
export const savedJobsClient = makeMockSavedJobsClient();
