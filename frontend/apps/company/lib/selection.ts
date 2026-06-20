import type { ApplicantRow } from "../app/jobs/[id]/pipeline-types";

// States a recruiter can decide on in bulk. assessment_review is included — a batch reject
// of advisory-held candidates is a legal recruiter.decision(rejected) per applicant.
const DECIDABLE = new Set(["scored", "shortlisted", "assessment_review"]);

export const selectableIds = (rows: Pick<ApplicantRow, "applicationId" | "state">[]) =>
  rows.filter((r) => DECIDABLE.has(r.state)).map((r) => r.applicationId);

export function toggle(sel: Set<string>, id: string): Set<string> {
  const next = new Set(sel);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function toggleAll(
  sel: Set<string>,
  rows: Pick<ApplicantRow, "applicationId" | "state">[],
): Set<string> {
  const ids = selectableIds(rows);
  return ids.every((id) => sel.has(id)) ? new Set() : new Set(ids);
}
