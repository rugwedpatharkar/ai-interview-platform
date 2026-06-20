// Scheduling scaffold lives in @ip/shared now (lifted, byte-identical). This file keeps the
// candidate-specific deltas — the `candidateListQueryKey` and a `schedulingClient(api)` that
// bakes in the candidate `cancelledBy` — so existing imports (`use-schedule.ts`, the schedule
// page) resolve unchanged.
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
