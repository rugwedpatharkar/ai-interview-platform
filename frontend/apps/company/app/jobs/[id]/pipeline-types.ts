// Pipeline view-model shapes. `GateMode` is re-exported from the job-form types (the one
// source) so the create form, Settings tab, and pipeline agree on the value set.
export type { GateMode } from "../job-form-types";

// The fields the pipeline actually reads off ApplicationResponse (a structural subset, so
// the batch/selection code is testable without the generated type). Real rows satisfy this.
export interface ApplicantRow {
  applicationId: string;
  candidateUserId: string;
  state: string; // funnel state, incl. "assessment_review"
}

// Batch decision request (fan-out over DecideApplication; no new RPC).
export interface BatchOutcome {
  applicationIds: string[];
  outcome: "shortlisted" | "hired" | "rejected";
}
