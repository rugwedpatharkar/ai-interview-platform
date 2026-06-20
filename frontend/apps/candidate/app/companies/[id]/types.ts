// Public company-profile contract shapes. The job list reuses the shared
// `JobCardDTO` (re-exported from the jobs route) so the grid is identical to search.

import type { JobCardDTO } from "../../jobs/types";

export interface TrustSignals {
  activelyReviewing: boolean;
  respondsInDays: number; // 0 → FE hides the "responds in ~X" chip (insufficient data)
  openJobs: number;
}

export interface CompanyProfileDTO {
  id: string;
  name: string;
  about: string | null;
  website: string | null;
  logo: string | null;
  locations: string[];
  trust: TrustSignals;
}

export interface CompanyJobsResult {
  jobs: JobCardDTO[];
  total: number;
  page: number;
  pageSize: number;
}
