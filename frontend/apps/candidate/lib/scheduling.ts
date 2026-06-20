// Scheduling scaffold lives in @ip/shared now (lifted, byte-identical). This file keeps the
// candidate-specific deltas — the `candidateListQueryKey` and a `schedulingClient(api)` that
// bakes in the candidate `cancelledBy` — so existing imports (`use-schedule.ts`, the schedule
// page) resolve unchanged.
//
// Wiring (2026-06-21): @ip/shared's `schedulingClient(api, role)` returns the gRPC-backed
// `createSchedulingClient(api)` by default (`NEXT_PUBLIC_MOCK !== "1"`), which delegates to
// `api.scheduling.*` on the admin transport. The mock path remains gated behind the env flag.
import { schedulingClient as sharedSchedulingClient } from "@ip/shared";

export {
  createSchedulingClient,
  makeMockSchedulingClient,
  scheduleQueryKey,
  type BookingStatus,
  type ProposedSlot,
  type ScheduleDTO,
  type IcsResponse,
  type SchedulingClient,
} from "@ip/shared";

/** Candidate-only key: the "my upcoming interviews" list, invalidated on choose/cancel. */
export const candidateListQueryKey = () => ["scheduling", "candidate-interviews"] as const;

/** Candidate-bound client: a mock cancellation is attributed to the candidate. */
export function schedulingClient(api: unknown) {
  return sharedSchedulingClient(api, "candidate");
}
