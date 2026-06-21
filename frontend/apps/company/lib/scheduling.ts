// Scheduling scaffold lives in @ip/shared now (lifted, byte-identical). This file keeps the
// company-specific deltas — `MAX_SLOTS` and a `schedulingClient(api)` that bakes in the company
// `cancelledBy` — so existing imports (`schedule-panel.tsx`) resolve unchanged.
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

/** Company-only: the recruiter's propose form caps the offered slot set at this many. */
export const MAX_SLOTS = 10;

/** Company-bound client: a mock cancellation is attributed to the company. */
export function schedulingClient(api: unknown) {
  return sharedSchedulingClient(api, "company");
}
