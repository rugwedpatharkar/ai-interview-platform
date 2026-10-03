// Job-alerts transport. Real gRPC client wraps `api.jobAlerts.*` (admin); in-memory mock is
// kept so NEXT_PUBLIC_MOCK=1 and the test harness (job-alerts-client.test.ts) still build.
//
// Wired 2026-06-21 — `api.jobAlerts.*` is live. An alert is a persisted SearchJobsParams
// (keyword + filters) plus a frequency; the FE never triggers a run, the BE sweep does.
//
// Singleton → hook: pages used to import `jobAlertsClient` from module-eval time. The hook
// `useJobAlertsClient()` reads `api` at React render time and is treated byte-identically.

import { useMemo } from "react";

import type {
  AlertFilters as ProtoAlertFilters,
  JobAlert as ProtoJobAlert,
} from "@ip/api-client";
import type {
  AlertFilters,
  AlertFrequency,
  CreateAlertInput,
  JobAlertDTO,
  JobAlertsClient,
} from "../app/alerts/types.js";
import { useAuth } from "./auth";

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

/** In-memory job-alerts client for the test harness + NEXT_PUBLIC_MOCK=1 local dev. */
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

// "" → null (proto sends "" for ISO sweep timestamps that haven't run yet).
const nz = (s: string): string | null => (s.length ? s : null);

// proto AlertFilters has all-string fields (empty string when absent); the DTO uses
// optional + a narrow union for remoteMode. Strip empties so the summary helper / UI
// doesn't render empty pills.
function mapFilters(f: ProtoAlertFilters | undefined): AlertFilters {
  if (!f) return {};
  const out: AlertFilters = {};
  if (f.location) out.location = f.location;
  if (f.remoteMode) out.remoteMode = f.remoteMode as AlertFilters["remoteMode"];
  if (f.employmentType) out.employmentType = f.employmentType;
  if (f.experienceLevel) out.experienceLevel = f.experienceLevel;
  if (f.skills.length) out.skills = f.skills;
  return out;
}

function mapAlert(a: ProtoJobAlert): JobAlertDTO {
  return {
    alertId: a.alertId,
    keyword: a.keyword,
    filters: mapFilters(a.filters),
    frequency: a.frequency as AlertFrequency,
    createdAt: a.createdAt,
    lastRunAt: nz(a.lastRunAt),
  };
}

// CreateAlertInput → proto request init shape. Empty filter object → undefined so the server
// gets a canonical no-filter alert (the server's `filters` is optional). protobuf-es accepts
// plain object literals at the call boundary; $typeName is optional in MessageInit.
function toProtoFilters(f: AlertFilters):
  | {
      location?: string;
      remoteMode?: string;
      employmentType?: string;
      experienceLevel?: string;
      skills?: string[];
    }
  | undefined {
  if (
    !f.location &&
    !f.remoteMode &&
    !f.employmentType &&
    !f.experienceLevel &&
    !f.skills?.length
  ) {
    return undefined;
  }
  return {
    location: f.location ?? "",
    remoteMode: f.remoteMode ?? "",
    employmentType: f.employmentType ?? "",
    experienceLevel: f.experienceLevel ?? "",
    skills: f.skills ?? [],
  };
}

import type { ApiClients } from "@ip/api-client";
type Api = ApiClients;

/** Real gRPC client over `api.jobAlerts.*`. The sweep is BE-owned; the FE only CRUD-s the
 *  alert definition. */
export function makeApiJobAlertsClient(api: Api): JobAlertsClient {
  return {
    list: async () => (await api.jobAlerts.listAlerts({})).alerts.map(mapAlert),
    create: async (input: CreateAlertInput): Promise<JobAlertDTO> => {
      const a = await api.jobAlerts.createAlert({
        keyword: input.keyword,
        filters: toProtoFilters(input.filters),
        frequency: input.frequency,
      });
      return mapAlert(a);
    },
    remove: async (alertId: string) => void (await api.jobAlerts.deleteAlert({ alertId })),
  };
}

export const USE_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";

/** Hook: per-render memoized client. Used by /alerts page mutations; the ALREADY_EXISTS
 *  friendly-path stays a page concern (use `isCode(err, Code.AlreadyExists)` in onError). */
export function useJobAlertsClient(): JobAlertsClient {
  const { api } = useAuth();
  return useMemo(
    () => (USE_MOCK ? makeMockJobAlertsClient() : makeApiJobAlertsClient(api)),
    [api],
  );
}
