// Marketplace search contract shapes. `JobCardDTO` is the shared marketplace card
// shape — it already lives in `app/saved/types.ts` (defined there first so /saved
// could render with the same JobCard). We re-export it here so the jobs route reads
// as the canonical owner without duplicating the interface.

export type { JobCardDTO } from "../saved/types";
import type { JobCardDTO } from "../saved/types";

export type RemoteMode = "remote" | "hybrid" | "onsite";

export interface FacetBucket {
  value: string;
  count: number;
}

export interface SearchJobsResult {
  jobs: JobCardDTO[];
  facets: {
    remoteMode: FacetBucket[];
    employmentType: FacetBucket[];
    experienceLevel: FacetBucket[];
  };
  total: number;
  page: number;
  pageSize: number;
}

export interface SearchJobsParams {
  q?: string;
  location?: string;
  remote?: RemoteMode;
  type?: string;
  level?: string;
  skills?: string[];
  sort?: "relevance" | "recent";
  page?: number;
  pageSize?: number;
}
