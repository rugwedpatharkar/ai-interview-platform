import type {
  CreateAlertInput,
  JobAlertDTO,
  JobAlertsClient,
} from "../app/alerts/types.js";

/** Compact human summary of a saved search, e.g. `"react" · remote · ts, react`. */
export function summarizeAlert(a: JobAlertDTO): string {
  const parts: string[] = [];
  if (a.keyword) parts.push(`"${a.keyword}"`);
  if (a.filters.remoteMode) parts.push(a.filters.remoteMode);
  if (a.filters.location) parts.push(a.filters.location);
  if (a.filters.employmentType) parts.push(a.filters.employmentType.replace("_", " "));
  if (a.filters.experienceLevel) parts.push(a.filters.experienceLevel);
  if (a.filters.skills?.length) parts.push(a.filters.skills.join(", "));
  return parts.length ? parts.join(" · ") : "All jobs";
}

let seq = 100;
const SEED: JobAlertDTO[] = [
  {
    alertId: "a1",
    keyword: "frontend",
    frequency: "daily",
    createdAt: "2026-06-18T00:00:00Z",
    lastRunAt: "2026-06-19T06:00:00Z",
    filters: { remoteMode: "remote", skills: ["react", "typescript"] },
  },
];

/** In-memory job-alerts client for building the screen before `api.jobAlerts` lands. */
export function makeMockJobAlertsClient(): JobAlertsClient {
  const alerts: JobAlertDTO[] = [...SEED];
  return {
    list: async () =>
      [...alerts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    create: async (input: CreateAlertInput) => {
      const a: JobAlertDTO = {
        alertId: `a${++seq}`,
        ...input,
        createdAt: new Date().toISOString(),
        lastRunAt: null,
      };
      alerts.unshift(a);
      return a;
    },
    remove: async (alertId: string) => {
      const i = alerts.findIndex((x) => x.alertId === alertId);
      if (i >= 0) alerts.splice(i, 1);
    },
  };
}

// Real adapter — wired after `pnpm gen` exposes api.jobAlerts.
// import type { ApiClients } from "@ip/api-client";
// export function makeApiJobAlertsClient(api: ApiClients): JobAlertsClient {
//   return {
//     list: async () => (await api.jobAlerts.listAlerts({})).alerts as unknown as JobAlertDTO[],
//     create: async (input) => (await api.jobAlerts.createAlert(input)) as unknown as JobAlertDTO,
//     remove: async (alertId) => void (await api.jobAlerts.deleteAlert({ alertId })),
//   };
// }

export const USE_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";
// Swap to makeApiJobAlertsClient(api) once `pnpm gen` exposes api.jobAlerts.
export const jobAlertsClient = makeMockJobAlertsClient();
