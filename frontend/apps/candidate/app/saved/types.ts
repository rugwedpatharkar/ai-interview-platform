// Saved-jobs contract shapes. The FE codes against these until `pnpm gen` exposes
// `api.savedJobs`; the binding (lib/saved-jobs-client.ts) then becomes a thin adapter.
//
// `JobCardDTO` is the shared marketplace card shape. The marketplace plan owns the
// canonical `app/jobs/types.ts`; it isn't generated yet, so we define the shape here
// (SavedJobDTO extends it) so the /saved list renders with the same JobCard as search.

export interface JobCardDTO {
  jobId: string;
  title: string;
  companyName: string;
  companyId: string;
  location: string; // "" when unset
  remoteMode: "remote" | "hybrid" | "onsite" | "";
  employmentType: string; // "" when unset
  salaryMin: number;
  salaryMax: number;
  salaryCurrency: string;
  skills: string[];
  postedAt: string; // ISO
  snippet: string; // first ~160 chars of jd
}

export interface SavedJobDTO extends JobCardDTO {
  savedAt: string; // ISO
}

export interface SavedJobsClient {
  list(): Promise<SavedJobDTO[]>;
  save(jobId: string): Promise<void>;
  unsave(jobId: string): Promise<void>;
}
