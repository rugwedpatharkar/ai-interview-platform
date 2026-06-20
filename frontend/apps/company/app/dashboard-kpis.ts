import type { KpiCardProps } from "../components/kpi-card";

import type { NoGhostingKpisDTO } from "./dashboard-types";

export const formatPct = (r: number) => `${Math.round(r * 100)}%`;

// Hours under a day read as "6h"; a day or more reads as "1.3d".
export const formatHours = (h: number) =>
  h < 24 ? `${Math.round(h)}h` : `${(h / 24).toFixed(1)}d`;

// Outcome rate drives the tile tone: strong (≥90%) is positive, mid is neutral,
// anything lower flags the ghosting-risk surface as a warning.
export const kpiTone = (outcomeRate: number): NonNullable<KpiCardProps["tone"]> =>
  outcomeRate >= 0.9 ? "positive" : outcomeRate >= 0.75 ? "default" : "warning";

// Mock until GetNoGhostingKpis lands. Real binding (after `pnpm gen`):
//   api.analytics.getNoGhostingKpis({ windowDays: 30 }) → widen bigints with Number(...).
export function makeMockKpis(): NoGhostingKpisDTO {
  return {
    outcomeRate: 0.92,
    openNoOutcome: 4,
    avgResponseHours: 18,
    medianResponseHours: 12,
    totalApplicants: 137,
    windowDays: 30,
  };
}
