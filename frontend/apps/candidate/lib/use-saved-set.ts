import { useQuery } from "@tanstack/react-query";

import { useAuth } from "./auth.js";
import { useSavedJobsClient } from "./saved-jobs-client.js";

/** A Set of saved job ids — backs SaveJobButton's `isSaved` without re-listing per card. */
export function useSavedSet() {
  const { token } = useAuth();
  const savedJobsClient = useSavedJobsClient();
  const q = useQuery({
    queryKey: ["saved-jobs", "ids"],
    queryFn: async () => new Set((await savedJobsClient.list()).map((j) => j.jobId)),
    enabled: Boolean(token), // signed-out → no fetch; SaveJobButton renders null
  });
  return q.data ?? new Set<string>();
}
