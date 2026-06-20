// Public job-detail contract shape. The SSR page codes against this via
// `getPublicJobDetail(id)` in `detail-client.ts`; when the extended
// `GetPublicJobDetail` / `GET /public/jobs/{id}` lands, only that fetch swaps.

export type RemoteMode = "remote" | "hybrid" | "onsite";
export type EmploymentType = "full_time" | "part_time" | "contract" | "internship";

export interface PublicCompany {
  id: string;
  name: string;
  logo: string | null;
}

export interface JobDetailDTO {
  jobId: string;
  title: string;
  jdText: string;
  location: string | null;
  remoteMode: RemoteMode | null;
  employmentType: EmploymentType | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  skills: string[];
  postedAt: string; // ISO
  company: PublicCompany;
}
