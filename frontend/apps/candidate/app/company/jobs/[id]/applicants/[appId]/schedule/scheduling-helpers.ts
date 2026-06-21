// Company-bound scheduling helper inside the candidate app. Mirrors the recruiter
// app's lib/scheduling.ts so the same `schedulingClient(api)` API is available, but
// stays scoped to this route so we don't pollute the candidate's top-level lib/.
import { schedulingClient as sharedSchedulingClient } from "@ip/shared";

export {
  scheduleQueryKey,
  type ScheduleDTO,
  type ProposedSlot,
  type SchedulingClient,
} from "@ip/shared";

/** Cap on the number of proposed slots offered in a single request. */
export const MAX_SLOTS = 10;

/** Company-bound client: mock cancellations are attributed to the company. */
export function schedulingClient(api: unknown) {
  return sharedSchedulingClient(api, "company");
}
