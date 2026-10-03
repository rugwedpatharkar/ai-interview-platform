// Shared form shape for the candidate-side company create + edit job screens.
// createJob now accepts the full marketplace field set (city/region/country/
// remote/employment/salary/skills/gate_mode) via the widened proto — the earlier
// submit adapter dropped everything except title, jdText, and skills, so a
// recruiter's location, salary band, and gate choice all vanished silently.
// updateJob still isn't in the proto; the edit screen keeps its shape here.

export type RemoteMode = "remote" | "hybrid" | "onsite";
export type EmploymentType = "full_time" | "contract" | "internship";
export type GateMode = "auto" | "advisory";

export interface JobFormValues {
  title: string;
  jdText: string;
  city: string;
  region: string;
  country: string;
  remoteMode: RemoteMode | "";
  employmentType: EmploymentType | "";
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  skills: string[];
  gateMode: GateMode;
  rubricNotes: string;
  interviewDurationMins: string;
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
  rubricNotes: "",
  interviewDurationMins: "30",
};

export function parseSkills(raw: string): string[] {
  const seen = new Set<string>();
  for (const s of raw
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean))
    seen.add(s);
  return [...seen];
}

/** Build the `JobFormValues` shape from a `Job` response — used by the edit screen.
 *  Casts through `Record<string, unknown>` because the proto type doesn't yet carry
 *  the marketplace fields. */
export function jobToFormValues(job: Record<string, unknown>): JobFormValues {
  const aptitude = (job.aptitudeConfig as { gateMode?: string } | undefined) ?? {};
  const gate = (aptitude.gateMode ?? "auto") as GateMode;
  const skillsRaw = job.skills as string[] | undefined;
  return {
    title: (job.title as string) ?? "",
    jdText: (job.jdText as string) ?? "",
    city: (job.city as string) ?? "",
    region: (job.region as string) ?? "",
    country: (job.country as string) ?? "",
    remoteMode: ((job.remoteMode as RemoteMode) ?? "") as JobFormValues["remoteMode"],
    employmentType: ((job.employmentType as EmploymentType) ?? "") as JobFormValues["employmentType"],
    salaryMin: salaryString(job.salaryMin),
    salaryMax: salaryString(job.salaryMax),
    salaryCurrency: (job.salaryCurrency as string) ?? "USD",
    skills: skillsRaw ?? [],
    gateMode: gate === "advisory" ? "advisory" : "auto",
    rubricNotes: (job.rubricNotes as string) ?? "",
    interviewDurationMins: String((job.interviewDurationMins as number | bigint | undefined) ?? 30),
  };
}

function salaryString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "bigint") return v === 0n ? "" : v.toString();
  if (typeof v === "number") return v === 0 ? "" : String(v);
  if (typeof v === "string") return v === "0" ? "" : v;
  return "";
}
