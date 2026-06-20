// Job-alerts contract shapes. The FE codes against these until `pnpm gen` exposes
// `api.jobAlerts`; the binding (lib/job-alerts-client.ts) then becomes a thin adapter.
// An alert is a persisted SearchJobsParams (marketplace search) plus a frequency.

export type AlertFrequency = "daily" | "weekly";

export interface AlertFilters {
  location?: string;
  remoteMode?: "remote" | "hybrid" | "onsite";
  employmentType?: string;
  experienceLevel?: string;
  skills?: string[];
}

export interface JobAlertDTO {
  alertId: string;
  keyword: string;
  filters: AlertFilters;
  frequency: AlertFrequency;
  createdAt: string; // ISO
  lastRunAt: string | null; // null → "Never run yet"
}

export interface CreateAlertInput {
  keyword: string;
  filters: AlertFilters;
  frequency: AlertFrequency;
}

export interface JobAlertsClient {
  list(): Promise<JobAlertDTO[]>;
  create(input: CreateAlertInput): Promise<JobAlertDTO>;
  remove(alertId: string): Promise<void>;
}
