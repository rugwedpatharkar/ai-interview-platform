// The no-ghosting KPI shape the dashboard codes against until Analytics.GetNoGhostingKpis
// is generated. Mirrors the proto contract in
// docs/superpowers/plans/v2-screens/recruiter-dashboard.md §A. After `pnpm gen`, the real
// NoGhostingKpis message (bigints) maps onto this DTO with Number(...) widening.
export interface NoGhostingKpisDTO {
  outcomeRate: number; // 0..1
  openNoOutcome: number;
  avgResponseHours: number;
  medianResponseHours: number;
  totalApplicants: number;
  windowDays: number;
}
