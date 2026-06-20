// Typed shape for the extended job form. The current `api.jobs.createJob` only accepts
// `{ title, jdText }`; the marketplace fields below (location/remote/employment/salary/
// skills/gate_mode) + `UpdateJob` are NOT in the proto yet. The form codes against this
// shape now; when `pnpm gen` widens `job_pb.ts`, only the submit adapter (`toCreateRequest`)
// changes — the form component stays put.

export type RemoteMode = "remote" | "hybrid" | "onsite";
export type EmploymentType = "full_time" | "contract" | "internship";
export type GateMode = "auto" | "advisory";

export interface JobFormValues {
  title: string;
  jdText: string;
  city: string;
  region: string;
  country: string;
  remoteMode: RemoteMode | ""; // "" = unset (renders as placeholder)
  employmentType: EmploymentType | "";
  salaryMin: string; // form state is string; coerced to int64 at submit
  salaryMax: string;
  salaryCurrency: string;
  skills: string[]; // parsed from a comma-separated Input
  gateMode: GateMode; // never "" — defaults to "auto" (proctored platform)
}

export const EMPTY_JOB_FORM: JobFormValues = {
  title: "",
  jdText: "",
  city: "",
  region: "",
  country: "",
  remoteMode: "",
  employmentType: "",
  salaryMin: "",
  salaryMax: "",
  salaryCurrency: "USD",
  skills: [],
  gateMode: "auto",
};
